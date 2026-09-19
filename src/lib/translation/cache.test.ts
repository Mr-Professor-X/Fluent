import { describe, expect, it, vi } from 'vitest';
import { CachedTranslationService } from './cache';
describe('translation cache', () => it('does not translate the same message twice', async () => {
  const provider = { translate: vi.fn().mockResolvedValue('Hola') };
  const service = new CachedTranslationService(provider);
  await service.translate('Hello', 'en', 'es'); await service.translate('Hello', 'en', 'es');
  expect(provider.translate).toHaveBeenCalledTimes(1);
}));
