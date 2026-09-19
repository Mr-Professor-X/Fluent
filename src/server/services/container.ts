import { CachedTranslationService } from '@/lib/translation/cache';
import { MockTranslationService } from '@/lib/translation/mock';
import { RemoteTranslationService } from '@/lib/translation/provider';
import { repository } from '../mock-repository';
import { PostgresRepository } from '../postgres-repository';
import { MessageService } from './messages';
const provider = process.env.MOCK_SERVICES === 'false' ? new RemoteTranslationService() : new MockTranslationService();
export const activeRepository = process.env.MOCK_SERVICES === 'false' && process.env.DATABASE_URL ? new PostgresRepository() : repository;
export const messageService = new MessageService(activeRepository, new CachedTranslationService(provider));
