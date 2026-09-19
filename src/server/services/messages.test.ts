import { describe, expect, it } from 'vitest';
import { MockRepository } from '../mock-repository';
import { MessageService } from './messages';
describe('per-recipient group routing', () => it('stores separate translations by recipient language', async () => {
  const translator = { translate: async (text: string, _source: string, target: string) => `${target}:${text}` };
  const service = new MessageService(new MockRepository(), translator);
  const message = await service.send({ conversationId: 'team-horizon', senderId: 'alex', text: 'Hello', sourceLanguage: 'en' });
  expect(message.translations.es).toBe('es:Hello');
  expect(message.translations.fr).toBe('fr:Hello');
  expect(message.translations.ja).toBe('ja:Hello');
}));
