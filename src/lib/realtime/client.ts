import type { FluidEvent } from './events';

/** Same-origin development transport. Swap for the authenticated Socket.IO adapter in deployment. */
export class RealtimeClient {
  private channel = typeof window === 'undefined' ? null : new BroadcastChannel('fluid-events');
  publish(event: FluidEvent) { this.channel?.postMessage(event); }
  subscribe(handler: (event: FluidEvent) => void) { if (!this.channel) return () => {}; const listener = (event: MessageEvent<FluidEvent>) => handler(event.data); this.channel.addEventListener('message', listener); return () => this.channel?.removeEventListener('message', listener); }
  close() { this.channel?.close(); }
}
