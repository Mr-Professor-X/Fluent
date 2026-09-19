# Fluid voice pipeline update

Merges Kevin's working Lovable prototype into the Fluid Next.js app, using ElevenLabs for both speech-to-text and voice.

## How a spoken sentence travels
1. `src/lib/speech/mic.ts` (Kevin's code) listens and cuts a clip each time you pause.
2. `POST /api/transcribe` sends the clip to ElevenLabs Scribe v2 -> text in the speaker's language.
3. The browser sends `line:send` over Socket.IO (`server.mjs`).
4. `/api/realtime/transcript` stores the original once and translates once per listener language (cached).
5. Each person gets `line:new` in their own language -> captions + chat.
6. Listeners' browsers call `POST /api/speech` (ElevenLabs TTS) and play it through `AudioQueue`.
   The mic ignores audio while a translation plays (echo guard, from Kevin's prototype).

Typed chat uses the same pipeline (steps 3-5) without the voice.

## New pieces
- Join screen: name, language, room code, no sign-up. Each browser tab is its own person.
- Invite links: `http://localhost:3000/?room=ABC123`
- Video: Kevin's camera code, now signalled over Socket.IO (2 people).
- Settings: language, ElevenLabs voice picker + preview, volume, caption toggles and size.
- Translation: MyMemory (no key) by default; set DEEPL_API_KEY for better quality. Falls back automatically.
- Failures never break the call: no translation -> original text is shown; no voice -> captions still work.

## Environment (.env)
- MOCK_SERVICES=true  -> fake AI, no keys needed (UI work)
- MOCK_SERVICES=false -> real ElevenLabs + real translation
- ELEVENLABS_API_KEY needs Text to Speech, Speech to Text and Voices (read) permissions.

## Known limits (hackathon scope)
- Rooms live in memory and reset when the server restarts (browsers rejoin automatically).
- Video links two people; captions, chat and translated voice work for any group size.
- User identity is trusted from the browser. Replace with real auth before production.
