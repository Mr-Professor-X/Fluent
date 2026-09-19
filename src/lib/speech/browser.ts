import type { SpeechToTextService, Transcript } from './types';
/** Local development fallback. Production speech providers belong behind the same interface. */
export class MockSpeechToTextService implements SpeechToTextService { async transcribeAudio(_audio: Blob, preferredLanguage = 'en'): Promise<Transcript> { return { text: 'Speech transcription is available in mock mode.', language: preferredLanguage, isFinal: true, startedAt: Date.now(), endedAt: Date.now() }; } }
