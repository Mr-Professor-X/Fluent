'use client';

import { useEffect, useState } from 'react';
import Ambient from '@/components/Ambient';
import FluidLogo from '@/components/FluidLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { LANGUAGES } from '@/lib/languages';
import type { Session } from '@/lib/calls/use-fluid-room';

function randomCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

/** Every browser tab is its own person, so two tabs can test a call on one laptop. */
export function tabUserId() {
  let id = sessionStorage.getItem('fluid.uid');
  if (!id) {
    id = `u-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    sessionStorage.setItem('fluid.uid', id);
  }
  return id;
}

export async function joinRoom(code: string, name: string, language: string): Promise<Session> {
  const userId = tabUserId();
  const response = await fetch('/api/rooms/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fluid-user-id': userId },
    body: JSON.stringify({ code, name, language }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'Could not join the room');
  const session: Session = { userId, name, language, code: json.code, conversationId: json.conversationId };
  sessionStorage.setItem('fluid.session', JSON.stringify(session));
  localStorage.setItem('fluid.name', name);
  localStorage.setItem('fluid.lang', language);
  return session;
}

export default function JoinScreen({ initialCode, onJoined }: { initialCode: string; onJoined: (session: Session) => void }) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(localStorage.getItem('fluid.name') ?? '');
    setLanguage(localStorage.getItem('fluid.lang') ?? 'en');
  }, []);

  const enter = async (roomCode: string) => {
    setError('');
    setBusy(true);
    try {
      onJoined(await joinRoom(roomCode, name.trim() || 'Guest', language));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the room');
      setBusy(false);
    }
  };

  return (
    <main className="join-main">
      <Ambient />
      <nav className="topbar" aria-label="Fluid">
        <div className="brand"><FluidLogo /><span className="wordmark">fluid</span></div>
        <ThemeToggle />
      </nav>

      <section className="join-hero reveal">
        <p className="eyebrow">LIVE INTERPRETER</p>
        <h1>Speak naturally.<br /><span className="gradient-text">Understand everyone.</span></h1>
        <p className="lede">Every sentence arrives in your language, as captions and a natural voice. {LANGUAGES.length} languages. No sign-up.</p>
      </section>

      <section className="join-card reveal d1" aria-label="Join a conversation">
        <label className="join-label" htmlFor="join-name">NAME</label>
        <input id="join-name" className="join-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={40} autoComplete="name" />

        <p className="join-label" id="lang-label">LANGUAGE</p>
        <div className="lang-grid" role="radiogroup" aria-labelledby="lang-label">
          {LANGUAGES.map(l => (
            <button key={l.code} type="button" role="radio" aria-checked={language === l.code} className={`lang-option ${language === l.code ? 'chosen' : ''}`} onClick={() => setLanguage(l.code)}>
              {l.native}
            </button>
          ))}
        </div>

        <button type="button" className="join-primary" disabled={busy} onClick={() => void enter(randomCode())}>
          {busy ? 'Joining…' : 'Start a new room'}
        </button>

        <div className="join-divider"><span />or join with a code<span /></div>

        <div className="join-row">
          <input aria-label="Room code" className="join-input code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE" maxLength={12} onKeyDown={e => { if (e.key === 'Enter' && code.trim().length >= 4) void enter(code); }} />
          <button type="button" className="join-secondary" disabled={busy || code.trim().length < 4} onClick={() => void enter(code)}>Join ›</button>
        </div>

        {error && <p className="join-error" role="alert">{error}</p>}
        <p className="join-privacy">Speech is sent to ElevenLabs for transcription and voice. Audio is never stored.</p>
      </section>
    </main>
  );
}
