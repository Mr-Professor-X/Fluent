'use client';

/**
 * Live voice + camera between everyone in a room (a "mesh": one connection per person).
 *
 * Reliability design:
 * - Sessions: every join gets a random session id. Each connection remembers the other side's session,
 *   and every offer/answer/ICE message says which sessions it belongs to. Crossed or stale messages
 *   (people joining at the same time, refreshes, reconnects) are ignored instead of tearing down a
 *   working connection. This was the cause of "some people can't hear/see each other".
 * - One side (the "impolite" one, by id order) creates exactly one audio slot and one video slot, so a
 *   single offer sets up both directions. Mic/camera on/off only swaps tracks (no renegotiation).
 * - TURN relay (from /api/ice) is used automatically when networks block direct connections.
 * - Each person's state (mic, camera, voice mode, language, voice match) is shared live, so listeners
 *   always make the right real-voice vs AI-voice decision and know which voice to use.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type VoiceMode = 'translated' | 'original';
export type PeerState = {
  camera: boolean;
  mic: boolean;
  voiceMode: VoiceMode;
  language: string;
  /** Set when this person shares a voice match, so listeners can hear translations in their voice. */
  voiceCloneId?: string;
};
export type LinkStatus = 'connecting' | 'connected' | 'relayed' | 'failed';

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

type Envelope = { sid: string; rsid?: string };
type Payload =
  | { kind: 'hello' | 'welcome' | 'state'; state: PeerState }
  | { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };
type Signal = Envelope & Payload;

type Peer = {
  pc: RTCPeerConnection;
  remoteSid: string;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
  audio: RTCRtpTransceiver | null;
  video: RTCRtpTransceiver | null;
  watchdog: ReturnType<typeof setTimeout> | null;
};

const newSid = () => Math.random().toString(36).slice(2, 12);

export function useMediaMesh(
  socket: Socket | null, joined: boolean, conversationId: string, myId: string, voiceMode: VoiceMode, language: string,
) {
  const [localVideo, setLocalVideo] = useState<MediaStream | null>(null);
  const [remoteVideo, setRemoteVideo] = useState<Record<string, MediaStream>>({});
  const [remoteAudio, setRemoteAudio] = useState<Record<string, MediaStream>>({});
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [links, setLinks] = useState<Record<string, LinkStatus>>({});
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [relayAvailable, setRelayAvailable] = useState(false);

  const peers = useRef(new Map<string, Peer>());
  const mySid = useRef(newSid());
  const ice = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const state = useRef<PeerState>({ camera: false, mic: false, voiceMode, language });

  const send = useCallback((signal: Payload & { rsid?: string }, to?: string) => {
    socket?.emit('rtc:signal', { conversationId, to, signal: { ...signal, sid: mySid.current } });
  }, [socket, conversationId]);

  const setLink = (id: string, status: LinkStatus | null) => setLinks(m => {
    const next = { ...m };
    if (status) next[id] = status; else delete next[id];
    return next;
  });

  const closePeer = useCallback((id: string) => {
    const peer = peers.current.get(id);
    if (!peer) return;
    if (peer.watchdog) clearTimeout(peer.watchdog);
    peer.pc.close();
    peers.current.delete(id);
    setRemoteAudio(m => { const next = { ...m }; delete next[id]; return next; });
    setRemoteVideo(m => { const next = { ...m }; delete next[id]; return next; });
    setLink(id, null);
  }, []);

  const createPeer = useCallback((id: string, remoteSid: string) => {
    closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    const peer: Peer = { pc, remoteSid, polite: myId < id, makingOffer: false, ignoreOffer: false, pendingIce: [], audio: null, video: null, watchdog: null };
    peers.current.set(id, peer);
    setLink(id, 'connecting');

    pc.onicecandidate = event => {
      if (event.candidate) send({ kind: 'ice', candidate: event.candidate.toJSON(), rsid: peer.remoteSid }, id);
    };
    pc.ontrack = event => {
      const stream = new MediaStream([event.track]);
      if (event.track.kind === 'audio') setRemoteAudio(m => ({ ...m, [id]: stream }));
      else setRemoteVideo(m => ({ ...m, [id]: stream }));
    };
    pc.onconnectionstatechange = async () => {
      if (peers.current.get(id) !== peer) return;
      if (pc.connectionState === 'connected') {
        if (peer.watchdog) clearTimeout(peer.watchdog);
        setLink(id, await usesRelay(pc) ? 'relayed' : 'connected');
      } else if (pc.connectionState === 'failed') {
        setLink(id, 'failed');
        console.warn(`[media] connection to ${id} failed; retrying through a new network path`);
        pc.restartIce();
      } else if (pc.connectionState === 'disconnected') {
        setLink(id, 'connecting');
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        // Explicit createOffer (instead of the newer implicit form) so older Safari/Edge work too.
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        if (pc.localDescription) send({ kind: 'offer', sdp: pc.localDescription, rsid: peer.remoteSid }, id);
      } catch (error) {
        console.error('[media] offer failed', error);
      } finally {
        peer.makingOffer = false;
      }
    };
    // If nothing connects in 15s, flag it so the UI can explain (usually a network blocking direct links).
    peer.watchdog = setTimeout(() => {
      if (peers.current.get(id) === peer && pc.connectionState !== 'connected') setLink(id, 'failed');
    }, 15_000);

    // Only one side creates the slots, so a single offer sets up voice + video in both directions.
    if (!peer.polite) {
      peer.audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.video = pc.addTransceiver('video', { direction: 'sendrecv' });
      void peer.audio.sender.replaceTrack(micTrack.current);
      void peer.video.sender.replaceTrack(camTrack.current);
    }
    return peer;
  }, [closePeer, myId, send]);

  const broadcastState = useCallback(() => send({ kind: 'state', state: state.current }), [send]);

  /* ---------- signalling ---------- */
  useEffect(() => {
    if (!socket || !joined) return;
    const map = peers.current;
    let cancelled = false;
    mySid.current = newSid(); // new session for every (re)join

    const onSignal = async ({ from, signal }: { from: string; signal: Signal }) => {
      if (!signal || from === myId || typeof signal.sid !== 'string') return;
      const existing = map.get(from);

      switch (signal.kind) {
        case 'state':
          setPeerStates(s => ({ ...s, [from]: signal.state }));
          return;
        case 'hello':
          setPeerStates(s => ({ ...s, [from]: signal.state }));
          // Only (re)build if this is a new session for them; a repeated hello must not break a live call.
          if (existing?.remoteSid !== signal.sid) createPeer(from, signal.sid);
          send({ kind: 'welcome', state: state.current, rsid: signal.sid }, from);
          return;
        case 'welcome':
          if (signal.rsid !== mySid.current) return; // reply to an old hello of ours
          setPeerStates(s => ({ ...s, [from]: signal.state }));
          if (existing?.remoteSid !== signal.sid) createPeer(from, signal.sid);
          return;
      }

      // offer / answer / ice must belong to this exact pair of sessions
      if (signal.rsid !== mySid.current) return;
      let peer = existing;
      if (!peer || peer.remoteSid !== signal.sid) {
        if (signal.kind !== 'offer') return;
        peer = createPeer(from, signal.sid);
      }
      const { pc } = peer;
      try {
        if (signal.kind === 'ice') {
          if (!pc.remoteDescription) peer.pendingIce.push(signal.candidate);
          else await pc.addIceCandidate(signal.candidate).catch(() => {});
          return;
        }
        const description = signal as Envelope & { kind: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit };
        if (description.kind === 'answer' && pc.signalingState !== 'have-local-offer') return; // stale answer
        const collision = description.kind === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        if (collision) await pc.setLocalDescription({ type: 'rollback' }); // polite side yields
        await pc.setRemoteDescription(description.sdp);
        for (const candidate of peer.pendingIce.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
        if (description.kind === 'offer') {
          // Fill the slots the other side created with our own mic and camera, then answer.
          for (const transceiver of pc.getTransceivers()) {
            if (transceiver.currentDirection === 'stopped') continue;
            const kind = transceiver.receiver.track.kind;
            if (kind === 'audio') { peer.audio = transceiver; await transceiver.sender.replaceTrack(micTrack.current); }
            if (kind === 'video') { peer.video = transceiver; await transceiver.sender.replaceTrack(camTrack.current); }
            transceiver.direction = 'sendrecv';
          }
          await pc.setLocalDescription(await pc.createAnswer());
          if (pc.localDescription) send({ kind: 'answer', sdp: pc.localDescription, rsid: peer.remoteSid }, from);
        }
      } catch (error) {
        console.error('[media] signalling error', error);
      }
    };

    const onLeft = ({ userId }: { userId: string }) => {
      closePeer(userId);
      setPeerStates(s => { const next = { ...s }; delete next[userId]; return next; });
    };

    socket.on('rtc:signal', onSignal);
    socket.on('participant:left', onLeft);

    // Get relay (TURN) servers first, then say hello. Never wait more than 3 seconds.
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    Promise.race([
      fetch('/api/ice').then(r => r.json()).then((json: { iceServers?: RTCIceServer[]; relay?: boolean }) => {
        if (json.iceServers?.length) ice.current = json.iceServers;
        setRelayAvailable(!!json.relay);
      }).catch(() => {}),
      timeout,
    ]).then(() => { if (!cancelled) send({ kind: 'hello', state: state.current }); });

    return () => {
      cancelled = true;
      socket.off('rtc:signal', onSignal);
      socket.off('participant:left', onLeft);
      for (const id of [...map.keys()]) closePeer(id);
    };
  }, [socket, joined, myId, createPeer, closePeer, send]);

  /* ---------- local state ---------- */
  useEffect(() => {
    state.current = { ...state.current, voiceMode, language };
    broadcastState();
  }, [voiceMode, language, broadcastState]);

  /** Share (or withdraw) the voice built from this person's own speech. */
  const setVoiceClone = useCallback((voiceCloneId: string | null) => {
    if ((state.current.voiceCloneId ?? null) === voiceCloneId) return;
    state.current = { ...state.current, voiceCloneId: voiceCloneId ?? undefined };
    broadcastState();
  }, [broadcastState]);

  const setMic = useCallback((track: MediaStreamTrack | null) => {
    micTrack.current = track;
    for (const peer of peers.current.values()) void peer.audio?.sender.replaceTrack(track).catch(() => {});
    state.current = { ...state.current, mic: !!track };
    broadcastState();
  }, [broadcastState]);

  const stopCamera = useCallback(() => {
    camStream.current?.getTracks().forEach(track => track.stop());
    camStream.current = null;
    camTrack.current = null;
    setLocalVideo(null);
    setCameraOn(false);
    for (const peer of peers.current.values()) void peer.video?.sender.replaceTrack(null).catch(() => {});
    state.current = { ...state.current, camera: false };
    broadcastState();
  }, [broadcastState]);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      camStream.current = stream;
      camTrack.current = stream.getVideoTracks()[0] ?? null;
      setLocalVideo(stream);
      setCameraOn(true);
      for (const peer of peers.current.values()) void peer.video?.sender.replaceTrack(camTrack.current).catch(() => {});
      state.current = { ...state.current, camera: true };
      broadcastState();
    } catch {
      setCameraError('Camera unavailable. Check your browser permissions, or close other apps using the camera.');
    }
  }, [broadcastState]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) stopCamera();
    else await startCamera();
  }, [cameraOn, startCamera, stopCamera]);

  useEffect(() => () => {
    camStream.current?.getTracks().forEach(track => track.stop());
    for (const peer of peers.current.values()) { if (peer.watchdog) clearTimeout(peer.watchdog); peer.pc.close(); }
    peers.current.clear();
  }, []);

  return { localVideo, remoteVideo, remoteAudio, peerStates, links, relayAvailable, cameraOn, cameraError, toggleCamera, setMic, setVoiceClone };
}

/** True when the live connection goes through a TURN relay (useful for troubleshooting). */
async function usesRelay(pc: RTCPeerConnection) {
  try {
    const stats = await pc.getStats();
    let pairId = '';
    stats.forEach(report => { if (report.type === 'transport' && report.selectedCandidatePairId) pairId = report.selectedCandidatePairId; });
    const pair = pairId ? stats.get(pairId) : null;
    const local = pair ? stats.get(pair.localCandidateId) : null;
    return local?.candidateType === 'relay';
  } catch {
    return false;
  }
}
