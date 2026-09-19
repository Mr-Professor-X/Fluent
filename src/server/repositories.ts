import type { Conversation, StoredMessage, User, UserSettings } from './domain';

export interface FluidRepository {
  getUser(id: string): Promise<User | null>;
  upsertUser(user: { id: string; displayName: string; settings: Partial<UserSettings> }): Promise<User>;
  updateSettings(userId: string, patch: Partial<UserSettings>): Promise<User>;
  getConversation(id: string): Promise<Conversation | null>;
  joinConversation(conversationId: string, title: string, userId: string): Promise<Conversation>;
  listMessages(conversationId: string, memberId: string): Promise<StoredMessage[]>;
  createMessage(message: Omit<StoredMessage, 'translations'>): Promise<StoredMessage>;
  saveTranslation(messageId: string, targetLanguage: string, text: string): Promise<void>;
  getMessage(id: string): Promise<StoredMessage | null>;
}
