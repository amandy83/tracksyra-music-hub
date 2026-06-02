import { extname } from "node:path";
import type { AudioCodec, AudioQualityMetadata, MediaValidationIssue, MediaValidationResult } from "../models";
import { FfmpegRunner } from "./ffmpeg";

const ALLOWED_AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".flac", ".aiff", ".aif"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/flac", "audio/aiff", "audio/x-aiff"]);
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
const MIN_DURATION_SEC = 30;
const MAX_DURATION_SEC = 60 * 60 * 3;
const MIN_SAMPLE_RATE_HZ = 44_100;
const MAX_SILENCE_RATIO = 0.35;

export class MediaValidationService {
  constructor(private readonly ffmpeg = new FfmpegRunner()) {}

  validateUploadEnvelope(input: { filename: string; mimeType: string; sizeBytes: number }): MediaValidationIssue[] {
    const issues: MediaValidationIssue[] = [];
    const ext = extname(input.filename).toLowerCase();
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) issues.push(error("unsupported_extension", "Audio must be WAV, MP3, FLAC, or AIFF."));
    if (!ALLOWED_AUDIO_MIME_TYPES.has(input.mimeType.toLowerCase())) issues.push(error("unsupported_mime", "Audio MIME type is not allowed."));
    if (input.sizeBytes > MAX_AUDIO_BYTES) issues.push(error("oversized_file", "Audio file exceeds the 500 MB limit."));
    if (input.sizeBytes < 1024) issues.push(error("empty_file", "Audio file is empty or truncated."));
    if (input.filename.includes("..") || input.filename.includes("/") || input.filename.includes("\\")) {
      issues.push(error("path_traversal", "Audio filename contains unsafe path characters."));
    }
    if (/\.(exe|dll|bat|cmd|sh|msi|scr|ps1)$/i.test(input.filename)) issues.push(error("executable_upload", "Executable uploads are blocked."));
    return issues;
  }

  async validateAudioFile(path: string, envelope: { filename: string; mimeType: string; sizeBytes: number }): Promise<MediaValidationResult> {
    const issues = this.validateUploadEnvelope(envelope);
    if (issues.some((issue) => issue.severity === "error")) return { ok: false, issues };

    try {
      const probe = await this.ffmpeg.probe(path);
      const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
      if (!audioStream) return { ok: false, issues: [error("no_audio_stream", "File does not contain a decodable audio stream.")] };

      const loudness = await this.ffmpeg.analyzeLoudness(path).catch(() => ({ lufs: null, peakDb: null }));
      const durationSec = readNumber(audioStream.duration) ?? readNumber(probe.format?.duration) ?? 0;
      const bitrateKbps = Math.round((readNumber(audioStream.bit_rate) ?? readNumber(probe.format?.bit_rate) ?? 0) / 1000) || null;
      const sampleRateHz = Math.round(readNumber(audioStream.sample_rate) ?? 0);
      const channels = audioStream.channels ?? 0;
      const codec = normalizeCodec(audioStream.codec_name || probe.format?.format_name);
      const peakDb = loudness.peakDb;
      const hasClipping = peakDb !== null && peakDb >= -0.1;
      const silenceRatio = await this.estimateSilenceRatio(path).catch(() => 0);

      if (durationSec < MIN_DURATION_SEC) issues.push(error("duration_too_short", `Audio duration must be at least ${MIN_DURATION_SEC} seconds.`));
      if (durationSec > MAX_DURATION_SEC) issues.push(error("duration_too_long", "Audio duration exceeds the 3 hour limit."));
      if (sampleRateHz < MIN_SAMPLE_RATE_HZ) issues.push(error("sample_rate_too_low", "Audio sample rate must be at least 44.1 kHz."));
      if (channels < 1 || channels > 2) issues.push(error("unsupported_channels", "Audio must be mono or stereo."));
      if (hasClipping) issues.push(error("clipping_detected", "Audio contains clipping and must be fixed before distribution."));
      if (silenceRatio > MAX_SILENCE_RATIO) issues.push(error("excessive_silence", "Audio contains too much silence for distribution."));
      if (bitrateKbps !== null && codec === "mp3" && bitrateKbps < 120) issues.push(error("bitrate_too_low", "MP3 bitrate is too low for distribution."));

      const metadata: AudioQualityMetadata = {
        bitrateKbps,
        durationSec: round(durationSec),
        codec,
        sampleRateHz,
        channels,
        lufs: loudness.lufs,
        bpm: null,
        peakDb,
        hasClipping,
        silenceRatio: round(silenceRatio),
        corruptedFrames: 0,
      };

      return { ok: !issues.some((issue) => issue.severity === "error"), issues, metadata };
    } catch (err) {
      return { ok: false, issues: [error("corrupted_frames", err instanceof Error ? err.message : "Audio could not be decoded.")] };
    }
  }

  private async estimateSilenceRatio(path: string): Promise<number> {
    const result = await this.ffmpeg.runFfmpeg(["-i", path, "-af", "silencedetect=n=-50dB:d=1", "-f", "null", "-"], 5 * 60 * 1000);
    const starts = [...result.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const ends = [...result.stderr.matchAll(/silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/g)].map((m) => Number(m[2]));
    if (!starts.length && !ends.length) return 0;
    const totalSilence = ends.reduce((sum, value) => sum + value, 0);
    const probe = await this.ffmpeg.probe(path);
    const duration = readNumber(probe.format?.duration) ?? 0;
    return duration > 0 ? totalSilence / duration : 0;
  }
}

function normalizeCodec(value?: string): AudioCodec {
  const codec = (value || "").toLowerCase();
  if (codec.includes("mp3")) return "mp3";
  if (codec.includes("flac")) return "flac";
  if (codec.includes("aiff") || codec.includes("aif")) return "aiff";
  if (codec.includes("aac")) return "aac";
  if (codec.includes("wav") || codec.includes("pcm")) return "wav";
  return "unknown";
}

function error(code: string, message: string): MediaValidationIssue {
  return { code, severity: "error", message };
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
