import { NextResponse } from 'next/server';

/**
 * ICE servers for the call. STUN finds a direct path; TURN relays audio/video when a network
 * (campus Wi-Fi, strict firewalls) blocks direct connections between laptops.
 *
 * Options (set in .env, all optional):
 *  - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN  -> short-lived Cloudflare TURN credentials
 *  - TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL -> any other TURN server
 */
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
let cached: { servers: RTCIceServer[]; expires: number } | null = null;

async function cloudflareTurn(): Promise<RTCIceServer[] | null> {
  const id = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN;
  if (!id || !token) return null;
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: 86400 }),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`Cloudflare TURN failed [${response.status}]`);
  const json = (await response.json()) as { iceServers?: RTCIceServer[] | RTCIceServer };
  const servers = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : [];
  return servers.length ? servers : null;
}

function genericTurn(): RTCIceServer[] | null {
  const urls = process.env.TURN_URLS?.split(',').map(u => u.trim()).filter(Boolean);
  if (!urls?.length) return null;
  return [{ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }];
}

export async function GET() {
  if (cached && cached.expires > Date.now()) return NextResponse.json({ iceServers: cached.servers, relay: true });
  try {
    const turn = (await cloudflareTurn()) ?? genericTurn();
    if (turn) {
      cached = { servers: [...STUN, ...turn], expires: Date.now() + 60 * 60 * 1000 };
      return NextResponse.json({ iceServers: cached.servers, relay: true });
    }
  } catch (error) {
    console.warn('[ice] TURN unavailable, using STUN only:', error instanceof Error ? error.message : error);
  }
  return NextResponse.json({ iceServers: STUN, relay: false });
}
