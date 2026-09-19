export type Transcript = { text: string; language: string; isFinal: boolean; startedAt: number; endedAt?: number };
export interface SpeechToTextService { transcribeAudio(audio: Blob, preferredLanguage?: string): Promise<Transcript>; }
