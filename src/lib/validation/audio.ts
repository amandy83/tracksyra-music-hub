// Audio file validation: strict DSP master checks before upload.

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const MIN_BYTES = 1 * 1024 * 1024; // 1 MB
const MIN_DURATION = 30; // sec
const MIN_SAMPLE_RATE = 44100;
const MIN_BIT_DEPTH = 16;
const ALLOWED_EXT = ["wav", "flac"] as const;
const REJECTED_EXT = new Set(["mp3", "aac", "m4a", "ogg", "wma"]);

export type AudioMeta = {
  format: "wav" | "flac";
  bitrate_kbps: number | null;
  sample_rate_hz: number;
  channels: number;
  duration_sec: number;
  file_size_bytes: number;
  bit_depth: number;
  hash: string;
};

export type AudioValidationResult =
  | { ok: true; meta: AudioMeta }
  | { ok: false; errors: string[] };

const sha256 = async (buf: ArrayBuffer): Promise<string> => {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const decodeAudio = (buf: ArrayBuffer) =>
  new Promise<AudioBuffer>((resolve, reject) => {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    ctx.decodeAudioData(buf.slice(0), resolve, (e) => reject(e || new Error("decode failed")));
  });

export async function validateAudio(file: File): Promise<AudioValidationResult> {
  const errors: string[] = [];
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (!ext || (!ALLOWED_EXT.includes(ext as AudioMeta["format"]) && !REJECTED_EXT.has(ext))) {
    errors.push("Unsupported format. Upload a WAV or FLAC master.");
  } else if (REJECTED_EXT.has(ext)) {
    errors.push(`${ext.toUpperCase()} is not accepted for distribution masters. Upload WAV or FLAC.`);
  }
  if (file.size > MAX_BYTES) errors.push("File too large (max 500 MB).");
  if (file.size <= MIN_BYTES) errors.push("File too small. Audio masters must be larger than 1 MB.");
  if (errors.length) return { ok: false, errors };

  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const header = readAudioHeader(buf, ext as AudioMeta["format"]);
  if (header.ok === false) return { ok: false, errors: header.errors };

  let audio: AudioBuffer;
  try {
    audio = await decodeAudio(buf);
  } catch {
    return { ok: false, errors: ["File could not be decoded. The audio header or stream may be corrupted."] };
  }

  const sample_rate_hz = audio.sampleRate;
  const channels = audio.numberOfChannels;
  const duration_sec = audio.duration;
  const bitrate_kbps = Math.round((file.size * 8) / duration_sec / 1000);

  if (duration_sec < MIN_DURATION) errors.push(`Track too short (${duration_sec.toFixed(1)}s). Minimum ${MIN_DURATION}s.`);
  if (sample_rate_hz < MIN_SAMPLE_RATE) errors.push(`Sample rate too low (${sample_rate_hz} Hz). Need at least ${MIN_SAMPLE_RATE} Hz.`);
  if (channels !== 2) errors.push(`Audio must be stereo. Detected ${channels} channel${channels === 1 ? "" : "s"}.`);
  if (header.meta.bitDepth < MIN_BIT_DEPTH) errors.push(`Bit depth too low (${header.meta.bitDepth}-bit). Need at least ${MIN_BIT_DEPTH}-bit.`);
  if (header.meta.sampleRate && header.meta.sampleRate !== sample_rate_hz) errors.push("Audio header sample rate does not match decoded sample rate.");
  if (header.meta.channels && header.meta.channels !== channels) errors.push("Audio header channel count does not match decoded channel count.");

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    meta: {
      format: ext as AudioMeta["format"],
      bitrate_kbps,
      sample_rate_hz,
      channels,
      duration_sec: Math.round(duration_sec * 100) / 100,
      file_size_bytes: file.size,
      bit_depth: header.meta.bitDepth,
      hash,
    },
  };
}

type HeaderResult =
  | { ok: true; meta: { bitDepth: number; sampleRate: number | null; channels: number | null } }
  | { ok: false; errors: string[] };

function readAudioHeader(buf: ArrayBuffer, ext: AudioMeta["format"]): HeaderResult {
  return ext === "wav" ? readWavHeader(buf) : readFlacHeader(buf);
}

function readWavHeader(buf: ArrayBuffer): HeaderResult {
  if (buf.byteLength < 44) return { ok: false, errors: ["WAV header is truncated or corrupted."] };
  const view = new DataView(buf);
  if (ascii(buf, 0, 4) !== "RIFF" || ascii(buf, 8, 4) !== "WAVE") {
    return { ok: false, errors: ["File header is not valid WAV."] };
  }

  let offset = 12;
  while (offset + 8 <= buf.byteLength) {
    const chunkId = ascii(buf, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    if (offset + 8 + chunkSize > buf.byteLength + 1) break;
    if (chunkId === "fmt ") {
      if (chunkSize < 16) return { ok: false, errors: ["WAV fmt chunk is corrupted."] };
      const channels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const bitDepth = view.getUint16(offset + 22, true);
      return { ok: true, meta: { bitDepth, sampleRate, channels } };
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return { ok: false, errors: ["WAV fmt chunk is missing."] };
}

function readFlacHeader(buf: ArrayBuffer): HeaderResult {
  if (buf.byteLength < 42 || ascii(buf, 0, 4) !== "fLaC") {
    return { ok: false, errors: ["File header is not valid FLAC."] };
  }
  const blockHeader = new Uint8Array(buf, 4, 4);
  const blockType = blockHeader[0] & 0x7f;
  const blockLength = (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3];
  if (blockType !== 0 || blockLength < 34 || buf.byteLength < 8 + blockLength) {
    return { ok: false, errors: ["FLAC STREAMINFO header is missing or corrupted."] };
  }

  const streamInfo = new Uint8Array(buf, 8, blockLength);
  const sampleRate = (streamInfo[10] << 12) | (streamInfo[11] << 4) | (streamInfo[12] >> 4);
  const channels = ((streamInfo[12] & 0x0e) >> 1) + 1;
  const bitDepth = (((streamInfo[12] & 0x01) << 4) | (streamInfo[13] >> 4)) + 1;
  return { ok: true, meta: { bitDepth, sampleRate, channels } };
}

function ascii(buf: ArrayBuffer, offset: number, length: number): string {
  return String.fromCharCode(...new Uint8Array(buf, offset, length));
}
