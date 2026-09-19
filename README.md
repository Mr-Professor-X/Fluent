# Fluid

Fluid is a multilingual communication foundation. The local application supports interactive conversations, translated text, user settings, recipient-aware group translation, and mock-mode server APIs. Provider keys never enter the browser.

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
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ELEVENLABS_API_KEY=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
TRANSLATION_API_URL=https://your-provider-gateway/translate
TRANSLATION_API_KEY=...
SPEECH_TO_TEXT_API_URL=...
SPEECH_TO_TEXT_API_KEY=...
NEXT_PUBLIC_APP_URL=https://fluid.example
NEXT_PUBLIC_SOCKET_URL=https://fluid.example
```

`TRANSLATION_API_URL` must accept `{ text, sourceLanguage, targetLanguage }` and return `{ translatedText }`. The ElevenLabs adapter calls its server-side streaming TTS endpoint and returns audio/mpeg from `/api/speech`.

## Architecture

- `src/server/repositories.ts`: persistence contract; mock and PostgreSQL adapters.
- `src/server/services/messages.ts`: membership validation, original-message persistence, unique recipient-language routing, cached translations.
- `src/app/api`: authenticated message, settings, and TTS server routes.
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
