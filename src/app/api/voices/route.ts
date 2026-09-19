import { NextResponse } from 'next/server';
import { listVoices } from '@/lib/elevenlabs/voices';

export async function GET() {
  return NextResponse.json(await listVoices());
}
