import type { TranslationService } from './types';

const words: Record<string, Record<string, string>> = {
  es: { 'Hello': 'Hola', 'How are you?': '¿Cómo estás?', 'Where should we meet?': '¿Dónde nos encontramos?', 'Let\'s meet at 7.': 'Nos vemos a las 7.', 'Sounds perfect!': '¡Suena perfecto!' },
  fr: { 'Hello': 'Bonjour', 'How are you?': 'Comment allez-vous ?', 'Where should we meet?': 'Où devons-nous nous retrouver ?', 'Let\'s meet at 7.': 'Rendez-vous à 19 h.' },
  ja: { 'Hello': 'こんにちは', 'Where should we meet?': 'どこで会いますか？' }
};

export class MockTranslationService implements TranslationService {
  async translate(text: string, source: string, target: string) {
    if (source === target) return text;
    return words[target]?.[text] ?? `[${target.toUpperCase()}] ${text}`;
  }
}
