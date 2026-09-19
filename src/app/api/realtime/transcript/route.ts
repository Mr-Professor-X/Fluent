import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { activeRepository, messageService } from '@/server/services/container';
import type { Language } from '@/server/domain';

/** Every line (spoken or typed) enters the same membership-checked, cached, per-recipient translation pipeline. */
export async function POST(request: Request) {
  try {
    const speaker = await requireUser(request);
    const body = (await request.json()) as { conversationId?: string; text?: string; sourceLanguage?: Language };
    if (!body.conversationId || !body.text) return NextResponse.json({ error: 'conversationId and text are required' }, { status: 400 });
    const message = await messageService.send({ conversationId: body.conversationId, senderId: speaker.id, text: body.text, sourceLanguage: body.sourceLanguage ?? speaker.settings.nativeLanguage });
    const conversation = await activeRepository.getConversation(body.conversationId);
    if (!conversation) throw new Error('Conversation not found');
    const recipients = await Promise.all(conversation.memberIds.filter(id => id !== speaker.id).map(async userId => {
      const user = await activeRepository.getUser(userId);
      if (!user) return null;
      const target = user.settings.translationLanguage;
      const translated = target === message.sourceLanguage ? message.originalText : message.translations[target];
      return { userId, targetLanguage: target, text: translated ?? message.originalText, translationFailed: translated === undefined };
    }));
    return NextResponse.json({ messageId: message.id, speakerId: speaker.id, speakerName: speaker.displayName, originalText: message.originalText, sourceLanguage: message.sourceLanguage, recipients: recipients.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Transcript processing unavailable' }, { status: 400 });
  }
}
