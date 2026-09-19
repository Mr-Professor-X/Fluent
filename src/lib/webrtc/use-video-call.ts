'use client';

/**
 * Two-way camera link between two people in a room.
 * Based on Kevin's Lovable prototype ("perfect negotiation"), with signalling over Fluid's Socket.IO server.
 *
 * Reliability fixes over the prototype:
 * - ICE candidates that arrive before the offer/answer are queued instead of dropped.
 * - Camera off/on reuses the same video slot (replaceTrack), so no renegotiation glitches.
 * - A refreshed or rejoined tab resets the old connection on both sides.
 * - Camera on/off state is announced, so the other side shows a placeholder instead of a frozen frame.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }];

type Signal =
  | { kind: 'hello'; camera: boolean }
  | { kind: 'welcome'; camera: boolean }
  | { kind: 'camera'; on: boolean }
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export function useVideoCall(socket: Socket | null, joined: boolean, conversationId: string, myId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteCameraOn, setRemoteCameraOn] = useState(false);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const send = useCallback((signal: Signal) => {
    socket?.emit('rtc:signal', { conversationId, signal });
  }, [socket, conversationId]);

  const closePc = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    pendingIceRef.current = [];
    setRemoteStream(null);
  }, []);

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;

    pc.onicecandidate = event => { if (event.candidate) send({ kind: 'ice', candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      // Streams can be missing when the track rides on a reused slot, so build one if needed.
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      if (pc.connectionState === 'closed') setRemoteStream(null);
    };
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send({ kind: 'offer', sdp: pc.localDescription });
      } catch (error) {
        console.error('[video] offer failed', error);
      } finally {
        makingOfferRef.current = false;
      }
    };

    const stream = localRef.current;
    if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
    return pc;
  }, [send]);

  const flushIce = async (pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {});
  };

  /* ---------- signalling ---------- */
  useEffect(() => {
    if (!socket || !joined) return;

    const onSignal = async ({ from, signal }: { from: string; signal: Signal }) => {
      if (!signal || from === myId) return;

      if (signal.kind === 'hello') {
        // Someone (re)joined. Start fresh with them so no stale connection is left behind.
        if (peerRef.current && peerRef.current !== from && pcRef.current) return; // already linked to someone else
        closePc();
        peerRef.current = from;
        setRemoteId(from);
        setRemoteCameraOn(signal.camera);
        send({ kind: 'welcome', camera: !!localRef.current });
        if (localRef.current) ensurePc();
        return;
      }
      if (peerRef.current && peerRef.current !== from) return; // this prototype links two people
      peerRef.current = from;
      setRemoteId(from);

      if (signal.kind === 'welcome') {
        // Reply to our hello: any connection we had before this is stale.
        closePc();
        setRemoteCameraOn(signal.camera);
        if (localRef.current) ensurePc();
        return;
      }
      if (signal.kind === 'camera') {
        setRemoteCameraOn(signal.on);
        return;
      }

      const pc = ensurePc();
      const polite = myId < from;
      try {
        if (signal.kind === 'ice') {
          if (!pc.remoteDescription) pendingIceRef.current.push(signal.candidate);
          else await pc.addIceCandidate(signal.candidate).catch(error => { if (!ignoreOfferRef.current) console.warn('[video] ice', error); });
          return;
        }
        const collision = signal.kind === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');
        ignoreOfferRef.current = !polite && collision;
        if (ignoreOfferRef.current) return;
        await pc.setRemoteDescription(signal.sdp);
        await flushIce(pc);
        if (signal.kind === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) send({ kind: 'answer', sdp: pc.localDescription });
        }
      } catch (error) {
        console.error('[video] signalling error', error);
      }
    };

    const onLeft = ({ userId }: { userId: string }) => {
      if (userId !== peerRef.current) return;
      closePc();
      peerRef.current = null;
      setRemoteId(null);
      setRemoteCameraOn(false);
    };

    socket.on('rtc:signal', onSignal);
    socket.on('participant:left', onLeft);
    send({ kind: 'hello', camera: !!localRef.current });
    return () => {
      socket.off('rtc:signal', onSignal);
      socket.off('participant:left', onLeft);
    };
  }, [socket, joined, myId, ensurePc, closePc, send]);

  /* ---------- camera controls ---------- */
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      const track = stream.getVideoTracks()[0];
      localRef.current = stream;
      setLocalStream(stream);
      setCameraOn(true);
      send({ kind: 'camera', on: true });

      const existing = pcRef.current;
      if (!existing) {
        if (peerRef.current) ensurePc(); // new connection carries the track from the start
        return;
      }
      // Reuse the video slot if there is one; otherwise add a new track (triggers negotiation).
      const slot = existing.getTransceivers().find(t => t.receiver.track.kind === 'video' && t.currentDirection !== 'stopped');
      if (slot) {
        await slot.sender.replaceTrack(track);
        slot.sender.setStreams?.(stream);
        if (slot.direction === 'recvonly' || slot.direction === 'inactive') slot.direction = 'sendrecv';
      } else {
        existing.addTrack(track, stream);
      }
    } catch {
      setCameraError('Camera unavailable. Check your browser permissions, or close other apps using the camera.');
    }
  }, [ensurePc, send]);

  const stopCamera = useCallback(() => {
    localRef.current?.getTracks().forEach(track => track.stop());
    localRef.current = null;
    setLocalStream(null);
    setCameraOn(false);
    send({ kind: 'camera', on: false });
    const pc = pcRef.current;
    // Keep the slot; just send nothing. Turning the camera back on is then instant.
    pc?.getSenders().forEach(sender => { if (sender.track?.kind === 'video') void sender.replaceTrack(null); });
  }, [send]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) stopCamera();
    else await startCamera();
  }, [cameraOn, startCamera, stopCamera]);

  useEffect(() => () => {
    localRef.current?.getTracks().forEach(track => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  return {
    localStream,
    remoteStream: remoteCameraOn ? remoteStream : null,
    remoteId,
    cameraOn,
    cameraError,
    toggleCamera,
  };
}
