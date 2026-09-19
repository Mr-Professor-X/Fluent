'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './room.css';
import FluidLogo from '@/components/FluidLogo';
import Icon from '@/components/Icon';
import JoinScreen, { joinRoom } from '@/components/JoinScreen';
import ThemeToggle from '@/components/ThemeToggle';
import VideoTile from '@/components/VideoTile';
import { useFluidRoom, type Line, type Person, type Session } from '@/lib/calls/use-fluid-room';
import { useVideoCall } from '@/lib/webrtc/use-video-call';
import { LANGUAGES, languageByCode } from '@/lib/languages';

type Voice = { id: string; name: string; description?: string };
type Prefs = { translatedAudio: boolean; voiceId: string; volume: number; showOriginal: boolean; showTranslated: boolean; captionSize: 'small' | 'medium' | 'large'; translateChat: boolean };
const defaultPrefs: Prefs = { translatedAudio: true, voiceId: '', volume: 0.9, showOriginal: true, showTranslated: true, captionSize: 'medium', translateChat: true };
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
    const previous = JSON.parse(saved) as Session;
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

  useEffect(() => {
    const stored = localStorage.getItem('fluid.prefs');
    if (stored) setPrefs(p => ({ ...p, ...JSON.parse(stored) }));
    fetch('/api/voices').then(r => r.json()).then((list: Voice[]) => {
      setVoices(list);
      setPrefs(p => (p.voiceId && list.some(v => v.id === p.voiceId) ? p : { ...p, voiceId: list[0]?.id ?? '' }));
    }).catch(() => {});
  }, []);
  useEffect(() => { localStorage.setItem('fluid.prefs', JSON.stringify(prefs)); }, [prefs]);

  const room = useFluidRoom(session, { translatedAudio: prefs.translatedAudio, voiceId: prefs.voiceId, volume: prefs.volume });
  const video = useVideoCall(room.socket, room.joined, session.conversationId, session.userId);

  useEffect(() => {
    if (!room.notice) return;
    const timer = setTimeout(() => room.setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [room.notice, room.setNotice]);
  useEffect(() => { if (video.cameraError) room.setNotice(video.cameraError); }, [video.cameraError, room.setNotice]);

  const me: Person = room.people.find(p => p.id === session.userId) ?? { id: session.userId, name: session.name, language: session.language };
  const others = room.people.filter(p => p.id !== session.userId);
  const everyone = [me, ...others];
  const languageCount = new Set(everyone.map(p => p.language)).size;
  const latestSpeech = useMemo(() => [...room.lines].reverse().find(l => l.kind === 'speech'), [room.lines]);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' }); }, [room.lines.length]);

  const inviteLink = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${session.code}`;
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1600); room.setNotice('Invite link copied'); }
    catch { room.setNotice(`Share this code: ${session.code}`); }
  };
  const send = () => { if (room.sendChat(draft)) setDraft(''); else room.setNotice('Not connected yet. Your draft is still here.'); };
  const update = (patch: Partial<Prefs>) => setPrefs(p => ({ ...p, ...patch }));

  const statusLabel = { connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', lost: 'Connection lost', error: 'Could not join' }[room.state];
  const micLabel = room.listening ? (room.playing ? 'Paused while translation plays' : room.transcribing ? 'Transcribing…' : 'Listening') : 'Microphone off';

  return (
    <main className={`caption-${prefs.captionSize}`}>
      <aside className="sidebar">
        <div className="brand"><FluidLogo /><span>fluid</span></div>
        <button className="new-conv" onClick={() => void copyInvite()}><span>＋</span> Invite someone</button>
        <div className="side-label">ROOM CODE</div>
        <button className="room-chip" onClick={() => void copyInvite()} aria-label={`Room code ${session.code}. Copy invite link`}>
          <span>{session.code}</span><Icon name={copied ? 'check' : 'copy'} size={15} />
        </button>
        <div className="side-label">IN THIS ROOM · {everyone.length}</div>
        <nav aria-label="Participants">
          {everyone.map(p => {
            const lang = languageByCode(p.language);
            return (
              <div key={p.id} className="conversation">
                <span className="mini-avatar" style={{ background: colorFor(p.id) }}>{initials(p.name)}</span>
                <span><b>{p.name}{p.id === session.userId ? ' (You)' : ''}</b><small>{lang.flag} {lang.native}</small></span>
                {room.activeSpeaker === p.id && <i aria-label="Speaking" />}
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
            <div className="call-status" role="status">
              <span className={`live-dot ${room.state === 'connected' ? '' : 'warn'}`} /> {statusLabel}
              <span>•</span> {room.translationDown ? 'Translation unavailable' : 'Translation active'}
            </div>

            <div className={`participant-grid ${everyone.length > 2 ? 'group-grid' : ''}`}>
              {everyone.map(p => {
                const isMe = p.id === session.userId;
                const stream = isMe ? video.localStream : p.id === video.remoteId ? video.remoteStream : null;
                const speaking = room.activeSpeaker === p.id || (isMe && room.listening && room.level > 0.15);
                return (
                  <article key={p.id} className={`participant ${speaking ? 'active-speaker' : ''} ${stream ? 'has-video' : ''}`}>
                    {stream ? <VideoTile stream={stream} muted={isMe} mirrored={isMe} /> : (
                      <div className="orb" style={{ '--person': colorFor(p.id) } as React.CSSProperties}>
                        <span>{initials(p.name)}</span>
                        {speaking && <em className="sound-bars" aria-hidden="true">▁▃▆▃▁</em>}
                      </div>
                    )}
                    <div className="participant-info"><b>{p.name}{isMe ? ' (You)' : ''}</b><span>{languageByCode(p.language).flag} {languageByCode(p.language).native}</span></div>
                    {speaking && <div className="speaking"><span /> Speaking</div>}
                  </article>
                );
              })}
              {others.length === 0 && (
                <article className="participant waiting">
                  <div><b>Waiting for others</b><p>Share code <strong>{session.code}</strong> or send the invite link.</p><button className="join-secondary" onClick={() => void copyInvite()}>Copy invite link</button></div>
                </article>
              )}
            </div>

            {latestSpeech && (prefs.showOriginal || prefs.showTranslated) && <CaptionCard line={latestSpeech} prefs={prefs} />}
            {!latestSpeech && room.listening && <div className="caption-hint">Start talking. Pause for a moment and your sentence is sent.</div>}

            <div className="processing-note">Speech is sent to ElevenLabs for transcription and voice · Audio is never recorded or stored</div>
          </section>

          <section className="chat-panel" aria-label="Chat">
            <div className="chat-head">
              <div><h2>Chat</h2><p>Translation {prefs.translateChat ? 'on' : 'off'} <span className="green-dot" /></p></div>
              <button onClick={() => setChatOpen(false)} aria-label="Collapse chat">›</button>
            </div>
            <div className="chat-toggle"><span>Translate messages</span><Switch on={prefs.translateChat} label="Translate messages" onClick={() => update({ translateChat: !prefs.translateChat })} /></div>
            <div className="messages" ref={messagesRef} aria-live="polite">
              {room.lines.length === 0 && <p className="empty-chat">Messages and spoken lines appear here, translated for each person.</p>}
              {room.lines.map(line => <ChatLine key={line.id} line={line} translate={prefs.translateChat} />)}
            </div>
            <div className="composer">
              <textarea value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" aria-label="Message" maxLength={2000} />
              <div><button className="send" onClick={send} aria-label="Send message"><Icon name="send" size={14} /></button></div>
            </div>
          </section>
        </div>

        <footer className="controls">
          <div className="control-group">
            <button className={`round ${room.listening ? 'on' : 'off'}`} onClick={() => void room.toggleMic()} aria-pressed={room.listening} aria-label={room.listening ? 'Turn microphone off' : 'Turn microphone on'}>
              <span style={room.listening ? { boxShadow: `0 0 0 ${2 + room.level * 10}px #00e5ff33` } : undefined}><Icon name={room.listening ? 'mic' : 'micOff'} /></span>
              <small>{micLabel}</small>
            </button>
            <button className={`round ${video.cameraOn ? 'on' : ''}`} onClick={() => void video.toggleCamera()} aria-pressed={video.cameraOn} aria-label={video.cameraOn ? 'Turn camera off' : 'Turn camera on'}>
              <span><Icon name={video.cameraOn ? 'video' : 'videoOff'} /></span><small>Camera</small>
            </button>
            <div className="caption-control">
              <button className={`round ${prefs.showOriginal || prefs.showTranslated ? 'on' : ''}`} onClick={() => setCaptionMenu(v => !v)} aria-expanded={captionMenu} aria-label="Caption options">
                <span><Icon name="captions" /></span><small>Captions</small>
              </button>
              {captionMenu && (
                <div className="caption-menu" role="dialog" aria-label="Captions">
                  <h3>Captions</h3>
                  <div className="setting-row">Original captions <Switch on={prefs.showOriginal} label="Original captions" onClick={() => update({ showOriginal: !prefs.showOriginal })} /></div>
                  <div className="setting-row">Translated captions <Switch on={prefs.showTranslated} label="Translated captions" onClick={() => update({ showTranslated: !prefs.showTranslated })} /></div>
                </div>
              )}
            </div>
            <button className={`round ${prefs.translatedAudio ? 'on' : 'off'}`} onClick={() => { update({ translatedAudio: !prefs.translatedAudio }); room.setNotice(`Translated audio ${prefs.translatedAudio ? 'off' : 'on'}`); }} aria-pressed={prefs.translatedAudio} aria-label="Translated audio">
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
          update={update}
          close={() => setSettingsOpen(false)}
          changeLanguage={async language => {
            try {
              await room.changeLanguage(language);
              const next = { ...session, language };
              sessionStorage.setItem('fluid.session', JSON.stringify(next));
              localStorage.setItem('fluid.lang', language);
              onSessionChange(next);
            } catch { room.setNotice('Could not change your language.'); }
          }}
        />
      )}
    </main>
  );
}

function CaptionCard({ line, prefs }: { line: Line; prefs: Prefs }) {
  const lang = languageByCode(line.sourceLanguage);
  const differs = line.translated !== line.original && line.sourceLanguage !== line.targetLanguage;
  const showTranslated = prefs.showTranslated && !line.mine && differs;
  const showOriginal = prefs.showOriginal || !showTranslated;
  return (
    <div className="caption-card" aria-live="polite">
      <div className="caption-speaker"><span className="mini-avatar" style={{ background: colorFor(line.speakerId) }}>{initials(line.speakerName)}</span> {line.mine ? 'You' : line.speakerName} <span className="caption-lang">Speaking {lang.name}</span></div>
      {showOriginal && <div className="caption-line"><small>{line.speakerName} · ORIGINAL</small><p>{line.original}</p></div>}
      {showTranslated && <div className="caption-line translated"><small>{line.speakerName} · TRANSLATED</small><p>{line.translated}</p></div>}
      {!line.mine && line.translationFailed && differs === false && line.sourceLanguage !== line.targetLanguage && <p className="caption-warning">Translation temporarily unavailable. Showing the original.</p>}
    </div>
  );
}

function ChatLine({ line, translate }: { line: Line; translate: boolean }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const differs = !line.mine && line.translated !== line.original;
  const primary = translate && differs ? line.translated : line.original;
  return (
    <article className={`message ${line.mine ? '' : 'incoming'}`}>
      <span className="mini-avatar" style={{ background: colorFor(line.speakerId) }}>{initials(line.speakerName)}</span>
      <div>
        <div className="msg-meta"><b>{line.mine ? 'You' : line.speakerName}</b><time>{timeOf(line.createdAt)}</time>{line.kind === 'speech' && <em className="spoken-tag">spoken</em>}</div>
        <div className="bubble">
          <p>{primary}</p>
          {translate && differs && showOriginal && <div className="chat-translation"><small>ORIGINAL · {languageByCode(line.sourceLanguage).native}</small><p>{line.original}</p></div>}
          {!line.mine && line.translationFailed && line.sourceLanguage !== line.targetLanguage && <div className="chat-translation"><small>Translation unavailable</small></div>}
        </div>
        {translate && differs && <button className="show-original" onClick={() => setShowOriginal(v => !v)}>{showOriginal ? 'Hide original' : 'Show original'}</button>}
      </div>
    </article>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button className={`switch ${on ? 'switch-on' : ''}`} onClick={onClick} role="switch" aria-checked={on} aria-label={label}><span /></button>;
}

function SettingsModal({ prefs, voices, language, update, close, changeLanguage }: {
  prefs: Prefs; voices: Voice[]; language: string; update: (p: Partial<Prefs>) => void; close: () => void; changeLanguage: (language: string) => Promise<void>;
}) {
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const preview = async () => {
    setPreviewing(true);
    try {
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'content-type': 'application/json', 'x-fluid-user-id': sessionStorage.getItem('fluid.uid') ?? '' }, body: JSON.stringify({ text: 'Hi! This is how translated speech will sound.', voiceId: prefs.voiceId }) });
      if (response.headers.get('content-type')?.includes('application/json')) {
        const utterance = new SpeechSynthesisUtterance('Hi! This is how translated speech will sound.');
        window.speechSynthesis.speak(utterance);
      } else if (response.ok) {
        const audio = new Audio(URL.createObjectURL(await response.blob()));
        audio.volume = prefs.volume;
        await audio.play();
      }
    } finally { setPreviewing(false); }
  };

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="close" onClick={close} aria-label="Close settings">×</button>
        <p className="eyebrow">PERSONALIZATION</p>
        <h2 id="settings-title">Settings</h2>
        <p className="modal-sub">Each person's settings are independent.</p>
        <div className="settings-section">
          <h3>Language</h3>
          <label>I speak and want to hear
            <select value={language} onChange={e => void changeLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.native} ({l.name})</option>)}
            </select>
          </label>
        </div>
        <div className="settings-section">
          <h3>Translated audio</h3>
          <div className="setting-row">Play translated speech <Switch on={prefs.translatedAudio} label="Translated audio" onClick={() => update({ translatedAudio: !prefs.translatedAudio })} /></div>
          <label>Translated voice
            <select value={prefs.voiceId} onChange={e => update({ voiceId: e.target.value })}>
              {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.description ? ` · ${v.description}` : ''}</option>)}
            </select>
          </label>
          <button className="join-secondary preview" onClick={() => void preview()} disabled={previewing}>{previewing ? 'Playing…' : 'Preview voice'}</button>
          <label>Voice volume
            <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={e => update({ volume: Number(e.target.value) })} />
          </label>
        </div>
        <div className="settings-section">
          <h3>Captions</h3>
          <div className="setting-row">Original captions <Switch on={prefs.showOriginal} label="Original captions" onClick={() => update({ showOriginal: !prefs.showOriginal })} /></div>
          <div className="setting-row">Translated captions <Switch on={prefs.showTranslated} label="Translated captions" onClick={() => update({ showTranslated: !prefs.showTranslated })} /></div>
          <label>Caption size
            <select value={prefs.captionSize} onChange={e => update({ captionSize: e.target.value as Prefs['captionSize'] })}>
              <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
            </select>
          </label>
        </div>
        <button className="save" onClick={close}>Done</button>
      </section>
    </div>
  );
}
