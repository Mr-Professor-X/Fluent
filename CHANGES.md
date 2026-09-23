# Changes in this pass

Two things: a new "sound like the speaker" option in Settings, and a cleanup/performance pass.

## 1. Voices that sound like the person talking

Two settings, because hearing someone's voice and lending yours are different decisions.

**Listener** — Settings → Translated audio, next to the voice picker:

- *One voice for everyone* (unchanged behaviour)
- *Match each speaker* — translations play in a voice built from that person's own speech

The voice dropdown stays either way. Under *Match each speaker* it is relabelled "Voice for anyone
not sharing theirs", so a missing match never means silence.

**Speaker** — Settings → How others hear me:

- *Share my voice for translations*, off by default, with a progress bar while it collects

### How it works

1. The clips `src/lib/speech/mic.ts` already cuts for transcription are kept as samples. Nothing
   extra is recorded, and only clips the transcript confirmed as real speech are used.
2. At ~20s of speech they are joined into one WAV (`concatWav`) and posted to `/api/voice-clone`,
   which creates an ElevenLabs instant voice and registers it server-side.
3. The voice id is broadcast in the speaker's peer state — the same channel that already carries
   mic/camera/language — so listeners learn it with no extra server round trip.
4. Listeners who chose *Match each speaker* pass that id to `/api/speech`, which recognises its own
   clones and switches to likeness-friendly voice settings plus a forced target language.
5. The voice is deleted when the speaker turns the setting off, leaves, closes the tab, or after 2h.

Failure modes never break a call: no match yet, or a plan without cloning, falls back to the stock
voice with a one-time note. A failed build backs off 90 seconds instead of retrying every sentence.

In mock mode each speaker gets a different browser voice, so the whole flow demos with no key and
no credits.

### Files

New: `src/lib/elevenlabs/clone.ts`, `src/app/api/voice-clone/route.ts`,
`src/components/SettingsModal.tsx` (extracted from `page.tsx`), `src/components/Switch.tsx`.

Changed: `use-fluid-room.ts` (voice resolution, sample capture, lifecycle), `use-media-mesh.ts`
(`voiceCloneId` in peer state, `setVoiceClone`), `page.tsx` (wiring, badges),
`elevenlabs/speech.ts`, `api/speech/route.ts`, `speech/mic.ts` (`concatWav`), `server/domain.ts`,
`api/settings/route.ts`, `postgres-repository.ts`, `schema.sql`, `fluid.css`.

### Environment

`ELEVENLABS_API_KEY` needs **Voices: write** and a plan that allows instant voice cloning, in
addition to the existing Text to Speech / Speech to Text / Voices (read) permissions.

## 2. Cleanup

Deleted, all unreferenced: `lib/calls/use-fluid-call.ts`, `lib/webrtc/use-video-call.ts`,
`lib/webrtc/call.ts`, `lib/realtime/*` (BroadcastChannel client, socket client, events),
`lib/events.ts`, `lib/speech/browser.ts`, `lib/speech/types.ts`, `lib/translation/provider.ts`,
`server.ts` (superseded by `server.mjs`), four empty files (`lib/audioQueue.ts`,
`lib/elevenlabs/tts.ts`, `lib/speech/useSpeech.ts`, `lib/translation/index.ts`), and the committed
`.next` build output.

## 3. Performance and correctness

- **Mic level out of React state.** It was re-rendering every participant tile and chat line about
  12 times a second. A ref now drives one style write per frame (`MicGlow`), and it degrades to a
  static glow under `prefers-reduced-motion`.
- **Dropped audio stops downloading.** `AudioQueue` takes a drop callback, so clips discarded for
  being too far behind release their audio element instead of paying for audio nobody hears.
  `enqueueSpeech` also bails before the request when translated audio is off.
- **Voice list cached** 5 minutes; it was calling ElevenLabs on every page load.
- **Socket membership checks** use a new `HEAD` handler plus a 30s cache of confirmed members,
  instead of serialising every message in the room on each join. Refusals are never cached.
- **Two unbounded `Map` leaks fixed**: the translation cache is now LRU-capped, and rate-limit
  buckets are pruned.
- Debounced prefs writes (a volume drag was writing to `localStorage` on every step), deduped
  roster refreshes, memoised `ChatLine` and `RemoteAudio`, and made a corrupt
  `localStorage`/`sessionStorage` value non-fatal.
- The consent switch is never disabled, so it cannot get stuck on for someone whose key can't
  create voices.

## Verification

`node_modules` could not be installed in the environment this was done in, so `next build` and
vitest were not run. Instead:

- The whole `src` tree typechecks clean against minimal stubs for react / next / socket.io / pg.
- `concatWav` was unit-tested in Node: RIFF/WAVE/fmt/data tags, both size fields, channel count,
  sample rate, bit depth, payload order and duration all correct.

Worth running locally before demoing: `pnpm exec vitest run` and `pnpm exec next build`.
