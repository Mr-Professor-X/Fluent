import { io, type Socket } from 'socket.io-client';
import type { FluidEvent } from './events';

export class SocketRealtimeClient {
  private socket: Socket;
  constructor(userId: string) { this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? window.location.origin, { auth: { userId } }); }
  on(event: string, handler: (payload: any) => void) { this.socket.on(event, handler); return () => this.socket.off(event, handler); }
  emit(event: FluidEvent['type'] | string, payload: Record<string, unknown>, ack?: (result: { ok: boolean; error?: string }) => void) { this.socket.emit(event, payload, ack); }
  disconnect() { this.socket.disconnect(); }
}
