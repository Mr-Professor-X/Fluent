'use client';

import { useEffect, useState } from 'react';
import Switch from '@/components/Switch';
import { LANGUAGES } from '@/lib/languages';
import type { VoiceMatchState, VoiceSource } from '@/lib/calls/use-fluid-room';
import type { VoiceMode } from '@/lib/webrtc/use-media-mesh';

export type Voice = { id: string; name: string; description?: string };
export type Prefs = {
  translatedAudio: boolean;
  voiceId: string;
  voiceSource: VoiceSource;
  shareMyVoice: boolean;
  volume: number;
  originalVolume: number;
  voiceMode: VoiceMode;
  showOriginal: boolean;
  showTranslated: boolean;
  captionSize: 'small' | 'medium' | 'large';
  translateChat: boolean;
};

const PREVIEW_LINE = 'Hi! This is how translated speech will sound.';

function matchStatus(state: VoiceMatchState, progress: number, listening: boolean) {
  switch (state) {
    case 'collecting':
      return listening
        ? `Listening while you talk · ${Math.round(progress * 100)}% of the speech needed`
        : 'Turn your microphone on and keep talking to build it.';
    case 'building':
      return 'Building your voice…';
    case 'ready':
      return 'Ready. Anyone who picked matched voices now hears you.';
    case 'unavailable':
      return 'This ElevenLabs key cannot create voices, so matching is off.';
    default:
      return 'Off. Others hear you in the voice they picked.';
  }
}

export default function SettingsModal({
  prefs, voices, language, voiceMatch, voiceMatchProgress, sharingPeers, otherPeople, micOn,
  update, close, changeLanguage, preview,
}: {
  prefs: Prefs;
  voices: Voice[];
  language: string;
  voiceMatch: VoiceMatchState;
  voiceMatchProgress: number;
  sharingPeers: number;
  otherPeople: number;
  micOn: boolean;
  update: (patch: Partial<Prefs>) => void;
  close: () => void;
  changeLanguage: (language: string) => Promise<void>;
  preview: (text: string) => Promise<void>;
}) {
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const playPreview = async () => {
    setPreviewing(true);
    try { await preview(PREVIEW_LINE); } catch { /* preview is best effort */ } finally { setPreviewing(false); }
  };

  const matching = prefs.voiceSource === 'speaker';

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="close" onClick={close} aria-label="Close settings">×</button>
        <p className="eyebrow">PREFERENCES</p>
        <h2 id="settings-title">Settings</h2>
        <p className="modal-sub">Each person&apos;s settings are independent.</p>

        <div className="settings-section">
          <h3>LANGUAGE</h3>
          <label>I speak and want to hear
            <select value={language} onChange={e => void changeLanguage(e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.native === l.name ? l.name : `${l.native} (${l.name})`}</option>)}
            </select>
          </label>
        </div>

        <div className="settings-section">
          <h3>HOW OTHERS HEAR ME</h3>
          <div className="segmented" role="radiogroup" aria-label="How others hear you">
            <button role="radio" aria-checked={prefs.voiceMode === 'translated'} className={prefs.voiceMode === 'translated' ? 'chosen' : ''} onClick={() => update({ voiceMode: 'translated' })}>
              <b>AI translation</b><small>Other languages hear you translated. Same language hears your real voice.</small>
            </button>
            <button role="radio" aria-checked={prefs.voiceMode === 'original'} className={prefs.voiceMode === 'original' ? 'chosen' : ''} onClick={() => update({ voiceMode: 'original' })}>
              <b>Own voice</b><small>Everyone hears your real voice. Nothing is translated or sent to ElevenLabs.</small>
            </button>
          </div>
          <div className="setting-row stacked">
            <span>
              Share my voice for translations
              <small>Builds a temporary voice from what you say, so people hearing you translated hear your voice instead of a stock one. Deleted when you leave.</small>
            </span>
            <Switch on={prefs.shareMyVoice} label="Share my voice for translations" onClick={() => update({ shareMyVoice: !prefs.shareMyVoice })} />
          </div>
          {prefs.voiceMode === 'original' && prefs.shareMyVoice && (
            <p className="setting-note">Own voice mode sends nothing to ElevenLabs, so no voice is built while it is on.</p>
          )}
          {prefs.shareMyVoice && prefs.voiceMode === 'translated' && (
            <>
              <p className="setting-note">{matchStatus(voiceMatch, voiceMatchProgress, micOn)}</p>
              {voiceMatch === 'collecting' && (
                <div className="match-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(voiceMatchProgress * 100)} aria-label="Speech collected">
                  <i style={{ width: `${Math.max(3, voiceMatchProgress * 100)}%` }} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="settings-section">
          <h3>TRANSLATED AUDIO</h3>
          <div className="setting-row">Play translated speech <Switch on={prefs.translatedAudio} label="Translated audio" onClick={() => update({ translatedAudio: !prefs.translatedAudio })} /></div>

          <div className="segmented" role="radiogroup" aria-label="Which voice reads translations to you">
            <button role="radio" aria-checked={!matching} className={!matching ? 'chosen' : ''} onClick={() => update({ voiceSource: 'fixed' })}>
              <b>One voice for everyone</b><small>Every translation is read in the voice you pick.</small>
            </button>
            <button role="radio" aria-checked={matching} className={matching ? 'chosen' : ''} onClick={() => update({ voiceSource: 'speaker' })}>
              <b>Match each speaker</b><small>Hear the translation in a voice that sounds like the person talking, for everyone who shares their voice.</small>
            </button>
          </div>

          <label>{matching ? 'Voice for anyone not sharing theirs' : 'Translated voice'}
            <select value={prefs.voiceId} onChange={e => update({ voiceId: e.target.value })}>
              {voices.map(v => <option key={v.id} value={v.id}>{v.name}{v.description ? ` · ${v.description}` : ''}</option>)}
            </select>
          </label>
          <button className="join-secondary preview" onClick={() => void playPreview()} disabled={previewing}>{previewing ? 'Playing…' : 'Preview voice'}</button>
          {matching && (
            <p className="setting-note">
              {otherPeople === 0
                ? 'Nobody else is here yet. People who share their voice will be matched automatically.'
                : `${sharingPeers} of ${otherPeople} ${otherPeople === 1 ? 'person' : 'people'} in this room ${sharingPeers === 1 ? 'shares' : 'share'} their voice.`}
            </p>
          )}

          <label>Translated voice volume
            <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={e => update({ volume: Number(e.target.value) })} />
          </label>
          <label>Real voice volume
            <input type="range" min={0} max={1} step={0.05} value={prefs.originalVolume} onChange={e => update({ originalVolume: Number(e.target.value) })} />
          </label>
        </div>

        <div className="settings-section">
          <h3>CAPTIONS</h3>
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
