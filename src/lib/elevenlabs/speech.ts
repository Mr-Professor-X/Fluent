import { defaultVoiceId, describeFailure, elevenLabsFetch } from './client';

/** Text -> speech. In mock mode the browser's built-in voice is used instead. */
export async function generateTranslatedSpeech(text: string, voiceId: string) {
  if (process.env.MOCK_SERVICES === 'true') return { mock: true as const, text, voiceId };
  const voice = voiceId || defaultVoiceId();
  const response = await elevenLabsFetch(`/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5' }),
  });
  if (!response.ok || !response.body) throw new Error(await describeFailure(response, 'Voice generation'));
  return { mock: false as const, audio: response.body };
}
