import type { TranslationService } from './types';
export class CachedTranslationService implements TranslationService {
  private cache = new Map<string, string>();
  constructor(private provider: TranslationService) {}
  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    if (sourceLanguage === targetLanguage) return text;
    const key = `${sourceLanguage}:${targetLanguage}:${text}`;
    const known = this.cache.get(key); if (known) return known;
    const translated = await this.provider.translate(text, sourceLanguage, targetLanguage); this.cache.set(key, translated); return translated;
  }
}
