import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { activeRepository, messageService } from '@/server/services/container';
import type { Language } from '@/server/domain';

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try { const user = await requireUser(request); const { conversationId } = await context.params; const messages = await activeRepository.listMessages(conversationId, user.id); return NextResponse.json(await Promise.all(messages.map(message => messageService.forRecipient(message, user.id)))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load messages' }, { status: 403 }); }
}
/** Membership check only, used by the Socket.IO server before every room action. */
export async function HEAD(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try {
    const user = await requireUser(request);
    const { conversationId } = await context.params;
    const conversation = await activeRepository.getConversation(conversationId);
    return new Response(null, { status: conversation?.memberIds.includes(user.id) ? 204 : 403 });
  } catch {
    return new Response(null, { status: 401 });
  }
}
export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  try { const user = await requireUser(request); const { conversationId } = await context.params; const body = await request.json() as { text?: unknown; sourceLanguage?: unknown }; if (typeof body.text !== 'string') return NextResponse.json({ error: 'text is required' }, { status: 400 }); const message = await messageService.send({ conversationId, senderId: user.id, text: body.text, sourceLanguage: (typeof body.sourceLanguage === 'string' ? body.sourceLanguage : user.settings.nativeLanguage) as Language }); return NextResponse.json(await messageService.forRecipient(message, user.id), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to send message' }, { status: 400 }); }
}
