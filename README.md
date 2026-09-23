# Fluid

Fluid is a multilingual communication foundation. The local application supports interactive conversations, translated text, user settings, recipient-aware group translation, optional speaker-matched translated voices, and mock-mode server APIs. Provider keys never enter the browser.

## Development and mock mode

This workstation uses pnpm (npm/Corepack are unavailable here).

```bash
Copy-Item .env.example .env.local
# Keep MOCK_SERVICES=true
pnpm install
pnpm dev
```

Open `http://localhost:3000`. `pnpm dev` starts the custom Next.js + Socket.IO server. Mock mode uses a seeded in-memory repository, deterministic translations, and browser speech recognition when it is available. Restarting resets mock data.

## Production mode

1. Set `MOCK_SERVICES=false` and configure the variables below.
2. Apply `src/server/schema.sql` to PostgreSQL (it enables `pgcrypto` for translation IDs).
3. Use a signed session/JWT implementation in place of the development identity adapter in `src/server/auth.ts`.
4. The included Socket.IO server verifies membership through Fluid's API before every room action. Replace the development identity adapter with signed-session verification before deployment. WebRTC media stays off ordinary WebSocket messages.

```bash
pnpm exec next build
pnpm start
```

## Environment

```env
MOCK_SERVICES=false
USE_POSTGRES=true
DATABASE_URL=postgresql://...
ELEVENLABS_API_KEY=...
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
ELEVENLABS_STT_MODEL_ID=scribe_v2
ELEVENLABS_DEFAULT_VOICE_ID=...
DEEPL_API_KEY=...
NEXT_PUBLIC_APP_URL=https://fluid.example
NEXT_PUBLIC_SOCKET_URL=https://fluid.example
```

The ElevenLabs adapter calls its server-side streaming TTS endpoint and returns audio/mpeg from `/api/speech`. Translation runs through DeepL when `DEEPL_API_KEY` is set and falls back to MyMemory, which needs no key.

## Voices that sound like the speaker

A listener can choose, in Settings, between one voice for every translation and a voice matched to each speaker. Matching only applies to people who turned on **Share my voice for translations**, which is off by default.

When it is on, Fluid reuses the speech clips the microphone already produced for transcription: once about 20 seconds have accumulated, they are sent to ElevenLabs as one WAV file and become a temporary instant voice. The voice id travels to the other browsers over the existing peer-state channel, and their `/api/speech` calls use it. The voice is deleted when the speaker turns the setting off, leaves, closes the tab, or after two hours.

Anyone without a match is read in the listener's chosen stock voice, so a missing or unsupported voice never silences a translation.

## Architecture

- `src/server/repositories.ts`: persistence contract; mock and PostgreSQL adapters.
- `src/server/services/messages.ts`: membership validation, original-message persistence, unique recipient-language routing, cached translations.
- `src/app/api`: authenticated message, settings, TTS, and voice-matching server routes.
- `src/lib/elevenlabs/clone.ts`: temporary per-speaker voices, including the registry and deletion rules.
- `src/lib/webrtc` and `src/lib/calls`: microphone capture, WebRTC peer lifecycle, offer/answer/ICE, remote audio playback, and cleanup.
- `src/lib/speech`: partial/final transcript contract and browser-recognition fallback.
- `server.mjs`: Socket.IO call-room authorization and signaling relay.
- `src/app/api/realtime/transcript`: final transcript to membership-checked, recipient-specific translation routing.

## Validation

```bash
pnpm exec vitest run
pnpm exec next build
```

The included tests cover cache reuse and group recipient-language routing. The production build has been verified locally.
