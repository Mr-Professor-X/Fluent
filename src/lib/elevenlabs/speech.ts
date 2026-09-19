/** Server-only boundary. In mock mode the browser SpeechSynthesis API is used by the client. */
export async function generateTranslatedSpeech(text: string, voiceId: string) {
  if (process.env.MOCK_SERVICES === 'true') return { mock: true, text, voiceId };
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ElevenLabs is not configured');
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2' }) });
  if (!response.ok || !response.body) throw new Error('ElevenLabs voice generation unavailable');
  return { mock: false, audio: response.body };
}
