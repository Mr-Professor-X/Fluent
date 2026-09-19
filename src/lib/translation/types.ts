export interface TranslationService {
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;
}
