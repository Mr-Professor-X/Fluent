'use client';

/**
 * Detects who is talking from their live audio (works in both voice modes).
 * Note: Chrome only feeds remote call audio into Web Audio when the stream is also
 * attached to an <audio> element, which page.tsx always does.
 */
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 0.018;
const HANGOVER_MS = 450;

export function useSpeaking(streams: Record<string, MediaStream | null | undefined>, onRemoteSpeech?: () => void, selfId?: string) {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const ctxRef = useRef<AudioContext | null>(null);
  const nodes = useRef(new Map<string, { stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; lastLoud: number }>());
  const callback = useRef(onRemoteSpeech);
  callback.current = onRemoteSpeech;

  // After a refresh Chrome starts audio suspended; resume on the next click/keypress.
  useEffect(() => {
    const resume = () => { void ctxRef.current?.resume().catch(() => {}); };
    window.addEventListener('fluid:unlock-audio', resume);
    return () => window.removeEventListener('fluid:unlock-audio', resume);
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current ?? (ctxRef.current = new AudioContext());
    void ctx.resume().catch(() => {});
    const current = nodes.current;
    for (const [id, stream] of Object.entries(streams)) {
      const existing = current.get(id);
      if (existing?.stream === stream) continue;
      existing?.source.disconnect();
      current.delete(id);
      if (!stream || stream.getAudioTracks().length === 0) continue;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      current.set(id, { stream, source, analyser, lastLoud: 0 });
    }
    for (const id of [...current.keys()]) {
      if (!streams[id]) { current.get(id)?.source.disconnect(); current.delete(id); }
    }
  }, [streams]);

  useEffect(() => {
    const buffer = new Float32Array(512);
    const timer = setInterval(() => {
      const now = Date.now();
      const next = new Set<string>();
      let remoteLoud = false;
      for (const [id, node] of nodes.current) {
        node.analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
        if (Math.sqrt(sum / buffer.length) > THRESHOLD) {
          node.lastLoud = now;
          if (id !== selfId) remoteLoud = true;
        }
        if (now - node.lastLoud < HANGOVER_MS) next.add(id);
      }
      if (remoteLoud) callback.current?.();
      setSpeaking(previous => (previous.size === next.size && [...next].every(id => previous.has(id)) ? previous : next));
    }, 120);
    return () => clearInterval(timer);
  }, [selfId]);

  useEffect(() => () => {
    for (const node of nodes.current.values()) node.source.disconnect();
    nodes.current.clear();
    void ctxRef.current?.close();
  }, []);

  return speaking;
}
