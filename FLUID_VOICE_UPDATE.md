# Fluid voice pipeline update

Merges Kevin's working Lovable prototype into the Fluid Next.js app, using ElevenLabs for both speech-to-text and voice.

## How a spoken sentence travels
1. `src/lib/speech/mic.ts` (Kevin's code) listens and cuts a clip each time you pause.
2. `POST /api/transcribe` sends the clip to ElevenLabs Scribe v2 -> text in the speaker's language.
3. The browser sends `line:send` over Socket.IO (`server.mjs`).
4. `/api/realtime/transcript` stores the original once and translates once per listener language (cached).
5. Each person gets `line:new` in their own language -> captions + chat.
6. Listeners' browsers call `/api/speech` (ElevenLabs TTS) and play it through `AudioQueue`.
   The mic ignores audio while a translation plays (echo guard, from Kevin's prototype).

Typed chat uses the same pipeline (steps 3-5) without the voice.

## New pieces
- Join screen: name, language, room code, no sign-up. Each browser tab is its own person.
- Invite links: `http://localhost:3000/?room=ABC123`
- Video: Kevin's camera code, now signalled over Socket.IO (2 people).
- Settings: language, ElevenLabs voice picker + preview, volume, caption toggles and size.
- Settings: **translated voice source** next to the voice picker - one voice for everyone, or a voice
  matched to each speaker (see below).
- Translation: MyMemory (no key) by default; set DEEPL_API_KEY for better quality. Falls back automatically.
- Failures never break the call: no translation -> original text is shown; no voice -> captions still work.

## Voices that sound like the person talking

Two settings, on purpose: the listener chooses what they hear, the speaker chooses what they share.

- **Listener** (Settings -> Translated audio): *One voice for everyone* or *Match each speaker*.
- **Speaker** (Settings -> How others hear me): *Share my voice for translations*, off by default.

How it works when a speaker turns sharing on:
1. The clips `mic.ts` already cut for transcription are kept as samples. Nothing extra is recorded,
   and only clips the transcript confirmed as speech are used.
2. At ~20s of speech they are joined into one WAV (`concatWav`) and posted to `/api/voice-clone`,
   which creates an ElevenLabs instant voice and remembers it in a server-side registry.
3. The new voice id is broadcast in the speaker's peer state (the same channel as mic/camera/language),
   so every listener learns it without a new server round trip.
4. Listeners who chose *Match each speaker* pass that voice id to `/api/speech`, which recognises its
   own clones and uses likeness-friendly voice settings for them.
5. The voice is deleted when the speaker turns the setting off, leaves, closes the tab, or after 2h.

Fallbacks: no match yet, or a plan without voice cloning, means the listener's chosen stock voice is
used and a one-time note explains why. In mock mode a different browser voice per speaker stands in,
so the whole flow can be demonstrated with no keys and no credits.

## Environment (.env)
- MOCK_SERVICES=true  -> fake AI, no keys needed (UI work)
- MOCK_SERVICES=false -> real ElevenLabs + real translation
- ELEVENLABS_API_KEY needs Text to Speech, Speech to Text and Voices (read) permissions.
  Voice matching also needs Voices (write) and a plan that allows instant voice cloning.

## Known limits (hackathon scope)
- Rooms live in memory and reset when the server restarts (browsers rejoin automatically).
- Video links two people; captions, chat and translated voice work for any group size.
- User identity is trusted from the browser. Replace with real auth before production.
- Voice matches live in the server's memory. Turning the setting off, leaving, or closing the tab
  deletes them, but a server restart forgets the registry and leaves them on the ElevenLabs account
  (they are named `fluid-<user>-<time>`). A shared store is the production answer.
