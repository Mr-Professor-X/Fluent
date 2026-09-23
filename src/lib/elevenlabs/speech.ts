import { defaultVoiceId, describeFailure, elevenLabsFetch } from './client';

export type SpeechOptions = {
  /** A voice built from the speaker's own recording: worth trading a little stability for likeness. */
  matchedVoice?: boolean;
  /** Target language, so the model pronounces the translation in the right language. */
  language?: string;
};

/** Text -> speech. In mock mode the browser's built-in voice is used instead. */
export async function generateTranslatedSpeech(text: string, voiceId: string, options: SpeechOptions = {}) {
  if (process.env.MOCK_SERVICES === 'true') return { mock: true as const, text, voiceId };
  const voice = voiceId || defaultVoiceId();
  const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';

  const body: Record<string, unknown> = { text, model_id: model };
  // Only the flash/turbo models accept a forced language; multilingual v2 detects it from the text.
  if (options.language && /flash|turbo/.test(model)) body.language_code = options.language;
  if (options.matchedVoice) body.voice_settings = { stability: 0.45, similarity_boost: 0.9, use_speaker_boost: true };

  const response = await elevenLabsFetch(`/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) throw new Error(await describeFailure(response, 'Voice generation'));
  return { mock: false as const, audio: response.body };
}
