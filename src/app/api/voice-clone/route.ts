import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { allow } from '@/server/rate-limit';
import { CloneUnavailableError, createVoiceClone, MAX_CLONE_BYTES, MAX_CLONE_FILES, removeVoiceClone, voiceCloneFor } from '@/lib/elevenlabs/clone';

export const runtime = 'nodejs';

/** The speaker's own device asks for a voice match, using clips it already recorded for transcription. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    if (!allow(`clone:${user.id}`, 4, 10 * 60_000)) {
      return NextResponse.json({ error: 'Voice matching was rebuilt too many times. Wait a few minutes.' }, { status: 429 });
    }

    const form = await request.formData();
    const samples = form.getAll('sample').filter((part): part is Exclude<FormDataEntryValue, string> => typeof part !== 'string').slice(0, MAX_CLONE_FILES);
    if (samples.length === 0) return NextResponse.json({ error: 'No speech samples were sent' }, { status: 400 });
    const total = samples.reduce((sum, sample) => sum + sample.size, 0);
    if (total > MAX_CLONE_BYTES) return NextResponse.json({ error: 'Speech samples are too large' }, { status: 413 });

    const record = await createVoiceClone(user.id, user.displayName, samples);
    return NextResponse.json({ voiceId: record.voiceId });
  } catch (error) {
    if (error instanceof CloneUnavailableError) {
      console.warn('[voice clone] unavailable:', error.message);
      return NextResponse.json({ error: 'This ElevenLabs plan or key cannot create voices.', code: 'unavailable' }, { status: 409 });
    }
    console.error('[voice clone]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Voice matching unavailable' }, { status: 503 });
  }
}

/** Current state for this speaker, so a refresh does not rebuild a voice that already exists. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json({ voiceId: voiceCloneFor(user.id)?.voiceId ?? null });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

/** Turning the setting off, leaving the room, or closing the tab deletes the voice. */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    await removeVoiceClone(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
