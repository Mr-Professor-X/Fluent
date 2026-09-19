import { NextResponse } from 'next/server';
import { activeRepository } from '@/server/services/container';
import type { Language } from '@/server/domain';
import { isLanguageCode } from '@/lib/languages';

/** Creates (or updates) a guest user and adds them to the room. No sign-up needed. */
export async function POST(request: Request) {
  try {
    const userId = request.headers.get('x-fluid-user-id') ?? '';
    if (!/^[a-z0-9-]{2,64}$/i.test(userId)) return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    const body = (await request.json()) as { code?: string; name?: string; language?: string };
    const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const name = String(body.name ?? '').trim().slice(0, 40) || 'Guest';
    if (code.length < 4) return NextResponse.json({ error: 'Room code must be at least 4 letters or numbers' }, { status: 400 });
    if (!body.language || !isLanguageCode(body.language)) return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
    const language = body.language as Language;
    await activeRepository.upsertUser({ id: userId, displayName: name, settings: { nativeLanguage: language, translationLanguage: language } });
    const conversation = await activeRepository.joinConversation(`room-${code}`, `Room ${code}`, userId);
    return NextResponse.json({ conversationId: conversation.id, code, title: conversation.title });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not join the room' }, { status: 400 });
  }
}
