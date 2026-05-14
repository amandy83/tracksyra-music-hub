// Audio file validation – decodes header to read bitrate/sample-rate/channels/duration.
// Reject corrupted, low-quality, or oversize files.

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const MIN_DURATION = 30; // sec
const MIN_SAMPLE_RATE = 44100;
const MIN_BITRATE_MP3 = 320; // for MP3 only
const ALLOWED_EXT = ["wav", "flac", "mp3"] as const;

export type AudioMeta = {
  format: "wav" | "flac" | "mp3";
  bitrate_kbps: number | null;
  sample_rate_hz: number;
  channels: number;
  duration_sec: number;
  file_size_bytes: number;
  hash: string; // sha-256 hex
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
  const ext = file.name.split(".").pop()?.toLowerCase() as AudioMeta["format"] | undefined;
  if (!ext || !ALLOWED_EXT.includes(ext as any)) {
    errors.push(`Unsupported format. Use WAV, FLAC, or MP3 (320 kbps).`);
  }
  if (file.size > MAX_BYTES) errors.push(`File too large (max 500 MB).`);
  if (file.size < 1024) errors.push(`File looks empty or corrupted.`);
  if (errors.length) return { ok: false, errors };

  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);

  let audio: AudioBuffer;
  try {
    audio = await decodeAudio(buf);
  } catch {
    return { ok: false, errors: [`File could not be decoded — it may be corrupted.`] };
  }

  const sample_rate_hz = audio.sampleRate;
  const channels = audio.numberOfChannels;
  const duration_sec = audio.duration;

  // approx bitrate (bytes -> kbps), accurate enough for filtering
  const bitrate_kbps = Math.round((file.size * 8) / duration_sec / 1000);

  if (duration_sec < MIN_DURATION) errors.push(`Track too short (${duration_sec.toFixed(1)}s). Minimum ${MIN_DURATION}s.`);
  if (sample_rate_hz < MIN_SAMPLE_RATE) errors.push(`Sample rate too low (${sample_rate_hz} Hz). Need ≥ ${MIN_SAMPLE_RATE} Hz.`);
  if (channels < 1 || channels > 2) errors.push(`Unsupported channel count (${channels}).`);
  if (ext === "mp3" && bitrate_kbps < MIN_BITRATE_MP3 - 20) {
    errors.push(`MP3 bitrate too low (~${bitrate_kbps} kbps). Use 320 kbps MP3, or upload WAV/FLAC.`);
  }

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
      hash,
    },
  };
}
