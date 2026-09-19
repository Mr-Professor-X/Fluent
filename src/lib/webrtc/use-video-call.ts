'use client';

/**
 * Camera link between two people in a room. Ported from Kevin's Lovable prototype:
 * same "perfect negotiation" logic, but signalling now rides on Fluid's Socket.IO server
 * instead of Supabase. Video only; speech goes through the translation pipeline.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] }];

type Signal =
  | { kind: 'hello' }
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export function useVideoCall(socket: Socket | null, joined: boolean, conversationId: string, myId: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const politeRef = useRef(true);

  const send = useCallback((signal: Signal) => {
    socket?.emit('rtc:signal', { conversationId, signal });
  }, [socket, conversationId]);

  const reset = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    peerRef.current = null;
    setRemoteId(null);
    setRemoteStream(null);
  }, []);

  const ensurePc = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcRef.current = pc;
    pc.onicecandidate = event => { if (event.candidate) send({ kind: 'ice', candidate: event.candidate.toJSON() }); };
    pc.ontrack = event => {
      const stream = event.streams[0] ?? null;
      setRemoteStream(stream);
      event.track.onmute = () => setRemoteStream(null);
      event.track.onunmute = () => setRemoteStream(stream);
      event.track.onended = () => setRemoteStream(null);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') setRemoteStream(null);
    };
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription) send({ kind: 'offer', sdp: pc.localDescription });
      } catch (error) {
        console.error('[video]', error);
      } finally {
        makingOfferRef.current = false;
      }
    };
    const stream = localRef.current;
    if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
    return pc;
  }, [send]);

  useEffect(() => {
    if (!socket || !joined) return;
    const onSignal = async ({ from, signal }: { from: string; signal: Signal }) => {
      if (!signal || from === myId) return;
      // This prototype links two people. Ignore a third person's signals.
      if (peerRef.current && peerRef.current !== from) return;
      peerRef.current = from;
      setRemoteId(from);
      politeRef.current = myId < from;

      if (signal.kind === 'hello') {
        send({ kind: 'hello' });
        if (localRef.current && !politeRef.current) ensurePc();
        return;
      }
      const pc = ensurePc();
      try {
        if (signal.kind === 'ice') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          return;
        }
        const collision = signal.kind === 'offer' && (makingOfferRef.current || pc.signalingState !== 'stable');
        if (collision && !politeRef.current) return;
        if (collision) await pc.setLocalDescription({ type: 'rollback' });
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.kind === 'offer') {
          await pc.setLocalDescription();
          if (pc.localDescription) send({ kind: 'answer', sdp: pc.localDescription });
        }
      } catch (error) {
        console.error('[video]', error);
      }
    };
    const onLeft = ({ userId }: { userId: string }) => { if (userId === peerRef.current) reset(); };
    socket.on('rtc:signal', onSignal);
    socket.on('participant:left', onLeft);
    send({ kind: 'hello' });
    return () => {
      socket.off('rtc:signal', onSignal);
      socket.off('participant:left', onLeft);
    };
  }, [socket, joined, myId, ensurePc, send, reset]);

  const stopCamera = useCallback(() => {
    localRef.current?.getTracks().forEach(track => track.stop());
    localRef.current = null;
    setLocalStream(null);
    setCameraOn(false);
    const pc = pcRef.current;
    if (pc) pc.getSenders().forEach(sender => { if (sender.track) pc.removeTrack(sender); });
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      localRef.current = stream;
      setLocalStream(stream);
      setCameraOn(true);
      const pc = ensurePc();
      for (const track of stream.getTracks()) {
        const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
        if (sender) await sender.replaceTrack(track);
        else pc.addTrack(track, stream);
      }
      send({ kind: 'hello' });
    } catch {
      setCameraError('Camera unavailable. Check your browser permissions.');
    }
  }, [ensurePc, send]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) stopCamera();
    else await startCamera();
  }, [cameraOn, startCamera, stopCamera]);

  useEffect(() => () => {
    localRef.current?.getTracks().forEach(track => track.stop());
    pcRef.current?.close();
    pcRef.current = null;
  }, []);

  return { localStream, remoteStream, remoteId, cameraOn, cameraError, toggleCamera };
}
