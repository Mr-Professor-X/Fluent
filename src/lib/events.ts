export type Language = "en" | "es" | "fr" | "ja" | "de" | "zh" | "ko";

export interface Caption {
  speakerId: string;
  speakerName: string;
  original: string;
  originalLang: Language;
  translated?: string; // missing if translation failed
}

export interface ChatMessage {
  id: string;
  speakerName: string;
  original: string;
  originalLang: Language;
  translated?: string;
  createdAt: string;
}

export interface ClientToServer {
  "room:join": (p: { roomId: string; userId: string }) => void;
  "speech:partial": (p: { text: string }) => void;
  "speech:final": (p: { text: string; lang: Language }) => void;
  "message:send": (p: { text: string; lang: Language }) => void;
}

export interface ServerToClient {
  "participant:list": (p: { users: { id: string; name: string; language: Language }[] }) => void;
  "speech:partial": (p: { speakerName: string; text: string }) => void;
  "caption:new": (p: Caption) => void;
  "message:new": (p: ChatMessage) => void;
}