import { join } from "node:path";
import { loadRuntimeEnv } from "../../config/envLoader";
import type { StoredMediaObject } from "../models";
import type { MediaStorageAdapter } from "../storage/mediaStorage";
import { FfmpegRunner } from "./ffmpeg";

export class PreviewClipGenerator {
  constructor(
    private readonly storage: MediaStorageAdapter,
    private readonly ffmpeg = new FfmpegRunner(),
    private readonly outputBucket = readEnv("MEDIA_OUTPUT_BUCKET") || "media-private",
  ) {}

  async generate(input: { sourcePath: string; userId: string; assetId: string; workDir: string; startSec?: number; durationSec?: number }): Promise<StoredMediaObject> {
    const outputPath = join(input.workDir, "preview-clip.m4a");
    await this.ffmpeg.runFfmpeg([
      "-ss",
      String(input.startSec ?? 30),
      "-t",
      String(input.durationSec ?? 30),
      "-i",
      input.sourcePath,
      "-af",
      "loudnorm=I=-14:TP=-1.5:LRA=11",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ]);
    return this.storage.putObject({
      bucket: this.outputBucket,
      key: `users/${input.userId}/audio/${input.assetId}/preview/clip.m4a`,
      body: await this.ffmpeg.read(outputPath),
      contentType: "audio/mp4",
      cacheControl: "private, max-age=31536000, immutable",
    });
  }
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
