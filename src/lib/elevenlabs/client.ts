/** Server-only helpers for ElevenLabs. The API key never reaches the browser. */
export const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
/** A stock ElevenLabs voice used when the user has not picked one. Override with ELEVENLABS_DEFAULT_VOICE_ID. */
export const FALLBACK_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

export function elevenLabsKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ElevenLabs is not configured (ELEVENLABS_API_KEY is empty).');
  return key;
}

export function defaultVoiceId() {
  return process.env.ELEVENLABS_DEFAULT_VOICE_ID || FALLBACK_VOICE_ID;
}

/** Retries once on rate limits and server errors, which are usually transient. */
export async function elevenLabsFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const response = await fetch(`${ELEVENLABS_BASE}${path}`, { ...init, headers: { ...init.headers, 'xi-api-key': elevenLabsKey() }, signal: AbortSignal.timeout(20_000) });
  if ((response.status === 429 || response.status >= 500) && attempt === 0) {
    await new Promise(resolve => setTimeout(resolve, 600));
    return elevenLabsFetch(path, init, 1);
  }
  return response;
}

export async function describeFailure(response: Response, what: string) {
  const body = await response.text().catch(() => '');
  if (response.status === 401) return `${what}: ElevenLabs rejected the API key or the key is missing a permission. ${body.slice(0, 200)}`;
  if (response.status === 429) return `${what}: ElevenLabs rate limit or quota reached.`;
  return `${what} failed [${response.status}]: ${body.slice(0, 200)}`;
}
