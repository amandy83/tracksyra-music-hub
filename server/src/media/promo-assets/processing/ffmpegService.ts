import { spawn } from "node:child_process";
import { loadRuntimeEnv } from "../../../config/envLoader";
import { logger } from "../../../observability/logger";

export type FfmpegCommandResult = {
  stdout: string;
  stderr: string;
};

export type FfmpegAvailability = {
  available: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  error?: string;
};

const log = logger.child({ component: "promo-asset-ffmpeg" });

export class FfmpegService {
  private availability: FfmpegAvailability | null = null;

  constructor(
    readonly ffmpegPath = readEnv("FFMPEG_PATH") || "ffmpeg",
    readonly ffprobePath = readEnv("FFPROBE_PATH") || "ffprobe",
  ) {}

  async checkAvailability(): Promise<FfmpegAvailability> {
    if (this.availability) return this.availability;

    try {
      await runCommand(this.ffmpegPath, ["-version"], 15_000);
      await runCommand(this.ffprobePath, ["-version"], 15_000);
      this.availability = {
        available: true,
        ffmpegPath: this.ffmpegPath,
        ffprobePath: this.ffprobePath,
      };
      log.info("FFmpeg detected", { ffmpegPath: this.ffmpegPath, ffprobePath: this.ffprobePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.availability = {
        available: false,
        ffmpegPath: this.ffmpegPath,
        ffprobePath: this.ffprobePath,
        error: message,
      };
      log.warn("FFmpeg unavailable. Video processing disabled.", {
        ffmpegPath: this.ffmpegPath,
        ffprobePath: this.ffprobePath,
        error: message,
      });
    }

    return this.availability;
  }

  async requireAvailable() {
    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(`FFmpeg unavailable. Video processing disabled. ${availability.error || ""}`.trim());
    }
  }

  async runFfmpeg(args: string[], timeoutMs = 15 * 60 * 1000): Promise<FfmpegCommandResult> {
    await this.requireAvailable();
    return runCommand(this.ffmpegPath, ["-hide_banner", "-y", ...args], timeoutMs);
  }

  async runFfprobe(args: string[], timeoutMs = 60_000): Promise<FfmpegCommandResult> {
    await this.requireAvailable();
    return runCommand(this.ffprobePath, args, timeoutMs);
  }
}

function runCommand(command: string, args: string[], timeoutMs: number): Promise<FfmpegCommandResult> {
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

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
