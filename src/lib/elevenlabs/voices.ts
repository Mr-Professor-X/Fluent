import { defaultVoiceId, describeFailure, elevenLabsFetch } from './client';

export type VoiceOption = { id: string; name: string; description?: string };

const MOCK_VOICES: VoiceOption[] = [
  { id: 'mock-warm', name: 'Warm (browser voice)' },
  { id: 'mock-clear', name: 'Clear (browser voice)' },
];

const CACHE_MS = 5 * 60_000;
let cache: { voices: VoiceOption[]; at: number } | null = null;

/** Lists the voices available to this ElevenLabs account. Cached, because every page load asks. */
export async function listVoices(): Promise<VoiceOption[]> {
  if (process.env.MOCK_SERVICES === 'true') return MOCK_VOICES;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.voices;
  try {
    const response = await elevenLabsFetch('/v1/voices', { method: 'GET' });
    if (!response.ok) throw new Error(await describeFailure(response, 'Voice list'));
    const json = (await response.json()) as { voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
    const voices = (json.voices ?? [])
      // Temporary voice matches belong to a speaker, not in everyone's picker.
      .filter(v => v.labels?.kind !== 'voice-match')
      .map(v => ({ id: v.voice_id, name: v.name, description: [v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(' · ') }));
    if (voices.length) {
      cache = { voices: voices.slice(0, 30), at: Date.now() };
      return cache.voices;
    }
  } catch (error) {
    console.warn('[voices]', error instanceof Error ? error.message : error);
  }
  return [{ id: defaultVoiceId(), name: 'Default voice' }];
}
