import type { TranslationService } from './types';

/** Fake translations for MOCK_SERVICES=true. Covers the mock transcripts so demos read naturally. */
const phrases: Record<string, Record<string, string>> = {
  'Hi, can you hear me?': { es: 'Hola, ¿me escuchas?', fr: 'Salut, tu m’entends ?', ja: 'もしもし、聞こえますか？' },
  'Where should we meet tomorrow?': { es: '¿Dónde nos vemos mañana?', fr: 'On se retrouve où demain ?', ja: '明日はどこで会いましょうか？' },
  'That sounds great to me.': { es: 'Me parece genial.', fr: 'Ça me va très bien.', ja: 'いいですね。' },
  'Hola, ¿me escuchas?': { en: 'Hi, can you hear me?', fr: 'Salut, tu m’entends ?' },
  '¿Dónde nos vemos mañana?': { en: 'Where should we meet tomorrow?', fr: 'On se retrouve où demain ?' },
  'Me parece genial.': { en: 'That sounds great to me.', fr: 'Ça me va très bien.' },
  'Hello': { es: 'Hola', fr: 'Bonjour', ja: 'こんにちは' },
  'Hola': { en: 'Hello', fr: 'Bonjour' },
};

export class MockTranslationService implements TranslationService {
  async translate(text: string, source: string, target: string) {
    if (source === target) return text;
    return phrases[text]?.[target] ?? `[${target.toUpperCase()}] ${text}`;
  }
}
