import type { TranslationService } from './types';
/** Generic server-side HTTP adapter. Configure TRANSLATION_API_URL for a provider gateway. */
export class RemoteTranslationService implements TranslationService {
  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    const url = process.env.TRANSLATION_API_URL, key = process.env.TRANSLATION_API_KEY;
    if (!url || !key) throw new Error('Translation provider is not configured');
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ text, sourceLanguage, targetLanguage }) });
    if (!response.ok) throw new Error('Translation provider unavailable');
    const result = await response.json() as { translatedText?: string };
    if (!result.translatedText) throw new Error('Translation provider returned an invalid response');
    return result.translatedText;
  }
}
