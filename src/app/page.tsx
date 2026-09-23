'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ambient from '@/components/Ambient';
import FluidLogo from '@/components/FluidLogo';
import Icon from '@/components/Icon';
import JoinScreen, { joinRoom } from '@/components/JoinScreen';
import SettingsModal, { type Prefs, type Voice } from '@/components/SettingsModal';
import Switch from '@/components/Switch';
import ThemeToggle from '@/components/ThemeToggle';
import VideoTile from '@/components/VideoTile';
import { useSpeaking } from '@/lib/audio/use-speaking';
import { useFluidRoom, type Line, type Person, type Session } from '@/lib/calls/use-fluid-room';
import { useMediaMesh, type VoiceMode } from '@/lib/webrtc/use-media-mesh';
import { languageByCode } from '@/lib/languages';

const defaultPrefs: Prefs = {
  translatedAudio: true, voiceId: '', voiceSource: 'fixed', shareMyVoice: false,
  volume: 0.9, originalVolume: 1, voiceMode: 'translated',
  showOriginal: true, showTranslated: true, captionSize: 'medium', translateChat: true,
};
const palette = ['#2b77b3', '#3a9fcb', '#1f5a93', '#2a9bb8', '#5d7fd1', '#0e8a9c'];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
const colorFor = (id: string) => palette[[...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % palette.length];
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function Page() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [initialCode, setInitialCode] = useState('');

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
    setInitialCode(fromLink);
    const saved = sessionStorage.getItem('fluid.session');
    if (!saved) return setReady(true);
    // Rejoin after a refresh. This also works after a server restart wiped the in-memory rooms.
    let previous: Session;
    try { previous = JSON.parse(saved) as Session; } catch { sessionStorage.removeItem('fluid.session'); return setReady(true); }
    joinRoom(fromLink || previous.code, previous.name, previous.language)
      .then(setSession)
      .catch(() => sessionStorage.removeItem('fluid.session'))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (session) window.history.replaceState(null, '', `?room=${session.code}`);
  }, [session]);

  if (!ready) return <main className="join-main" aria-busy="true" />;
  if (!session) return <JoinScreen initialCode={initialCode} onJoined={setSession} />;
  return (
    <Room
      key={session.conversationId}
      session={session}
      onSessionChange={setSession}
      onLeave={() => {
        sessionStorage.removeItem('fluid.session');
        window.history.replaceState(null, '', '/');
        setSession(null);
      }}
    />
  );
}

function Room({ session, onSessionChange, onLeave }: { session: Session; onSessionChange: (s: Session) => void; onLeave: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [captionMenu, setCaptionMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('fluid.prefs');
    if (stored) {
      try { const saved = JSON.parse(stored) as Partial<Prefs>; setPrefs(p => ({ ...p, ...saved })); } catch { /* ignore a corrupt value */ }
    }
    fetch('/api/voices').then(r => r.json()).then((list: Voice[]) => {
      setVoices(list);
      setPrefs(p => (p.voiceId && list.some(v => v.id === p.voiceId) ? p : { ...p, voiceId: list[0]?.id ?? '' }));
    }).catch(() => {});
  }, []);
  // Debounced: dragging a volume slider should not write to disk on every step.
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem('fluid.prefs', JSON.stringify(prefs)); } catch { /* private mode */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [prefs]);

  const audioPrefs = useMemo(() => ({
    translatedAudio: prefs.translatedAudio, voiceId: prefs.voiceId, volume: prefs.volume,
    voiceSource: prefs.voiceSource, shareMyVoice: prefs.shareMyVoice,
  }), [prefs.translatedAudio, prefs.voiceId, prefs.volume, prefs.voiceSource, prefs.shareMyVoice]);

  const room = useFluidRoom(session, audioPrefs);
  const media = useMediaMesh(room.socket, room.joined, session.conversationId, session.userId, prefs.voiceMode, session.language);
  const { setNotice, startListening, stopListening, setAudioBlocked, setSpeakerVoices } = room;
  const { setVoiceClone } = media;

  /* ---------- voice matching: my voice out, everyone else's voices in ---------- */
  useEffect(() => { setVoiceClone(room.voiceCloneId); }, [room.voiceCloneId, setVoiceClone]);
  const speakerVoices = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, peer] of Object.entries(media.peerStates)) if (peer.voiceCloneId) map[id] = peer.voiceCloneId;
    if (room.voiceCloneId) map[session.userId] = room.voiceCloneId; // lets the Settings preview play my own voice
    return map;
  }, [media.peerStates, room.voiceCloneId, session.userId]);
  useEffect(() => { setSpeakerVoices(speakerVoices); }, [speakerVoices, setSpeakerVoices]);

  /* ---------- microphone: one stream feeds both the live call and translation ---------- */
  const toggleMic = async () => {
    if (micStreamRef.current) {
      stopListening();
      media.setMic(null);
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setMicStream(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      micStreamRef.current = stream;
      setMicStream(stream);
      media.setMic(stream.getAudioTracks()[0] ?? null);
    } catch {
      setNotice('Microphone unavailable. Check your browser permissions.');
    }
  };
  // "AI translation" mode sends your speech for translation; "Own voice" mode never does.
  useEffect(() => {
    if (micStream && prefs.voiceMode === 'translated') startListening(micStream).catch(() => setNotice('Microphone unavailable.'));
    else stopListening(prefs.voiceMode === 'translated'); // Own voice: drop the unfinished sentence, send nothing
  }, [micStream, prefs.voiceMode, startListening, stopListening, setNotice]);
  useEffect(() => () => { micStreamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  useEffect(() => {
    if (!room.notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [room.notice, setNotice]);
  useEffect(() => { if (media.cameraError) setNotice(media.cameraError); }, [media.cameraError, setNotice]);

  const me: Person = room.people.find(p => p.id === session.userId) ?? { id: session.userId, name: session.name, language: session.language };
  const others = room.people.filter(p => p.id !== session.userId);
  const everyone = [me, ...others];
  const languageCount = new Set(everyone.map(p => (p.id === session.userId ? session.language : media.peerStates[p.id]?.language ?? p.language))).size;
  const latestSpeech = useMemo(() => [...room.lines].reverse().find(l => l.kind === 'speech'), [room.lines]);
  const sharingPeers = others.filter(p => media.peerStates[p.id]?.voiceCloneId).length;

  const languageOf = useCallback((person: Person) => (person.id === session.userId ? session.language : media.peerStates[person.id]?.language ?? person.language), [media.peerStates, session.language, session.userId]);

  /** Real voice or AI voice? Decided per listener, per speaker. */
  const hearRealVoice = useCallback((person: Person) => {
    const theirMode = media.peerStates[person.id]?.voiceMode ?? 'translated';
    return theirMode === 'original' || languageOf(person) === session.language || !prefs.translatedAudio;
  }, [media.peerStates, languageOf, session.language, prefs.translatedAudio]);

  /** True when I will hear this person's translation in a voice built from their own speech. */
  const voiceMatched = useCallback(
    (person: Person) => prefs.voiceSource === 'speaker' && !!media.peerStates[person.id]?.voiceCloneId,
    [prefs.voiceSource, media.peerStates],
  );
  /** True when my own voice is out there for others to hear, whatever I chose to listen to. */
  const sharingMyVoice = !!room.voiceCloneId;

  // Chrome blocks sound until the page has been clicked (e.g. after a refresh). Any click or key unlocks it.
  useEffect(() => {
    const unlock = () => { window.dispatchEvent(new Event('fluid:unlock-audio')); setAudioBlocked(false); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [setAudioBlocked]);

  // Tell the user once if someone can't be reached (their network blocks direct connections).
  const warned = useRef(new Set<string>());
  useEffect(() => {
    for (const [id, status] of Object.entries(media.links)) {
      if (status !== 'failed' || warned.current.has(id)) continue;
      warned.current.add(id);
      const name = room.people.find(p => p.id === id)?.name ?? 'Someone';
      setNotice(media.relayAvailable
        ? `Can't connect audio/video with ${name} yet. Retrying…`
        : `Can't connect audio/video with ${name}: the network is blocking it. Try a phone hotspot. Chat and translation still work.`);
    }
  }, [media.links, media.relayAvailable, room.people, setNotice]);

  const audioStreams = useMemo(() => ({ ...media.remoteAudio, [session.userId]: micStream }), [media.remoteAudio, micStream, session.userId]);
  const speakingNow = useSpeaking(audioStreams, room.noteRemoteSpeech, session.userId);

  // Chat scrolling: follow new messages while you are at the bottom; otherwise show a "new messages" button.
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const seenCount = useRef(0);
  const [unread, setUnread] = useState(0);
  const scrollToBottom = () => {
    const el = messagesRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    stickToBottom.current = true;
    setUnread(0);
  };
  const onMessagesScroll = () => {
    const el = messagesRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stickToBottom.current) setUnread(0);
  };
  useEffect(() => {
    const added = room.lines.length - seenCount.current;
    seenCount.current = room.lines.length;
    if (added <= 0) return;
    if (stickToBottom.current || room.lines[room.lines.length - 1]?.mine) requestAnimationFrame(scrollToBottom);
    else setUnread(n => n + added);
  }, [room.lines]);

  const inviteLink = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${session.code}`;
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1600); setNotice('Invite link copied'); }
    catch { setNotice(`Share this code: ${session.code}`); }
  };
  const send = () => { if (room.sendChat(draft)) setDraft(''); else setNotice('Not connected yet. Your draft is still here.'); };
  const update = useCallback((patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch })), []);
  const switchVoiceMode = () => {
    const next: VoiceMode = prefs.voiceMode === 'translated' ? 'original' : 'translated';
    update({ voiceMode: next });
    setNotice(next === 'original' ? 'Own voice: everyone hears your real voice, no translation.' : 'AI translation: people who speak other languages hear you translated.');
  };

  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', lost: 'Connection lost', error: 'Could not join' }[room.state];
  const micLabel = !micStream ? 'Mic off'
    : prefs.voiceMode === 'original' ? 'Live · own voice'
    : room.playing ? 'Paused for translation'
    : room.transcribing ? 'Transcribing…' : 'Listening';
  // In own-voice mode there is no transcription level to show, so fall back to speech detection.
  const glowFloor = prefs.voiceMode === 'original' && speakingNow.has(session.userId) ? 0.6 : 0;

  return (
    <main className={`room-main caption-${prefs.captionSize}`}>
      <aside className="sidebar">
        <div className="brand"><FluidLogo /><span className="wordmark">fluid</span></div>
        <button className="new-conv" onClick={() => void copyInvite()}><span>＋</span> Invite someone</button>
        <div className="side-label">ROOM</div>
        <button className="room-chip" onClick={() => void copyInvite()} aria-label={`Room code ${session.code}. Copy invite link`}>
          <span>{session.code}</span><Icon name={copied ? 'check' : 'copy'} size={15} />
        </button>
        <div className="side-label">IN THIS ROOM <span className="count">{everyone.length}</span></div>
        <nav aria-label="Participants">
          {everyone.map(p => {
            const lang = languageByCode(languageOf(p));
            const isMe = p.id === session.userId;
            const ownVoice = (isMe ? prefs.voiceMode : media.peerStates[p.id]?.voiceMode) === 'original';
            const note = ownVoice ? ' · own voice'
              : isMe ? (sharingMyVoice ? ' · voice shared' : '')
              : voiceMatched(p) ? ' · voice matched' : '';
            return (
              <div key={p.id} className="conversation">
                <span className="mini-avatar" style={{ background: colorFor(p.id) }}>{initials(p.name)}</span>
                <span><b>{p.name}{isMe ? ' (You)' : ''}</b><small>{lang.native}{note}</small></span>
                {(room.activeSpeaker === p.id || speakingNow.has(p.id)) && <i aria-label="Speaking" />}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="utility" onClick={() => setSettingsOpen(true)}><Icon name="settings" /> <span>Settings</span></button>
          <div className="profile">
            <span className="mini-avatar blue">{initials(session.name)}</span>
            <span><b>{session.name}</b><small>{languageByCode(session.language).native}</small></span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <div className="conversation-heading">
            <span className="presence" />
            <div><h1>Room {session.code}</h1><p>{everyone.length} {everyone.length === 1 ? 'participant' : 'participants'} · {languageCount} {languageCount === 1 ? 'language' : 'languages'}</p></div>
          </div>
          <div className="head-actions">
            <ThemeToggle />
            {!chatOpen && <button onClick={() => setChatOpen(true)} aria-label="Open chat"><Icon name="chat" /></button>}
            <div className="head-avatar" aria-hidden="true">{initials(session.name)}</div>
          </div>
        </header>

        <div className={`call-chat ${chatOpen ? '' : 'chat-collapsed'}`}>
          <section className="call-area" aria-label="Call">
            <Ambient />
            <div className="call-status" role="status">
              <span className={`live-dot ${room.state === 'connected' ? '' : 'warn'}`} /> {statusLabel}
              <span>•</span> {room.translationDown ? 'Translation unavailable' : 'Translation active'}
            </div>

            <div className={`participant-grid ${everyone.length > 2 ? 'group-grid' : ''} ${media.localVideo || Object.values(media.peerStates).some(st => st.camera) ? 'video-mode' : ''}`}>
              {everyone.map(p => {
                const isMe = p.id === session.userId;
                const peer = media.peerStates[p.id];
                const stream = isMe ? media.localVideo : peer?.camera ? media.remoteVideo[p.id] ?? null : null;
                const speaking = room.activeSpeaker === p.id || speakingNow.has(p.id);
                const ownVoice = (isMe ? prefs.voiceMode : peer?.voiceMode) === 'original';
                const micOff = isMe ? !micStream : peer ? !peer.mic : false;
                const link = isMe ? undefined : media.links[p.id];
                return (
                  <article key={p.id} className={`participant ${speaking ? 'active-speaker' : ''} ${stream ? 'has-video' : ''}`}>
                    {stream ? <VideoTile stream={stream} muted mirrored={isMe} /> : (
                      <div className="orb" style={{ '--person': colorFor(p.id) } as React.CSSProperties}>
                        <span>{initials(p.name)}</span>
                        {speaking && <em className="sound-bars" aria-hidden="true"><i /><i /><i /><i /></em>}
                      </div>
                    )}
                    <div className="participant-info">
                      <b>{p.name}{isMe ? ' (You)' : ''}</b>
                      <span>{languageByCode(languageOf(p)).native}</span>
                    </div>
                    <div className="tile-tags">
                      {ownVoice && <span className="voice-badge">OWN VOICE</span>}
                      {!ownVoice && isMe && sharingMyVoice && <span className="voice-badge">VOICE SHARED</span>}
                      {!ownVoice && !isMe && voiceMatched(p) && <span className="voice-badge">MATCHED VOICE</span>}
                      {micOff && <span className="mic-off" aria-label="Microphone off"><Icon name="micOff" size={13} /></span>}
                      {link === 'connecting' && <span className="link-tag">Connecting…</span>}
                      {link === 'failed' && <span className="link-tag bad" title="Their network is blocking a direct connection. Chat and translation still work.">No audio/video link</span>}
                    </div>
                    {speaking && <div className="speaking"><span /> LIVE</div>}
                  </article>
                );
              })}
              {others.length === 0 && (
                <article className="participant waiting">
                  <div><b>Waiting for others</b><p>Share code <strong>{session.code}</strong> or send the invite link.</p><button className="join-secondary" onClick={() => void copyInvite()}>Copy invite link</button></div>
                </article>
              )}
            </div>

            {latestSpeech && (prefs.showOriginal || prefs.showTranslated) && <CaptionCard key={latestSpeech.id} line={latestSpeech} prefs={prefs} />}
            {!latestSpeech && micStream && prefs.voiceMode === 'translated' && <div className="caption-hint">Start talking. Pause for a moment and your sentence is sent.</div>}

            <div className="processing-note">
              {prefs.voiceMode === 'original' ? 'Own voice: your speech goes straight to the call, never to ElevenLabs' : 'Speech is sent to ElevenLabs for transcription and voice · Audio is never recorded or stored'}
            </div>
          </section>

          <section className="chat-panel" aria-label="Chat">
            <div className="chat-head">
              <div><h2>Chat</h2><p>Translation {prefs.translateChat ? 'on' : 'off'} <span className="green-dot" /></p></div>
              <button onClick={() => setChatOpen(false)} aria-label="Collapse chat">›</button>
            </div>
            <div className="chat-toggle"><span>Translate messages</span><Switch on={prefs.translateChat} label="Translate messages" onClick={() => update({ translateChat: !prefs.translateChat })} /></div>
            <div className="messages" ref={messagesRef} onScroll={onMessagesScroll} aria-live="polite">
              {room.lines.length === 0 && <p className="empty-chat">Messages and spoken lines appear here, translated for each person.</p>}
              {room.lines.map(line => <ChatLine key={line.id} line={line} translate={prefs.translateChat} />)}
            </div>
            {unread > 0 && <button className="new-messages" onClick={scrollToBottom}>↓ {unread} new {unread === 1 ? 'message' : 'messages'}</button>}
            <div className="composer">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" aria-label="Message" maxLength={2000} />
              <div><button className="send" onClick={send} aria-label="Send message"><Icon name="send" size={14} /></button></div>
            </div>
          </section>
        </div>

        {/* Real voices from the call. Each is muted or not, per the rules in hearRealVoice. */}
        {others.map(p => media.remoteAudio[p.id] && (
          <RemoteAudio key={p.id} stream={media.remoteAudio[p.id]!} muted={!hearRealVoice(p)} volume={prefs.originalVolume} onBlocked={() => setAudioBlocked(true)} />
        ))}
        {room.audioBlocked && (
          <button className="sound-unlock" onClick={() => setNotice('Sound is on')}>
            <Icon name="speaker" size={16} /> Tap to turn on sound
          </button>
        )}

        <footer className="controls">
          <div className="control-group">
            <button className={`round ${micStream ? 'on' : 'off'}`} onClick={() => void toggleMic()} aria-pressed={!!micStream} aria-label={micStream ? 'Turn microphone off' : 'Turn microphone on'}>
              {micStream
                ? <MicGlow levelRef={room.levelRef} floor={glowFloor}><Icon name="mic" /></MicGlow>
                : <span><Icon name="micOff" /></span>}
              <small>{micLabel}</small>
            </button>
            <button className={`round ${prefs.voiceMode === 'original' ? 'on' : ''}`} onClick={switchVoiceMode} aria-pressed={prefs.voiceMode === 'original'} aria-label="Switch between AI translation and your own voice">
              <span><Icon name={prefs.voiceMode === 'original' ? 'user' : 'globe'} /></span>
              <small>{prefs.voiceMode === 'original' ? 'Own voice' : 'AI translation'}</small>
            </button>
            <button className={`round ${media.cameraOn ? 'on' : ''}`} onClick={() => void media.toggleCamera()} aria-pressed={media.cameraOn} aria-label={media.cameraOn ? 'Turn camera off' : 'Turn camera on'}>
              <span><Icon name={media.cameraOn ? 'video' : 'videoOff'} /></span><small>{media.cameraOn ? 'Camera on' : 'Camera off'}</small>
            </button>
            <div className="caption-control">
              <button className={`round ${prefs.showOriginal || prefs.showTranslated ? 'on' : ''}`} onClick={() => setCaptionMenu(v => !v)} aria-expanded={captionMenu} aria-label="Caption options">
                <span><Icon name="captions" /></span><small>Captions</small>
              </button>
              {captionMenu && (
                <div className="caption-menu" role="dialog" aria-label="Captions">
                  <h3>CAPTIONS</h3>
                  <div className="setting-row">Original captions <Switch on={prefs.showOriginal} label="Original captions" onClick={() => update({ showOriginal: !prefs.showOriginal })} /></div>
                  <div className="setting-row">Translated captions <Switch on={prefs.showTranslated} label="Translated captions" onClick={() => update({ showTranslated: !prefs.showTranslated })} /></div>
                </div>
              )}
            </div>
            <button className={`round ${prefs.translatedAudio ? 'on' : 'off'}`} onClick={() => { update({ translatedAudio: !prefs.translatedAudio }); setNotice(prefs.translatedAudio ? 'Translated audio off: you hear everyone’s real voice.' : 'Translated audio on'); }} aria-pressed={prefs.translatedAudio} aria-label="Translated audio">
              <span><Icon name={prefs.translatedAudio ? 'speaker' : 'speakerOff'} /></span><small>Translated audio {prefs.translatedAudio ? 'ON' : 'OFF'}</small>
            </button>
            <button className="round" onClick={() => setSettingsOpen(true)} aria-label="Settings"><span><Icon name="settings" /></span><small>Settings</small></button>
          </div>
          <button className="leave" onClick={() => { room.leave(); onLeave(); }}><Icon name="leave" size={14} /> <span>Leave</span></button>
        </footer>
      </section>

      {room.notice && <div className="toast" role="status">{room.notice}</div>}
      {settingsOpen && (
        <SettingsModal
          prefs={prefs}
          voices={voices}
          language={session.language}
          voiceMatch={room.voiceMatch}
          voiceMatchProgress={room.voiceMatchProgress}
          sharingPeers={sharingPeers}
          otherPeople={others.length}
          micOn={!!micStream}
          update={update}
          close={() => setSettingsOpen(false)}
          preview={room.previewVoice}
          changeLanguage={async language => {
            try {
              await room.changeLanguage(language);
              const next = { ...session, language };
              sessionStorage.setItem('fluid.session', JSON.stringify(next));
              localStorage.setItem('fluid.lang', language);
              onSessionChange(next);
            } catch { setNotice('Could not change your language.'); }
          }}
        />
      )}
    </main>
  );
}

/**
 * The mic-level glow, driven straight from a ref. The level changes ~12 times a second; routing it
 * through React state would re-render every tile and chat line with it.
 */
function MicGlow({ levelRef, floor, children }: { levelRef: { current: number }; floor: number; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const glow = (level: number) => {
      element.style.boxShadow = `0 0 0 ${2 + level * 10}px rgba(0, 229, 255, .2), 0 0 22px rgba(0, 229, 255, .35)`;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      glow(Math.max(floor, 0.2));
      return;
    }
    let frame = 0;
    let shown = -1;
    const tick = () => {
      const level = Math.max(levelRef.current, floor);
      if (Math.abs(level - shown) > 0.01) { shown = level; glow(level); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef, floor]);
  return <span ref={ref}>{children}</span>;
}

/** One hidden player per person. It keeps playing (muted when you should hear the AI voice instead),
 *  retries after Chrome's sound block is lifted, and re-plays whenever it is unmuted. */
const RemoteAudio = memo(function RemoteAudio({ stream, muted, volume, onBlocked }: { stream: MediaStream; muted: boolean; volume: number; onBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  const play = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    element.play().catch((error: Error) => { if (error.name === 'NotAllowedError' && !element.muted) blocked.current(); });
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    play();
  }, [stream, play]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = muted;
    element.volume = Math.max(0, Math.min(1, volume));
    if (!muted) play();
  }, [muted, volume, play]);
  useEffect(() => {
    window.addEventListener('fluid:unlock-audio', play);
    return () => window.removeEventListener('fluid:unlock-audio', play);
  }, [play]);
  return <audio ref={ref} autoPlay playsInline data-fluid-audio="" />;
});

function CaptionCard({ line, prefs }: { line: Line; prefs: Prefs }) {
  const lang = languageByCode(line.sourceLanguage);
  const differs = line.sourceLanguage !== line.targetLanguage;
  const showTranslated = prefs.showTranslated && !line.mine && differs;
  const showOriginal = prefs.showOriginal || !showTranslated;
  return (
    <div className="caption-card" aria-live="polite">
      <div className="caption-speaker"><span className="mini-avatar" style={{ background: colorFor(line.speakerId) }}>{initials(line.speakerName)}</span> {line.mine ? 'You' : line.speakerName} <span className="caption-lang">Speaking {lang.name}</span></div>
      {showOriginal && <div className="caption-line"><small>ORIGINAL</small><p>{line.original}</p></div>}
      {showTranslated && (
        <div className={`caption-line translated ${line.pending ? 'pending' : ''}`}>
          <small>TRANSLATED</small>
          <p>{line.pending ? 'Translating…' : line.translated}</p>
        </div>
      )}
      {!line.mine && !line.pending && line.translationFailed && differs && <p className="caption-warning">Translation temporarily unavailable. Showing the original.</p>}
    </div>
  );
}

/** Memoised: a new line must not re-render the whole history. */
const ChatLine = memo(function ChatLine({ line, translate }: { line: Line; translate: boolean }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const differs = !line.mine && !line.pending && line.translated !== line.original;
  const primary = translate && differs ? line.translated : line.original;
  return (
    <article className={`message ${line.mine ? '' : 'incoming'}`}>
      <span className="mini-avatar" style={{ background: colorFor(line.speakerId) }}>{initials(line.speakerName)}</span>
      <div>
        <div className="msg-meta"><b>{line.mine ? 'You' : line.speakerName}</b><time>{timeOf(line.createdAt)}</time>{line.kind === 'speech' && <em className="spoken-tag">VOICE</em>}</div>
        <div className="chat-bubble">
          <p>{primary}</p>
          {line.pending && !line.mine && line.sourceLanguage !== line.targetLanguage && translate && <div className="chat-translation pending"><small>TRANSLATING</small></div>}
          {translate && differs && showOriginal && <div className="chat-translation"><small>ORIGINAL</small><p>{line.original}</p></div>}
          {!line.mine && !line.pending && line.translationFailed && line.sourceLanguage !== line.targetLanguage && <div className="chat-translation"><small>Translation unavailable</small></div>}
        </div>
        {translate && differs && <button className="show-original" onClick={() => setShowOriginal(v => !v)}>{showOriginal ? 'Hide original' : 'Show original'}</button>}
      </div>
    </article>
  );
});
