export type Language = 'en' | 'es' | 'fr' | 'ja' | 'de' | 'pt' | 'it' | 'ko' | 'zh' | 'ar' | 'hi' | 'nl' | 'ru';
export type UserSettings = { nativeLanguage: Language; translationLanguage: Language; preferredVoice: string; translatedAudioEnabled: boolean; originalCaptionsEnabled: boolean; translatedCaptionsEnabled: boolean; originalAudioVolume: number; translatedAudioVolume: number };
export type User = { id: string; displayName: string; email: string; settings: UserSettings };
export type Conversation = { id: string; title: string; kind: 'direct' | 'group'; memberIds: string[]; createdAt: string };
export type StoredMessage = { id: string; conversationId: string; senderId: string; originalText: string; sourceLanguage: Language; createdAt: string; translations: Record<string, string> };
export const defaultSettings: UserSettings = { nativeLanguage: 'en', translationLanguage: 'es', preferredVoice: 'pNInz6obpgDQGcFmaJgB', translatedAudioEnabled: true, originalCaptionsEnabled: true, translatedCaptionsEnabled: true, originalAudioVolume: 0.9, translatedAudioVolume: 0.75 };
