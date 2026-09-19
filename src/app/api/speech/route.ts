import { NextResponse } from 'next/server';
import { generateTranslatedSpeech } from '@/lib/elevenlabs/speech';
import { activeRepository } from '@/server/services/container';
import { allow } from '@/server/rate-limit';

export const runtime = 'nodejs';

async function speak(userId: string | null, text: string | undefined | null, voiceId: string | undefined | null) {
  const user = userId ? await activeRepository.getUser(userId) : null;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!allow(`tts:${user.id}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!text || text.length > 2000) return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
  const result = await generateTranslatedSpeech(text, voiceId && !voiceId.startsWith('mock-') ? voiceId : '');
  // Mock mode: the browser speaks it with its built-in voice instead.
  if (result.mock) return NextResponse.json(result, { status: 409 });
  // Streamed straight through, so playback starts before the whole clip exists.
  return new Response(result.audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

/** GET so an <audio> element can stream it directly: /api/speech?u=<userId>&text=...&voice=... */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return await speak(url.searchParams.get('u'), url.searchParams.get('text'), url.searchParams.get('voice'));
  } catch (error) {
    console.error('[speech]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech generation unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const { text, voiceId } = (await request.json()) as { text?: string; voiceId?: string };
    return await speak(request.headers.get('x-fluid-user-id'), text, voiceId);
  } catch (error) {
    console.error('[speech]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech generation unavailable' }, { status: 503 });
  }
}
