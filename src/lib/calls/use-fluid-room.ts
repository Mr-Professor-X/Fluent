'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AudioQueue } from '@/lib/audio/queue';
import { languageByCode } from '@/lib/languages';
import { startMic, type MicHandle } from '@/lib/speech/mic';

export type Session = { userId: string; name: string; language: string; code: string; conversationId: string };
export type Person = { id: string; name: string; language: string };
export type Line = {
  id: string;
  kind: 'speech' | 'chat';
  speakerId: string;
  speakerName: string;
  sourceLanguage: string;
  original: string;
  translated: string;
  targetLanguage: string;
  translationFailed: boolean;
  mine: boolean;
  createdAt: string;
};
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'error';
export type AudioPrefs = { translatedAudio: boolean; voiceId: string; volume: number };

const ECHO_GUARD_MS = 400;

export function useFluidRoom(session: Session, prefs: AudioPrefs) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [joined, setJoined] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [translationDown, setTranslationDown] = useState(false);

  const sessionRef = useRef(session);
  const prefsRef = useRef(prefs);
  const socketRef = useRef<Socket | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const queueRef = useRef(new AudioQueue(3));
  const playingRef = useRef(false);
  const quietUntilRef = useRef(0);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const speakerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  const headers = useCallback(() => ({ 'x-fluid-user-id': sessionRef.current.userId }), []);

  const refreshPeople = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${sessionRef.current.code}`, { headers: headers() });
      if (response.ok) setPeople(await response.json());
    } catch { /* roster refresh is best-effort */ }
  }, [headers]);

  /* ---------- translated speech playback ---------- */
  const playUrl = (url: string, volume: number) => new Promise<void>(resolve => {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });

  const speakWithBrowser = (text: string, language: string, volume: number) => new Promise<void>(resolve => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageByCode(language).speech;
    utterance.volume = volume;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
    setTimeout(resolve, 15_000);
  });

  const speak = useCallback(async (text: string, language: string) => {
    playingRef.current = true;
    setPlaying(true);
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ text, voiceId: prefsRef.current.voiceId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? 'Voice unavailable');
      }
      if (response.headers.get('content-type')?.includes('application/json')) {
        await speakWithBrowser(text, language, prefsRef.current.volume);
      } else {
        const url = URL.createObjectURL(await response.blob());
        await playUrl(url, prefsRef.current.volume);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('[speech]', error);
      setNotice('Translated audio unavailable. Translated captions are still available.');
    } finally {
      playingRef.current = false;
      quietUntilRef.current = Date.now() + ECHO_GUARD_MS;
      setPlaying(false);
    }
  }, [headers]);

  /* ---------- socket connection ---------- */
  useEffect(() => {
    const client = io(window.location.origin, { auth: { userId: session.userId }, reconnectionAttempts: 20 });
    socketRef.current = client;
    setSocket(client);

    client.on('connect', () => {
      client.emit('call:join', { conversationId: session.conversationId }, (result: { ok: boolean }) => {
        setState(result.ok ? 'connected' : 'error');
        setJoined(result.ok);
        if (result.ok) void refreshPeople();
      });
    });
    client.on('disconnect', () => { setState('reconnecting'); setJoined(false); });
    client.io.on('reconnect_failed', () => setState('lost'));
    client.on('connect_error', () => setState('reconnecting'));
    client.on('call:error', (error: { message?: string }) => setNotice(error.message ?? 'Something went wrong.'));
    client.on('participant:joined', () => void refreshPeople());
    client.on('participant:left', () => void refreshPeople());

    client.on('line:new', (line: Line) => {
      setLines(previous => (previous.some(l => l.id === line.id) ? previous : [...previous, line].slice(-200)));
      if (!line.mine && line.translationFailed && line.sourceLanguage !== line.targetLanguage) {
        setTranslationDown(true);
        setNotice('Translation temporarily unavailable. Original text is still available.');
      } else if (!line.mine) {
        setTranslationDown(false);
      }
      if (line.kind === 'speech') {
        setActiveSpeaker(line.speakerId);
        if (speakerTimer.current) clearTimeout(speakerTimer.current);
        speakerTimer.current = setTimeout(() => setActiveSpeaker(null), 4000);
      }
      const needsVoice = line.kind === 'speech' && !line.mine && !line.translationFailed && line.sourceLanguage !== line.targetLanguage;
      if (needsVoice && prefsRef.current.translatedAudio) {
        queueRef.current.enqueue(() => speak(line.translated, line.targetLanguage));
      }
    });

    return () => {
      client.emit('call:leave');
      client.disconnect();
      socketRef.current = null;
    };
  }, [session.userId, session.conversationId, refreshPeople, speak]);

  // Turning translated audio off also silences anything still waiting to play.
  useEffect(() => { if (!prefs.translatedAudio) queueRef.current.clear(); }, [prefs.translatedAudio]);

  /* ---------- microphone -> ElevenLabs transcription -> room ---------- */
  const processClip = useCallback(async (clip: Blob) => {
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append('audio', clip, 'clip.wav');
      form.append('language', sessionRef.current.language);
      const response = await fetch('/api/transcribe', { method: 'POST', headers: headers(), body: form });
      const json = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? 'Speech recognition failed');
      const text = json.text?.trim();
      if (text) {
        socketRef.current?.emit('line:send', { conversationId: sessionRef.current.conversationId, text, sourceLanguage: sessionRef.current.language, kind: 'speech' });
      }
    } catch (error) {
      console.error('[transcribe]', error);
      setNotice('Speech recognition failed. Try again, or type in the chat.');
    } finally {
      setTranscribing(false);
    }
  }, [headers]);

  const onSegment = useCallback((clip: Blob) => {
    // Echo guard: never transcribe while (or right after) a translated voice is playing.
    if (playingRef.current || Date.now() < quietUntilRef.current) return;
    chainRef.current = chainRef.current.then(() => processClip(clip));
  }, [processClip]);

  const toggleMic = useCallback(async () => {
    if (micRef.current) {
      micRef.current.stop();
      micRef.current = null;
      setListening(false);
      setLevel(0);
      return;
    }
    try {
      micRef.current = await startMic({ onSegment, onLevel: setLevel });
      setListening(true);
    } catch {
      setNotice('Microphone unavailable. Check your browser permissions.');
    }
  }, [onSegment]);

  useEffect(() => () => { micRef.current?.stop(); micRef.current = null; }, []);

  /* ---------- text chat ---------- */
  const sendChat = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || !socketRef.current?.connected) return false;
    socketRef.current.emit('line:send', { conversationId: sessionRef.current.conversationId, text: clean, sourceLanguage: sessionRef.current.language, kind: 'chat' });
    return true;
  }, []);

  /* ---------- settings ---------- */
  const changeLanguage = useCallback(async (language: string) => {
    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { ...headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ nativeLanguage: language, translationLanguage: language }),
    });
    if (!response.ok) throw new Error('Could not save your language');
    await refreshPeople();
  }, [headers, refreshPeople]);

  const leave = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    queueRef.current.clear();
    socketRef.current?.emit('call:leave');
    socketRef.current?.disconnect();
  }, []);

  return {
    socket, joined, state, people, lines, listening, level, transcribing, playing, activeSpeaker,
    notice, setNotice, translationDown, toggleMic, sendChat, changeLanguage, leave,
  };
}
