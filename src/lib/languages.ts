/** One place for every supported language. Add a row here to add a language. */
export type LanguageOption = {
  code: 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ja' | 'ko' | 'zh' | 'hi' | 'ar' | 'ru' | 'nl';
  name: string;
  native: string;
  flag: string;
  /** Browser voice tag, used for the mock voice. */
  speech: string;
};

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', native: 'English', flag: '🇺🇸', speech: 'en-US' },
  { code: 'es', name: 'Spanish', native: 'Español', flag: '🇪🇸', speech: 'es-ES' },
  { code: 'fr', name: 'French', native: 'Français', flag: '🇫🇷', speech: 'fr-FR' },
  { code: 'de', name: 'German', native: 'Deutsch', flag: '🇩🇪', speech: 'de-DE' },
  { code: 'it', name: 'Italian', native: 'Italiano', flag: '🇮🇹', speech: 'it-IT' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flag: '🇧🇷', speech: 'pt-BR' },
  { code: 'ja', name: 'Japanese', native: '日本語', flag: '🇯🇵', speech: 'ja-JP' },
  { code: 'ko', name: 'Korean', native: '한국어', flag: '🇰🇷', speech: 'ko-KR' },
  { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳', speech: 'zh-CN' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flag: '🇸🇦', speech: 'ar-SA' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flag: '🇮🇳', speech: 'hi-IN' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flag: '🇳🇱', speech: 'nl-NL' },
  { code: 'ru', name: 'Russian', native: 'Русский', flag: '🇷🇺', speech: 'ru-RU' },
];

export function isLanguageCode(code: string): code is LanguageOption['code'] {
  return LANGUAGES.some(l => l.code === code);
}

export function languageByCode(code: string): LanguageOption {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0];
}
