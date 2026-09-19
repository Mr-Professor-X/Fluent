import { describeFailure, elevenLabsFetch } from './client';

const MOCK_LINES: Record<string, string[]> = {
  en: ['Hi, can you hear me?', 'Where should we meet tomorrow?', 'That sounds great to me.'],
  es: ['Hola, ¿me escuchas?', '¿Dónde nos vemos mañana?', 'Me parece genial.'],
  fr: ['Salut, tu m’entends ?', 'On se retrouve où demain ?', 'Ça me va très bien.'],
  ja: ['もしもし、聞こえますか？', '明日はどこで会いましょうか？', 'いいですね。'],
};
let mockIndex = 0;

/** Speech -> text with ElevenLabs Scribe, in the speaker's own language. */
export async function transcribeClip(audio: Blob, languageCode: string): Promise<string> {
  if (process.env.MOCK_SERVICES === 'true') {
    const lines = MOCK_LINES[languageCode] ?? MOCK_LINES.en;
    return lines[mockIndex++ % lines.length];
  }
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v2');
  form.append('file', audio, 'clip.wav');
  if (languageCode) form.append('language_code', languageCode);
  form.append('tag_audio_events', 'false');
  const response = await elevenLabsFetch('/v1/speech-to-text', { method: 'POST', body: form });
  if (!response.ok) throw new Error(await describeFailure(response, 'Transcription'));
  const json = (await response.json()) as { text?: string };
  // Drop leftover sound tags like "(background noise)" so they are never translated or spoken.
  return (json.text ?? '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}
