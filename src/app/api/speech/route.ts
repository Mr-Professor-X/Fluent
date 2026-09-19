import { NextResponse } from 'next/server';
import { generateTranslatedSpeech } from '@/lib/elevenlabs/speech';
import { requireUser } from '@/server/auth';
import { allow } from '@/server/rate-limit';

export const runtime = 'nodejs';

/** Text -> translated speech. The browser never sees the ElevenLabs key. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!allow(`tts:${user.id}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const { text, voiceId } = (await request.json()) as { text?: string; voiceId?: string };
    if (!text || text.length > 2000) return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
    const result = await generateTranslatedSpeech(text, voiceId && !voiceId.startsWith('mock-') ? voiceId : '');
    if (result.mock) return NextResponse.json(result);
    return new Response(result.audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[speech]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech generation unavailable' }, { status: 503 });
  }
}
