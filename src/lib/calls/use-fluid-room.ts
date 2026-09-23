'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AudioQueue } from '@/lib/audio/queue';
import { languageByCode } from '@/lib/languages';
import { clipDurationMs, concatWav, startMic, type MicHandle } from '@/lib/speech/mic';

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
  /** Shown instantly while the translation is still on its way. */
  pending?: boolean;
};
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'error';
/** 'speaker' plays each person's translation in a voice built from their own speech. */
export type VoiceSource = 'fixed' | 'speaker';
export type AudioPrefs = {
  translatedAudio: boolean;
  voiceId: string;
  volume: number;
  voiceSource: VoiceSource;
  /** This person lets others hear translations in a voice built from their speech. */
  shareMyVoice: boolean;
};
/** off -> collecting (listening for enough speech) -> building -> ready. */
export type VoiceMatchState = 'off' | 'collecting' | 'building' | 'ready' | 'unavailable';

const ECHO_GUARD_MS = 400;
const SPEAKING_TICK_MS = 120;
/** How much of the speaker's own voice ElevenLabs needs before the match sounds like them. */
const VOICE_SAMPLE_TARGET_MS = 20_000;
const VOICE_SAMPLE_MAX_MS = 45_000;
/** Very short clips ("mm-hm") make a worse voice than they are worth. */
const VOICE_SAMPLE_MIN_CLIP_MS = 900;

export function useFluidRoom(session: Session, prefs: AudioPrefs) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [joined, setJoined] = useState(false);
  const [roster, setRoster] = useState<Person[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [translationDown, setTranslationDown] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [voiceCloneId, setVoiceCloneId] = useState<string | null>(null);
  const [voiceMatch, setVoiceMatch] = useState<VoiceMatchState>('off');
  const [voiceMatchProgress, setVoiceMatchProgress] = useState(0);

  const sessionRef = useRef(session);
  const prefsRef = useRef(prefs);
  const rosterRef = useRef<Person[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const queueRef = useRef(new AudioQueue(3));
  const playingRef = useRef(false);
  const quietUntilRef = useRef(0);
  const remoteSpeechTicks = useRef<number[]>([]);
  const listenToken = useRef(0);
  const current = useRef<{ stop: () => void } | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const speakerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rosterInFlight = useRef<Promise<void> | null>(null);
  /** Mic level lives in a ref: at ~12 updates a second, React state would re-render the whole room. */
  const levelRef = useRef(0);
  /** speakerId -> voice built from that speaker's own speech, shared over the peer-state channel. */
  const speakerVoices = useRef<Record<string, string>>({});
  const samples = useRef<{ clips: Blob[]; ms: number }>({ clips: [], ms: 0 });
  const buildingVoice = useRef(false);
  const retryVoiceAfter = useRef(0);
  const cloneIdRef = useRef<string | null>(null);
  const voiceMatchRef = useRef<VoiceMatchState>('off');

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { rosterRef.current = roster; }, [roster]);

  const headers = useCallback(() => ({ 'x-fluid-user-id': sessionRef.current.userId }), []);
  const setMatchState = useCallback((next: VoiceMatchState) => {
    voiceMatchRef.current = next;
    setVoiceMatch(next);
  }, []);

  /** Presence events can arrive in bursts; one request at a time is enough. */
  const refreshRoster = useCallback(() => {
    if (rosterInFlight.current) return rosterInFlight.current;
    const request = (async () => {
      try {
        const response = await fetch(`/api/rooms/${sessionRef.current.code}`, { headers: headers() });
        if (response.ok) setRoster(await response.json());
      } catch { /* best effort */ } finally {
        rosterInFlight.current = null;
      }
    })();
    rosterInFlight.current = request;
    return request;
  }, [headers]);

  const markSpeaker = (id: string) => {
    setActiveSpeaker(id);
    if (speakerTimer.current) clearTimeout(speakerTimer.current);
    speakerTimer.current = setTimeout(() => setActiveSpeaker(null), 3500);
  };

  /** Which voice should say this person's translated line: their own match, or the chosen voice. */
  const voiceForSpeaker = useCallback((speakerId: string) => {
    const settings = prefsRef.current;
    const matched = settings.voiceSource === 'speaker' ? speakerVoices.current[speakerId] : undefined;
    return { voiceId: matched || settings.voiceId, matched: !!matched };
  }, []);

  /** Listeners feed in the voice ids shared by everyone else in the room. */
  const setSpeakerVoices = useCallback((map: Record<string, string>) => {
    speakerVoices.current = map;
  }, []);

  /* ---------- translated speech: starts downloading the moment a line arrives ---------- */
  const speakWithBrowser = (text: string, language: string, volume: number, seed?: string) => new Promise<void>(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    const tag = languageByCode(language).speech;
    utterance.lang = tag;
    utterance.volume = volume;
    // Mock mode stand-in for a voice match: give each speaker a different browser voice.
    if (seed) {
      const options = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(tag.slice(0, 2)));
      const pick = options[[...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % Math.max(1, options.length)];
      if (pick) utterance.voice = pick;
    }
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
    setTimeout(resolve, 15_000);
  });

  const enqueueSpeech = useCallback((text: string, language: string, speakerId: string) => {
    if (!prefsRef.current.translatedAudio) return;
    const { voiceId, matched } = voiceForSpeaker(speakerId);
    const done = () => {
      playingRef.current = false;
      quietUntilRef.current = Date.now() + ECHO_GUARD_MS;
      setPlaying(false);
    };

    // Mock mode uses the browser's built-in voice, so no ElevenLabs credits are spent while testing.
    if (!voiceId || voiceId.startsWith('mock-')) {
      queueRef.current.enqueue(async () => {
        if (!prefsRef.current.translatedAudio) return;
        playingRef.current = true;
        setPlaying(true);
        current.current = { stop: () => window.speechSynthesis.cancel() };
        try { await speakWithBrowser(text, language, prefsRef.current.volume, matched ? speakerId : undefined); }
        finally { current.current = null; done(); }
      });
      return;
    }

    const params = new URLSearchParams({ u: sessionRef.current.userId, text, voice: voiceId, lang: language });
    const audio = new Audio();
    audio.preload = 'auto';
    let failed = false;
    audio.onerror = () => { failed = true; };
    audio.src = `/api/speech?${params}`; // streamed: starts downloading now, plays before it is complete

    queueRef.current.enqueue(async () => {
      if (!prefsRef.current.translatedAudio) return;
      playingRef.current = true;
      setPlaying(true);
      try {
        audio.volume = Math.max(0, Math.min(1, prefsRef.current.volume));
        const played = !failed && await new Promise<boolean>(resolve => {
          audio.onended = () => resolve(true);
          audio.onerror = () => resolve(false);
          // Lets "Translated audio OFF" cut a clip off mid-sentence.
          current.current = { stop: () => { audio.pause(); resolve(true); } };
          audio.play().catch((error: Error) => {
            if (error.name === 'NotAllowedError') setAudioBlocked(true); // Chrome blocked sound until a click
            resolve(error.name === 'NotAllowedError');
          });
        });
        if (!played) setNotice('Translated audio unavailable. Translated captions are still available.');
      } finally {
        current.current = null;
        done();
      }
    }, () => {
      // Too far behind to be worth hearing: stop the download instead of paying for it.
      audio.src = '';
    });
  }, [voiceForSpeaker]);

  /* ---------- socket connection ---------- */
  useEffect(() => {
    const client = io(window.location.origin, { auth: { userId: session.userId }, reconnectionAttempts: 20 });
    socketRef.current = client;
    setSocket(client);

    client.on('connect', () => {
      client.emit('call:join', { conversationId: session.conversationId }, (result: { ok: boolean; online?: string[] }) => {
        setState(result.ok ? 'connected' : 'error');
        setJoined(result.ok);
        if (result.online) setOnline(result.online);
        if (result.ok) void refreshRoster();
      });
    });
    client.on('disconnect', () => { setState('reconnecting'); setJoined(false); });
    client.io.on('reconnect_failed', () => setState('lost'));
    client.on('connect_error', () => setState('reconnecting'));
    client.on('call:error', (error: { message?: string }) => setNotice(error.message ?? 'Something went wrong.'));
    client.on('room:presence', ({ online: ids }: { online: string[] }) => {
      setOnline(ids);
      if (ids.some(id => !rosterRef.current.some(p => p.id === id))) void refreshRoster();
    });

    client.on('line:pending', (pending: { pendingId: string; kind: Line['kind']; speakerId: string; sourceLanguage: string; original: string; createdAt: string }) => {
      const me = sessionRef.current;
      const speaker = rosterRef.current.find(p => p.id === pending.speakerId);
      const line: Line = {
        id: pending.pendingId, kind: pending.kind, speakerId: pending.speakerId,
        speakerName: pending.speakerId === me.userId ? me.name : speaker?.name ?? '…',
        sourceLanguage: pending.sourceLanguage, original: pending.original, translated: pending.original,
        targetLanguage: me.language, translationFailed: false, mine: pending.speakerId === me.userId,
        createdAt: pending.createdAt, pending: true,
      };
      setLines(previous => [...previous, line].slice(-200));
      if (line.kind === 'speech') markSpeaker(line.speakerId);
    });

    client.on('line:failed', ({ pendingId }: { pendingId: string }) => {
      setLines(previous => previous.filter(l => l.id !== pendingId));
    });

    client.on('line:new', (line: Line & { pendingId?: string }) => {
      const final: Line = { ...line, pending: false };
      setLines(previous => {
        if (previous.some(l => l.id === final.id)) return previous;
        const index = previous.findIndex(l => l.id === line.pendingId);
        if (index === -1) return [...previous, final].slice(-200);
        const next = previous.slice();
        next[index] = final;
        return next;
      });
      if (!line.mine && line.translationFailed && line.sourceLanguage !== line.targetLanguage) {
        setTranslationDown(true);
        setNotice('Translation temporarily unavailable. Original text is still available.');
      } else if (!line.mine) {
        setTranslationDown(false);
      }
      if (line.kind === 'speech') markSpeaker(line.speakerId);
      // Same language: the listener hears the speaker's real voice instead, so no AI voice.
      const needsVoice = line.kind === 'speech' && !line.mine && !line.translationFailed && line.sourceLanguage !== line.targetLanguage;
      if (needsVoice) enqueueSpeech(line.translated, line.targetLanguage, line.speakerId);
    });

    const onUnload = () => client.emit('call:leave');
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      client.emit('call:leave');
      client.disconnect();
      socketRef.current = null;
    };
  }, [session.userId, session.conversationId, refreshRoster, enqueueSpeech]);

  // Turning translated audio off silences it immediately, including a clip that is already playing.
  useEffect(() => {
    if (prefs.translatedAudio) return;
    queueRef.current.clear();
    current.current?.stop();
  }, [prefs.translatedAudio]);

  /* ---------- voice match: build a voice from this person's own speech ---------- */
  const dropSamples = () => {
    samples.current = { clips: [], ms: 0 };
    setVoiceMatchProgress(0);
  };

  const buildVoiceMatch = useCallback(async () => {
    if (buildingVoice.current) return;
    buildingVoice.current = true;
    setMatchState('building');
    try {
      const form = new FormData();
      form.append('sample', await concatWav(samples.current.clips), 'voice.wav');
      const response = await fetch('/api/voice-clone', { method: 'POST', headers: headers(), body: form });
      const json = (await response.json()) as { voiceId?: string; error?: string };
      if (response.status === 409) {
        setMatchState('unavailable');
        setNotice('Voice matching is not available for this ElevenLabs key.');
        dropSamples();
        return;
      }
      if (!response.ok || !json.voiceId) throw new Error(json.error ?? 'Voice matching failed');
      cloneIdRef.current = json.voiceId;
      setVoiceCloneId(json.voiceId);
      setMatchState('ready');
      setNotice('Your voice is ready. People who hear you translated now hear your voice.');
      dropSamples();
    } catch (error) {
      console.error('[voice match]', error);
      setNotice('Could not build your voice match. Trying again in a minute.');
      // Start the sample over and wait, so a failing provider is not retried every sentence.
      retryVoiceAfter.current = Date.now() + 90_000;
      dropSamples();
      setMatchState('collecting');
    } finally {
      buildingVoice.current = false;
    }
  }, [headers, setMatchState]);

  /** Reuses the clip that was already recorded for transcription: nothing extra is captured. */
  const collectVoiceSample = useCallback((clip: Blob) => {
    if (!prefsRef.current.shareMyVoice || cloneIdRef.current || buildingVoice.current) return;
    if (voiceMatchRef.current === 'unavailable' || Date.now() < retryVoiceAfter.current) return;
    const ms = clipDurationMs(clip);
    if (ms < VOICE_SAMPLE_MIN_CLIP_MS) return;
    const store = samples.current;
    if (store.ms >= VOICE_SAMPLE_MAX_MS) return;
    store.clips.push(clip);
    store.ms += ms;
    setVoiceMatchProgress(Math.min(1, store.ms / VOICE_SAMPLE_TARGET_MS));
    if (store.ms >= VOICE_SAMPLE_TARGET_MS) void buildVoiceMatch();
  }, [buildVoiceMatch]);

  const discardVoiceMatch = useCallback((keepalive = false) => {
    dropSamples();
    retryVoiceAfter.current = 0;
    if (!cloneIdRef.current) return;
    cloneIdRef.current = null;
    setVoiceCloneId(null);
    void fetch('/api/voice-clone', { method: 'DELETE', headers: headers(), keepalive }).catch(() => {});
  }, [headers]);

  // The switch in Settings drives the whole lifecycle, including deleting the voice again.
  useEffect(() => {
    if (prefs.shareMyVoice) {
      if (voiceMatchRef.current === 'off') setMatchState('collecting');
      return;
    }
    discardVoiceMatch();
    setMatchState('off');
  }, [prefs.shareMyVoice, discardVoiceMatch, setMatchState]);

  // A voice must not outlive the tab.
  useEffect(() => {
    const onHide = () => { if (cloneIdRef.current) discardVoiceMatch(true); };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (cloneIdRef.current) discardVoiceMatch(true);
    };
  }, [discardVoiceMatch]);

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
      if (!text) return;
      socketRef.current?.emit('line:send', { conversationId: sessionRef.current.conversationId, text, sourceLanguage: sessionRef.current.language, kind: 'speech' });
      // Real speech, confirmed by the transcript: a good sample for the voice match.
      collectVoiceSample(clip);
    } catch (error) {
      console.error('[transcribe]', error);
      setNotice('Speech recognition failed. Try again, or type in the chat.');
    } finally {
      setTranscribing(false);
    }
  }, [headers, collectVoiceSample]);

  const onSegment = useCallback((clip: Blob) => {
    const now = Date.now();
    // Echo guards: skip clips recorded while an AI voice played, or while someone else was talking
    // (their voice coming out of your speakers, or across the table, would otherwise be sent as yours).
    if (playingRef.current || now < quietUntilRef.current) return;
    // Only drop the clip if someone else was talking for most of it (their voice leaking into your mic).
    // Short overlaps ("mm-hm", someone starting to reply) no longer throw your sentence away.
    const duration = clipDurationMs(clip);
    const loudMs = remoteSpeechTicks.current.filter(t => t >= now - duration).length * SPEAKING_TICK_MS;
    if (duration > 0 && loudMs / duration > 0.6) return;
    chainRef.current = chainRef.current.then(() => processClip(clip));
  }, [processClip]);

  /** Start sending speech for translation, sharing the same microphone stream as the call. */
  const startListening = useCallback(async (stream: MediaStream) => {
    if (micRef.current) return;
    const token = ++listenToken.current;
    const handle = await startMic({ stream, onSegment, onLevel: value => { levelRef.current = value; } });
    // A stop (or another start) happened while this one was starting: throw this one away.
    if (token !== listenToken.current || micRef.current) { handle.stop(false); return; }
    micRef.current = handle;
    setListening(true);
  }, [onSegment]);

  /** sendUnfinished=false when switching to Own voice, so nothing more goes to ElevenLabs. */
  const stopListening = useCallback((sendUnfinished = true) => {
    listenToken.current++;
    micRef.current?.stop(sendUnfinished);
    micRef.current = null;
    setListening(false);
    levelRef.current = 0;
  }, []);

  useEffect(() => () => { micRef.current?.stop(); micRef.current = null; }, []);

  const noteRemoteSpeech = useCallback(() => {
    const now = Date.now();
    remoteSpeechTicks.current = [...remoteSpeechTicks.current.filter(t => t > now - 15_000), now];
  }, []);

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
    await refreshRoster();
  }, [headers, refreshRoster]);

  /** Plays one line in the voice the listener would actually hear. Used by the Settings preview. */
  const previewVoice = useCallback(async (text: string, speakerId?: string) => {
    const { voiceId, matched } = voiceForSpeaker(speakerId ?? sessionRef.current.userId);
    const language = sessionRef.current.language;
    if (!voiceId || voiceId.startsWith('mock-')) {
      await speakWithBrowser(text, language, prefsRef.current.volume, matched ? speakerId : undefined);
      return;
    }
    const params = new URLSearchParams({ u: sessionRef.current.userId, text, voice: voiceId, lang: language });
    const audio = new Audio(`/api/speech?${params}`);
    audio.volume = Math.max(0, Math.min(1, prefsRef.current.volume));
    await audio.play();
  }, [voiceForSpeaker]);

  const leave = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    queueRef.current.clear();
    discardVoiceMatch(true);
    socketRef.current?.emit('call:leave');
    socketRef.current?.disconnect();
  }, [discardVoiceMatch]);

  // Only people who are connected right now (the list updates the moment someone leaves).
  const people = roster.filter(p => p.id === session.userId || online.includes(p.id));

  return {
    socket, joined, state, people, lines, listening, levelRef, transcribing, playing, activeSpeaker,
    notice, setNotice, translationDown, audioBlocked, setAudioBlocked,
    voiceCloneId, voiceMatch, voiceMatchProgress, setSpeakerVoices, previewVoice,
    startListening, stopListening, noteRemoteSpeech, sendChat, changeLanguage, leave,
  };
}
