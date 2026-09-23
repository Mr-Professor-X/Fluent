/**
 * "Sounds like the actual person" voices.
 *
 * A speaker who turns on voice matching lets Fluid build a temporary ElevenLabs instant voice
 * from the clips their microphone already produced for transcription. Listeners who chose
 * "match the speaker" then hear translations in that voice instead of a stock one.
 *
 * Rules that keep this honest:
 * - Only the speaker can start it (consent lives on their own device, off by default).
 * - The voice is temporary: it is deleted when they turn the setting off, leave the room,
 *   or after CLONE_TTL_MS, whichever comes first.
 * - Clip audio is forwarded to ElevenLabs and never written to disk here.
 */
import { describeFailure, elevenLabsFetch } from './client';

export type CloneRecord = { voiceId: string; userId: string; createdAt: number };

/** Kept on globalThis so every API route and hot reload sees the same registry. */
const globalRegistry = globalThis as unknown as { __fluidVoiceClones?: Map<string, CloneRecord> };
const registry: Map<string, CloneRecord> = globalRegistry.__fluidVoiceClones ?? (globalRegistry.__fluidVoiceClones = new Map());

const CLONE_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_CLONE_BYTES = 6_000_000;
export const MAX_CLONE_FILES = 8;

export class CloneUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloneUnavailableError';
  }
}

function mockVoiceId(userId: string) {
  return `mock-clone-${userId}`;
}

function sweep() {
  const cutoff = Date.now() - CLONE_TTL_MS;
  for (const [userId, record] of registry) {
    if (record.createdAt < cutoff) {
      registry.delete(userId);
      void deleteRemoteVoice(record.voiceId);
    }
  }
}

/** The matched voice for a speaker, if they have one right now. */
export function voiceCloneFor(userId: string): CloneRecord | null {
  sweep();
  return registry.get(userId) ?? null;
}

/** True when this voice id is a matched speaker voice, so TTS can use clone-friendly settings. */
export function isVoiceClone(voiceId: string): boolean {
  if (!voiceId) return false;
  sweep();
  for (const record of registry.values()) if (record.voiceId === voiceId) return true;
  return false;
}

async function deleteRemoteVoice(voiceId: string) {
  if (process.env.MOCK_SERVICES === 'true' || voiceId.startsWith('mock-')) return;
  try {
    await elevenLabsFetch(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
  } catch (error) {
    console.warn('[voice clone] could not delete', voiceId, error instanceof Error ? error.message : error);
  }
}

/**
 * Builds (or rebuilds) the matched voice for one speaker.
 * Throws CloneUnavailableError when the ElevenLabs plan or key does not allow voice creation,
 * so the UI can explain it once instead of retrying.
 */
export async function createVoiceClone(userId: string, displayName: string, samples: Blob[]): Promise<CloneRecord> {
  const previous = registry.get(userId);

  if (process.env.MOCK_SERVICES === 'true') {
    const record: CloneRecord = { voiceId: mockVoiceId(userId), userId, createdAt: Date.now() };
    registry.set(userId, record);
    return record;
  }

  const form = new FormData();
  form.append('name', `fluid-${userId}-${Date.now().toString(36)}`);
  form.append('description', 'Temporary Fluid voice match. Deleted when the speaker leaves.');
  form.append('remove_background_noise', 'true');
  form.append('labels', JSON.stringify({ app: 'fluid', kind: 'voice-match', speaker: displayName.slice(0, 40) }));
  samples.forEach((sample, index) => form.append('files', sample, `sample-${index}.wav`));

  const response = await elevenLabsFetch('/v1/voices/add', { method: 'POST', body: form });
  if (!response.ok) {
    const detail = await describeFailure(response, 'Voice match');
    if (response.status === 401 || response.status === 403 || response.status === 402) throw new CloneUnavailableError(detail);
    throw new Error(detail);
  }
  const json = (await response.json()) as { voice_id?: string };
  if (!json.voice_id) throw new Error('ElevenLabs did not return a voice id');

  const record: CloneRecord = { voiceId: json.voice_id, userId, createdAt: Date.now() };
  registry.set(userId, record);
  // Replacing an earlier voice: drop the old one so the account does not fill up with leftovers.
  if (previous && previous.voiceId !== record.voiceId) void deleteRemoteVoice(previous.voiceId);
  return record;
}

/** Called when the speaker turns matching off, leaves, or closes the tab. */
export async function removeVoiceClone(userId: string) {
  const record = registry.get(userId);
  if (!record) return;
  registry.delete(userId);
  await deleteRemoteVoice(record.voiceId);
}
