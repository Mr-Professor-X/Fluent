import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { activeRepository } from '@/server/services/container';

/** Who is in this room, and which language each person speaks. Members only. */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireUser(request);
    const { code } = await context.params;
    const conversation = await activeRepository.getConversation(`room-${code.toUpperCase()}`);
    if (!conversation?.memberIds.includes(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const people = await Promise.all(conversation.memberIds.map(id => activeRepository.getUser(id)));
    return NextResponse.json(people.filter(Boolean).map(p => ({ id: p!.id, name: p!.displayName, language: p!.settings.nativeLanguage })));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
