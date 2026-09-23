import { NextResponse } from 'next/server';
import { generateTranslatedSpeech } from '@/lib/elevenlabs/speech';
import { isVoiceClone } from '@/lib/elevenlabs/clone';
import { activeRepository } from '@/server/services/container';
import { allow } from '@/server/rate-limit';

export const runtime = 'nodejs';

type SpeakInput = { userId: string | null; text?: string | null; voiceId?: string | null; language?: string | null };

async function speak({ userId, text, voiceId, language }: SpeakInput) {
  const user = userId ? await activeRepository.getUser(userId) : null;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!allow(`tts:${user.id}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!text || text.length > 2000) return NextResponse.json({ error: 'Invalid text' }, { status: 400 });

  const voice = voiceId && !voiceId.startsWith('mock-') ? voiceId : '';
  const result = await generateTranslatedSpeech(text, voice, {
    // A matched speaker voice needs different settings than a stock voice.
    matchedVoice: isVoiceClone(voice),
    language: language ?? undefined,
  });
  // Mock mode: the browser speaks it with its built-in voice instead.
  if (result.mock) return NextResponse.json(result, { status: 409 });
  // Streamed straight through, so playback starts before the whole clip exists.
  return new Response(result.audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}

function failed(error: unknown) {
  console.error('[speech]', error);
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech generation unavailable' }, { status: 503 });
}

/** GET so an <audio> element can stream it directly: /api/speech?u=<userId>&text=...&voice=...&lang=... */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    return await speak({
      userId: searchParams.get('u'),
      text: searchParams.get('text'),
      voiceId: searchParams.get('voice'),
      language: searchParams.get('lang'),
    });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const { text, voiceId, language } = (await request.json()) as { text?: string; voiceId?: string; language?: string };
    return await speak({ userId: request.headers.get('x-fluid-user-id'), text, voiceId, language });
  } catch (error) {
    return failed(error);
  }
}
