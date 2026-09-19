import { defaultSettings, type Conversation, type StoredMessage, type User, type UserSettings } from './domain';
import type { FluidRepository } from './repositories';

/**
 * In-memory store for local development and the hackathon demo.
 * Kept on globalThis so every API route (and hot reloads) share the same data.
 * Everything resets when the server restarts.
 */
type Store = { users: Map<string, User>; conversations: Map<string, Conversation>; messages: Map<string, StoredMessage> };
const globalStore = globalThis as unknown as { __fluidStore?: Store };
const store: Store = globalStore.__fluidStore ?? (globalStore.__fluidStore = { users: new Map(), conversations: new Map(), messages: new Map() });

export class MockRepository implements FluidRepository {
  async getUser(id: string) { return store.users.get(id) ?? null; }

  async upsertUser(input: { id: string; displayName: string; settings: Partial<UserSettings> }) {
    const existing = store.users.get(input.id);
    const user: User = {
      id: input.id,
      displayName: input.displayName,
      email: existing?.email ?? `${input.id}@fluid.local`,
      settings: { ...defaultSettings, ...existing?.settings, ...input.settings },
    };
    store.users.set(user.id, user);
    return user;
  }

  async updateSettings(userId: string, patch: Partial<UserSettings>) {
    const user = store.users.get(userId);
    if (!user) throw new Error('User not found');
    user.settings = { ...user.settings, ...patch };
    return user;
  }

  async getConversation(id: string) { return store.conversations.get(id) ?? null; }

  async joinConversation(conversationId: string, title: string, userId: string) {
    const conversation = store.conversations.get(conversationId) ?? { id: conversationId, title, kind: 'group' as const, memberIds: [], createdAt: new Date().toISOString() };
    if (!conversation.memberIds.includes(userId)) conversation.memberIds.push(userId);
    store.conversations.set(conversationId, conversation);
    return conversation;
  }

  async listMessages(conversationId: string, memberId: string) {
    const conversation = store.conversations.get(conversationId);
    if (!conversation?.memberIds.includes(memberId)) throw new Error('Forbidden');
    return [...store.messages.values()].filter(m => m.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createMessage(message: Omit<StoredMessage, 'translations'>) {
    const stored = { ...message, translations: {} };
    store.messages.set(stored.id, stored);
    return stored;
  }

  async saveTranslation(messageId: string, targetLanguage: string, text: string) {
    const message = store.messages.get(messageId);
    if (!message) throw new Error('Message not found');
    message.translations[targetLanguage] = text;
  }

  async getMessage(id: string) { return store.messages.get(id) ?? null; }
}

export const repository = new MockRepository();
