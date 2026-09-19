export type FluidEvent =
  | { type: 'call:join'; conversationId: string }
  | { type: 'call:leave'; conversationId: string }
  | { type: 'webrtc:offer'; conversationId: string; targetId: string; offer: RTCSessionDescriptionInit }
  | { type: 'webrtc:answer'; conversationId: string; targetId: string; answer: RTCSessionDescriptionInit }
  | { type: 'webrtc:ice-candidate'; conversationId: string; targetId: string; candidate: RTCIceCandidateInit }
  | { type: 'conversation:join'; conversationId: string }
  | { type: 'conversation:leave'; conversationId: string }
  | { type: 'message:send'; conversationId: string; text: string }
  | { type: 'speech:partial'; conversationId: string; text: string; sourceLanguage: string }
  | { type: 'speech:final'; conversationId: string; text: string; sourceLanguage: string }
  | { type: 'translation:complete'; messageId: string; targetLanguage: string; text: string }
  | { type: 'settings:update'; settings: Record<string, unknown> };
