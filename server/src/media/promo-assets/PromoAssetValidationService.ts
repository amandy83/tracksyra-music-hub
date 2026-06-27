import { extname } from "node:path";
import { FfmpegRunner } from "../services/ffmpeg";
import { PROMO_ASSET_RULES, type PromoAssetType } from "./promoAssetRules";

export type PromoAssetValidationInput = {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  assetType: PromoAssetType;
};

export type PromoAssetValidationMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number | null;
  videoCodec: string;
  audioCodec: string | null;
  aspectRatio: string;
  fileSize: number;
};

export type PromoAssetValidationResult = {
  ok: boolean;
  status: "passed" | "failed";
  errors: string[];
  warnings: string[];
  metadata?: PromoAssetValidationMetadata;
};

type VideoStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
};

type VideoProbeResult = {
  streams?: VideoStream[];
  format?: { duration?: string; format_name?: string; bit_rate?: string };
};

const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov"]);
const ALLOWED_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);
const ALLOWED_VIDEO_CODECS = new Set(["h264", "hevc", "h265"]);

export class PromoAssetValidationService {
  constructor(private readonly ffmpeg = new FfmpegRunner()) {}

  async validate(input: PromoAssetValidationInput): Promise<PromoAssetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ext = extname(input.filename).toLowerCase();
    const rule = PROMO_ASSET_RULES[input.assetType];

    if (!ALLOWED_EXTENSIONS.has(ext)) errors.push("Promo video must be MP4 or MOV.");
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) errors.push("Promo video MIME type must be video/mp4 or video/quicktime.");
    if (input.sizeBytes > rule.maxBytes) errors.push("Promo video exceeds the 100 MB limit.");
    if (input.sizeBytes <= 0) errors.push("Promo video is empty.");
    if (errors.length) return { ok: false, status: "failed", errors, warnings };

    try {
      const probe = await this.ffmpeg.probe(input.path) as VideoProbeResult;
      const video = probe.streams?.find((stream) => stream.codec_type === "video");
      const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
      if (!video) return { ok: false, status: "failed", errors: ["Video stream is missing or corrupted."], warnings };

      const durationSeconds = readNumber(video.duration) ?? readNumber(probe.format?.duration) ?? 0;
      const width = Number(video.width || 0);
      const height = Number(video.height || 0);
      const fps = parseFps(video.avg_frame_rate || video.r_frame_rate);
      const videoCodec = String(video.codec_name || "").toLowerCase();
      const audioCodec = audio?.codec_name ? String(audio.codec_name).toLowerCase() : null;

      if (!ALLOWED_VIDEO_CODECS.has(videoCodec)) errors.push(`Unsupported video codec "${videoCodec || "unknown"}". Use H.264 or HEVC.`);
      if (durationSeconds < rule.minDurationSeconds || durationSeconds > rule.maxDurationSeconds) {
        errors.push(`${rule.label} duration must be ${rule.minDurationSeconds}-${rule.maxDurationSeconds} seconds.`);
      }
      if (width <= 0 || height <= 0) errors.push("Video resolution could not be read.");
      if (rule.aspectRatio && width > 0 && height > 0 && !matchesAspectRatio(width, height, rule.aspectRatio)) {
        errors.push(`${rule.label} must use ${rule.aspectRatio} aspect ratio.`);
      }
      if (fps !== null && (fps < 23 || fps > 60)) warnings.push(`Frame rate ${fps.toFixed(2)} fps is outside the typical 23-60 fps range.`);

      const blackScreen = await this.detectBlackScreen(input.path, durationSeconds).catch((error) => {
        warnings.push(error instanceof Error ? error.message : "Black screen detection could not complete.");
        return false;
      });
      if (blackScreen) errors.push("Black screen detected across a significant portion of the promo video.");

      const frozenFrame = await this.detectFrozenFrame(input.path).catch((error) => {
        warnings.push(error instanceof Error ? error.message : "Frozen frame detection could not complete.");
        return false;
      });
      if (frozenFrame) errors.push("Frozen frame sequence detected in promo video.");

      const metadata: PromoAssetValidationMetadata = {
        durationSeconds: round(durationSeconds),
        width,
        height,
        fps: fps === null ? null : round(fps),
        videoCodec,
        audioCodec,
        aspectRatio: simplifyAspect(width, height),
        fileSize: input.sizeBytes,
      };

      return { ok: errors.length === 0, status: errors.length ? "failed" : "passed", errors, warnings, metadata };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        errors: [error instanceof Error ? `Corrupted video or unreadable header: ${error.message}` : "Corrupted video or unreadable header."],
        warnings,
      };
    }
  }

  private async detectBlackScreen(path: string, durationSeconds: number) {
    const result = await this.ffmpeg.runFfmpeg(["-i", path, "-vf", "blackdetect=d=0.5:pix_th=0.10", "-an", "-f", "null", "-"], 5 * 60 * 1000);
    const durations = [...result.stderr.matchAll(/black_duration:([\d.]+)/g)].map((match) => Number(match[1]));
    const totalBlack = durations.reduce((sum, value) => sum + value, 0);
    return durationSeconds > 0 && totalBlack / durationSeconds > 0.35;
  }

  private async detectFrozenFrame(path: string) {
    const result = await this.ffmpeg.runFfmpeg(["-i", path, "-vf", "freezedetect=n=-60dB:d=1", "-an", "-f", "null", "-"], 5 * 60 * 1000);
    return /freeze_start:/i.test(result.stderr);
  }
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseFps(value?: string): number | null {
  if (!value || value === "0/0") return null;
  const [a, b] = value.split("/").map(Number);
  if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return a / b;
  const direct = Number(value);
  return Number.isFinite(direct) ? direct : null;
}

function matchesAspectRatio(width: number, height: number, expected: string) {
  const [w, h] = expected.split(":").map(Number);
  const actual = width / height;
  const target = w / h;
  return Math.abs(actual - target) <= 0.04;
}

function simplifyAspect(width: number, height: number) {
  if (!width || !height) return "unknown";
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
