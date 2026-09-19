import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { allow } from '@/server/rate-limit';
import { transcribeClip } from '@/lib/elevenlabs/transcribe';

export const runtime = 'nodejs';

/** Receives one spoken sentence (a short WAV clip) and returns the text. Audio is never stored. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!allow(`stt:${user.id}`, 60)) return NextResponse.json({ error: 'Too many requests. Slow down a little.' }, { status: 429 });
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof Blob) || audio.size < 1000) return NextResponse.json({ text: '' });
    if (audio.size > 2_000_000) return NextResponse.json({ error: 'Clip too long' }, { status: 413 });
    const language = String(form.get('language') || user.settings.nativeLanguage);
    const text = await transcribeClip(audio, language);
    return NextResponse.json({ text });
  } catch (error) {
    console.error('[transcribe]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech recognition unavailable' }, { status: 503 });
  }
}
