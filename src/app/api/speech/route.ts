import { NextResponse } from 'next/server';
import { generateTranslatedSpeech } from '@/lib/elevenlabs/speech';
import { requireUser } from '@/server/auth';

export async function POST(request: Request) { try { await requireUser(request); const { text, voiceId } = await request.json() as { text?: string; voiceId?: string }; if (!text || text.length > 4000) return NextResponse.json({ error: 'Invalid text' }, { status: 400 }); const result = await generateTranslatedSpeech(text, voiceId ?? ''); if (result.mock) return NextResponse.json(result); return new Response(result.audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Speech generation unavailable' }, { status: 503 }); } }
