// Ported from Kevin's Lovable prototype (synchro-voice-chat). Framework-agnostic browser code.
/**
 * Microphone capture that cuts speech into complete WAV clips at natural pauses.
 * Browser-only: every API here is touched inside methods, never at module load.
 */

const TARGET_RATE = 16000;
const SILENCE_RMS = 0.012;
const SILENCE_MS = 900;
const MIN_SPEECH_MS = 500;
const MAX_SEGMENT_MS = 15000;

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  let length = 0;
  for (const c of chunks) length += c.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const samples = downsample(merged, sampleRate, TARGET_RATE);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let pos = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    pos += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read audio"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export type MicHandle = {
  stop: () => void;
};

export type MicOptions = {
  onSegment: (clip: Blob) => void;
  onLevel?: (level: number) => void;
};

export async function startMic({ onSegment, onLevel }: MicOptions): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  let chunks: Float32Array[] = [];
  let speechMs = 0;
  let silenceMs = 0;
  let segmentMs = 0;
  let stopped = false;

  const flush = () => {
    if (speechMs >= MIN_SPEECH_MS && chunks.length > 0) {
      onSegment(encodeWav(chunks, ctx.sampleRate));
    }
    chunks = [];
    speechMs = 0;
    silenceMs = 0;
    segmentMs = 0;
  };

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i]! * input[i]!;
    const rms = Math.sqrt(sum / input.length);
    onLevel?.(Math.min(1, rms * 12));

    const frameMs = (input.length / ctx.sampleRate) * 1000;
    const speaking = rms > SILENCE_RMS;

    if (speaking || chunks.length > 0) {
      chunks.push(new Float32Array(input));
      segmentMs += frameMs;
    }
    if (speaking) {
      speechMs += frameMs;
      silenceMs = 0;
    } else if (chunks.length > 0) {
      silenceMs += frameMs;
    }

    if ((silenceMs >= SILENCE_MS && chunks.length > 0) || segmentMs >= MAX_SEGMENT_MS) {
      flush();
    }
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      flush();
      processor.disconnect();
      source.disconnect();
      silent.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      onLevel?.(0);
    },
  };
}
