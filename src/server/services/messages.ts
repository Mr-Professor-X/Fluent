import { randomUUID } from 'crypto';
import type { Language, StoredMessage } from '../domain';
import type { FluidRepository } from '../repositories';
import type { TranslationService } from '@/lib/translation/types';

export class MessageService {
  constructor(private repo: FluidRepository, private translator: TranslationService) {}

  /** Stores the original once, then translates once per distinct recipient language. */
  async send(input: { conversationId: string; senderId: string; text: string; sourceLanguage: Language }) {
    const conversation = await this.repo.getConversation(input.conversationId);
    if (!conversation?.memberIds.includes(input.senderId)) throw new Error('Forbidden');
    const text = input.text.trim();
    if (!text || text.length > 4000) throw new Error('Invalid message');
    const message = await this.repo.createMessage({ id: randomUUID(), conversationId: input.conversationId, senderId: input.senderId, originalText: text, sourceLanguage: input.sourceLanguage, createdAt: new Date().toISOString() });
    const recipients = await Promise.all(conversation.memberIds.filter(id => id !== input.senderId).map(id => this.repo.getUser(id)));
    const languages = [...new Set(recipients.flatMap(user => (user ? [user.settings.translationLanguage] : [])).filter(language => language !== input.sourceLanguage))];
    // A failed translation must never fail the message: recipients fall back to the original text.
    await Promise.all(languages.map(async target => {
      try { await this.repo.saveTranslation(message.id, target, await this.translator.translate(text, input.sourceLanguage, target)); }
      catch (error) { console.warn(`[translation] ${input.sourceLanguage}->${target} unavailable:`, error instanceof Error ? error.message : error); }
    }));
    return (await this.repo.getMessage(message.id))!;
  }

  async forRecipient(message: StoredMessage, recipientId: string) {
    const recipient = await this.repo.getUser(recipientId);
    if (!recipient) throw new Error('Unauthorized');
    return { ...message, translatedText: message.translations[recipient.settings.translationLanguage] ?? null, targetLanguage: recipient.settings.translationLanguage };
  }
}
