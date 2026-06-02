import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadRuntimeEnv } from "../../config/envLoader";
import type { AudioQualityMetadata } from "../models";

export type FfmpegCommandResult = {
  stdout: string;
  stderr: string;
};

export type AudioProbeStream = {
  codec_name?: string;
  codec_type?: string;
  sample_rate?: string;
  channels?: number;
  bit_rate?: string;
  duration?: string;
};

export type AudioProbeResult = {
  streams?: AudioProbeStream[];
  format?: {
    duration?: string;
    bit_rate?: string;
    format_name?: string;
  };
};

export class FfmpegRunner {
  constructor(
    private readonly ffmpegPath = readEnv("FFMPEG_PATH") || "ffmpeg",
    private readonly ffprobePath = readEnv("FFPROBE_PATH") || "ffprobe",
  ) {}

  runFfmpeg(args: string[], timeoutMs = 10 * 60 * 1000): Promise<FfmpegCommandResult> {
    return run(this.ffmpegPath, ["-hide_banner", "-y", ...args], timeoutMs);
  }

  async probe(inputPath: string, timeoutMs = 60_000): Promise<AudioProbeResult> {
    const result = await run(this.ffprobePath, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      inputPath,
    ], timeoutMs);
    return JSON.parse(result.stdout || "{}") as AudioProbeResult;
  }

  async analyzeLoudness(inputPath: string): Promise<Pick<AudioQualityMetadata, "lufs" | "peakDb">> {
    const result = await this.runFfmpeg(["-i", inputPath, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], 5 * 60 * 1000);
    const json = extractLastJson(result.stderr);
    return {
      lufs: readNumber(json?.input_i),
      peakDb: readNumber(json?.input_tp),
    };
  }

  async ensureParent(path: string) {
    await mkdir(dirname(path), { recursive: true });
  }

  async read(path: string) {
    return readFile(path);
  }

  async write(path: string, data: Buffer | string) {
    await this.ensureParent(path);
    await writeFile(path, data);
  }

  async remove(path: string) {
    await rm(path, { force: true, recursive: true });
  }
}

function run(command: string, args: string[], timeoutMs: number): Promise<FfmpegCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function extractLastJson(text: string): Record<string, unknown> | null {
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
