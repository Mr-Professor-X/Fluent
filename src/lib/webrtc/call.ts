export type Signal = { type: 'offer' | 'answer' | 'ice'; payload: RTCSessionDescriptionInit | RTCIceCandidateInit };
/** Media uses WebRTC; signaling is intentionally transport-agnostic (Socket.IO in deployment). */
export class CallPeer {
  readonly connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  constructor(private signal: (event: Signal) => void) { this.connection.onicecandidate = event => { if (event.candidate) signal({ type: 'ice', payload: event.candidate.toJSON() }); }; }
  async attachLocalStream(stream: MediaStream) { stream.getTracks().forEach(track => this.connection.addTrack(track, stream)); }
  async createOffer() { const offer = await this.connection.createOffer(); await this.connection.setLocalDescription(offer); this.signal({ type: 'offer', payload: offer }); }
  async receive(event: Signal) { if (event.type === 'ice') return void await this.connection.addIceCandidate(event.payload as RTCIceCandidateInit); await this.connection.setRemoteDescription(event.payload as RTCSessionDescriptionInit); if (event.type === 'offer') { const answer = await this.connection.createAnswer(); await this.connection.setLocalDescription(answer); this.signal({ type: 'answer', payload: answer }); } }
  close() { this.connection.close(); }
}
