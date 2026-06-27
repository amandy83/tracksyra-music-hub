import { stat } from "node:fs/promises";
import type { FfmpegService } from "./ffmpegService";

export type PromoVideoMetadata = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrate: number | null;
  codec: string | null;
  audioCodec: string | null;
  container: string | null;
  fileSize: number;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
};

type ProbeResult = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    bit_rate?: string;
    size?: string;
    format_name?: string;
  };
};

export async function extractVideoMetadata(path: string, ffmpeg: FfmpegService): Promise<PromoVideoMetadata> {
  const result = await ffmpeg.runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  const probe = JSON.parse(result.stdout || "{}") as ProbeResult;
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const file = await stat(path);

  return {
    durationSeconds: round(readNumber(video?.duration) ?? readNumber(probe.format?.duration)),
    width: readInteger(video?.width),
    height: readInteger(video?.height),
    fps: round(parseFps(video?.avg_frame_rate || video?.r_frame_rate)),
    bitrate: readInteger(video?.bit_rate) ?? readInteger(probe.format?.bit_rate),
    codec: video?.codec_name || null,
    audioCodec: audio?.codec_name || null,
    container: probe.format?.format_name || null,
    fileSize: readInteger(probe.format?.size) ?? file.size,
  };
}

function parseFps(value?: string): number | null {
  if (!value || value === "0/0") return null;
  const [a, b] = value.split("/").map(Number);
  if (Number.isFinite(a) && Number.isFinite(b) && b > 0) return a / b;
  const direct = Number(value);
  return Number.isFinite(direct) ? direct : null;
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function readInteger(value: unknown): number | null {
  const num = readNumber(value);
  return num === null ? null : Math.round(num);
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1000) / 1000;
}
