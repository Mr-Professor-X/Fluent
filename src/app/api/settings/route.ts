import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { activeRepository } from '@/server/services/container';
import type { UserSettings } from '@/server/domain';

export async function GET(request: Request) { try { return NextResponse.json((await requireUser(request)).settings); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); } }
export async function PATCH(request: Request) { try { const user = await requireUser(request); const patch = await request.json() as Partial<UserSettings>; const allowed = ['nativeLanguage','translationLanguage','preferredVoice','voiceSource','shareMyVoice','translatedAudioEnabled','originalCaptionsEnabled','translatedCaptionsEnabled','originalAudioVolume','translatedAudioVolume'] as const; const safe = Object.fromEntries(allowed.filter(key => key in patch).map(key => [key, patch[key]])); return NextResponse.json((await activeRepository.updateSettings(user.id, safe)).settings); } catch { return NextResponse.json({ error: 'Unable to save settings' }, { status: 400 }); } }
