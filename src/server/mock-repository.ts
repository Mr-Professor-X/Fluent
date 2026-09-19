import { defaultSettings, type Conversation, type StoredMessage, type User } from './domain';
import type { FluidRepository } from './repositories';

const users = new Map<string, User>([
  ['alex', { id: 'alex', displayName: 'Alex Liu', email: 'alex@fluid.local', settings: defaultSettings }],
  ['maria', { id: 'maria', displayName: 'Maria Garcia', email: 'maria@fluid.local', settings: { ...defaultSettings, nativeLanguage: 'es', translationLanguage: 'es', preferredVoice: 'EXAVITQu4vr4xnSDxMaL' } }],
  ['jean', { id: 'jean', displayName: 'Jean Moreau', email: 'jean@fluid.local', settings: { ...defaultSettings, nativeLanguage: 'fr', translationLanguage: 'fr' } }],
  ['kenji', { id: 'kenji', displayName: 'Kenji Sato', email: 'kenji@fluid.local', settings: { ...defaultSettings, nativeLanguage: 'ja', translationLanguage: 'ja' } }]
]);
const conversations = new Map<string, Conversation>([
  ['maria-direct', { id: 'maria-direct', title: 'Maria Garcia', kind: 'direct', memberIds: ['alex', 'maria'], createdAt: new Date().toISOString() }],
  ['team-horizon', { id: 'team-horizon', title: 'Team Horizon', kind: 'group', memberIds: ['alex', 'maria', 'jean', 'kenji'], createdAt: new Date().toISOString() }]
]);
const messages = new Map<string, StoredMessage>();

export class MockRepository implements FluidRepository {
  async getUser(id: string) { return users.get(id) ?? null; }
  async updateSettings(userId: string, patch: Partial<User['settings']>) { const user = users.get(userId); if (!user) throw new Error('User not found'); user.settings = { ...user.settings, ...patch }; return user; }
  async getConversation(id: string) { return conversations.get(id) ?? null; }
  async listMessages(conversationId: string, memberId: string) { const c = conversations.get(conversationId); if (!c?.memberIds.includes(memberId)) throw new Error('Forbidden'); return [...messages.values()].filter(m => m.conversationId === conversationId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)); }
  async createMessage(message: Omit<StoredMessage, 'translations'>) { const stored = { ...message, translations: {} }; messages.set(stored.id, stored); return stored; }
  async saveTranslation(messageId: string, targetLanguage: string, text: string) { const m = messages.get(messageId); if (!m) throw new Error('Message not found'); m.translations[targetLanguage] = text; }
  async getMessage(id: string) { return messages.get(id) ?? null; }
}
export const repository = new MockRepository();
