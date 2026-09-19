import { CachedTranslationService } from '@/lib/translation/cache';
import { MockTranslationService } from '@/lib/translation/mock';
import { DeepLTranslationService, FallbackTranslationService, MyMemoryTranslationService } from '@/lib/translation/providers';
import type { TranslationService } from '@/lib/translation/types';
import { repository } from '../mock-repository';
import { PostgresRepository } from '../postgres-repository';
import { MessageService } from './messages';

/** MOCK_SERVICES=true keeps every AI call fake so the UI can be built without keys. */
export const mockServices = process.env.MOCK_SERVICES === 'true';

function pickTranslator(): TranslationService {
  if (mockServices) return new MockTranslationService();
  const chain: TranslationService[] = [];
  if (process.env.DEEPL_API_KEY) chain.push(new DeepLTranslationService());
  chain.push(new MyMemoryTranslationService());
  return new FallbackTranslationService(chain);
}

/** The database is a separate switch from the AI services. */
export const activeRepository = process.env.USE_POSTGRES === 'true' && process.env.DATABASE_URL ? new PostgresRepository() : repository;
export const messageService = new MessageService(activeRepository, new CachedTranslationService(pickTranslator()));
