import type { TranslationService } from './types';

/**
 * MyMemory: free, no API key needed. Good enough for a demo.
 * Optional MYMEMORY_EMAIL raises the free daily limit.
 */
export class MyMemoryTranslationService implements TranslationService {
  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    if (sourceLanguage === targetLanguage) return text;
    const code = (lang: string) => (lang === 'zh' ? 'zh-CN' : lang);
    const params = new URLSearchParams({ q: text, langpair: `${code(sourceLanguage)}|${code(targetLanguage)}` });
    if (process.env.MYMEMORY_EMAIL) params.set('de', process.env.MYMEMORY_EMAIL);
    const response = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`MyMemory failed [${response.status}]`);
    const json = (await response.json()) as { responseStatus?: number | string; responseData?: { translatedText?: string } };
    const out = json.responseData?.translatedText?.trim();
    if (Number(json.responseStatus) !== 200 || !out || out.startsWith('MYMEMORY WARNING')) throw new Error('MyMemory returned no translation');
    return out;
  }
}

/** DeepL: higher quality. Used when DEEPL_API_KEY is set (free keys end in ":fx"). */
export class DeepLTranslationService implements TranslationService {
  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    if (sourceLanguage === targetLanguage) return text;
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error('DeepL is not configured');
    const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const target = ({ en: 'EN-US', pt: 'PT-BR' } as Record<string, string>)[targetLanguage] ?? targetLanguage.toUpperCase();
    const response = await fetch(`${host}/v2/translate`, {
      method: 'POST',
      headers: { authorization: `DeepL-Auth-Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: [text], source_lang: sourceLanguage.toUpperCase(), target_lang: target }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`DeepL failed [${response.status}]`);
    const json = (await response.json()) as { translations?: Array<{ text?: string }> };
    const out = json.translations?.[0]?.text?.trim();
    if (!out) throw new Error('DeepL returned no translation');
    return out;
  }
}

/** Tries each provider in order, so one outage does not break the call. */
export class FallbackTranslationService implements TranslationService {
  constructor(private providers: TranslationService[]) {}
  async translate(text: string, sourceLanguage: string, targetLanguage: string) {
    let lastError: unknown;
    for (const provider of this.providers) {
      try { return await provider.translate(text, sourceLanguage, targetLanguage); }
      catch (error) { lastError = error; console.warn('[translation] provider failed, trying next:', error instanceof Error ? error.message : error); }
    }
    throw lastError instanceof Error ? lastError : new Error('Translation unavailable');
  }
}
