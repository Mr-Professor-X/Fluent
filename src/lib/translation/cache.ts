import type { TranslationService } from './types';

/**
 * Remembers recent translations so the same sentence is never paid for twice.
 * Capped and least-recently-used, so a long-running server cannot grow without limit.
 */
export class CachedTranslationService implements TranslationService {
  private cache = new Map<string, string>();
  constructor(private provider: TranslationService, private maxEntries = 2000) {}

  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    if (sourceLanguage === targetLanguage) return text;
    const key = `${sourceLanguage}:${targetLanguage}:${text}`;
    const known = this.cache.get(key);
    if (known !== undefined) {
      this.cache.delete(key); // re-insert so recently used entries survive eviction
      this.cache.set(key, known);
      return known;
    }
    const translated = await this.provider.translate(text, sourceLanguage, targetLanguage);
    this.cache.set(key, translated);
    if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
    return translated;
  }
}
