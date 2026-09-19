import { describe, expect, it } from 'vitest';
import { MockRepository } from '../mock-repository';
import { MessageService } from './messages';

async function seedRoom(repo: MockRepository, conversationId: string) {
  const people = [['alex', 'en'], ['maria', 'es'], ['jean', 'fr'], ['kenji', 'ja']] as const;
  for (const [id, lang] of people) {
    await repo.upsertUser({ id, displayName: id, settings: { nativeLanguage: lang, translationLanguage: lang } });
    await repo.joinConversation(conversationId, 'Test room', id);
  }
}

describe('per-recipient group routing', () => {
  it('stores separate translations by recipient language', async () => {
    const repo = new MockRepository();
    await seedRoom(repo, 'room-test1');
    const translator = { translate: async (text: string, _source: string, target: string) => `${target}:${text}` };
    const service = new MessageService(repo, translator);
    const message = await service.send({ conversationId: 'room-test1', senderId: 'alex', text: 'Hello', sourceLanguage: 'en' });
    expect(message.translations.es).toBe('es:Hello');
    expect(message.translations.fr).toBe('fr:Hello');
    expect(message.translations.ja).toBe('ja:Hello');
    expect(message.translations.en).toBeUndefined();
  });

  it('still delivers the message when translation fails', async () => {
    const repo = new MockRepository();
    await seedRoom(repo, 'room-test2');
    const translator = { translate: async () => { throw new Error('provider down'); } };
    const service = new MessageService(repo, translator);
    const message = await service.send({ conversationId: 'room-test2', senderId: 'maria', text: 'Hola', sourceLanguage: 'es' });
    expect(message.originalText).toBe('Hola');
    expect(Object.keys(message.translations)).toHaveLength(0);
  });

  it('rejects senders who are not in the room', async () => {
    const repo = new MockRepository();
    await seedRoom(repo, 'room-test3');
    const service = new MessageService(repo, { translate: async (t: string) => t });
    await expect(service.send({ conversationId: 'room-test3', senderId: 'stranger', text: 'hi', sourceLanguage: 'en' })).rejects.toThrow('Forbidden');
  });
});
