import { join } from "node:path";
import { loadRuntimeEnv } from "../../config/envLoader";
import type { StoredMediaObject } from "../models";
import type { MediaStorageAdapter } from "../storage/mediaStorage";
import { FfmpegRunner } from "./ffmpeg";

export type ArtworkValidationResult = {
  ok: boolean;
  width: number | null;
  height: number | null;
  issues: string[];
};

export type ArtworkOptimizationResult = {
  thumbnail: StoredMediaObject;
  webp: StoredMediaObject;
  retina: StoredMediaObject;
  validation: ArtworkValidationResult;
};

export class ArtworkOptimizationService {
  constructor(
    private readonly storage: MediaStorageAdapter,
    private readonly ffmpeg = new FfmpegRunner(),
    private readonly outputBucket = readEnv("MEDIA_OUTPUT_BUCKET") || "media-private",
  ) {}

  async validate(path: string): Promise<ArtworkValidationResult> {
    const issues: string[] = [];
    const probe = await this.ffmpeg.probe(path).catch(() => null);
    const stream = probe?.streams?.find((candidate) => candidate.codec_type === "video") as any;
    const width = Number(stream?.width ?? 0) || null;
    const height = Number(stream?.height ?? 0) || null;
    if (!width || !height) issues.push("Artwork is corrupted or unreadable.");
    if (width !== height) issues.push("Artwork must be square.");
    if ((width ?? 0) < 3000 || (height ?? 0) < 3000) issues.push("Artwork must be at least 3000x3000.");
    return { ok: issues.length === 0, width, height, issues };
  }

  async optimize(input: { sourcePath: string; userId: string; assetId: string; workDir: string }): Promise<ArtworkOptimizationResult> {
    const validation = await this.validate(input.sourcePath);
    if (!validation.ok) throw new Error(validation.issues.join("; "));

    const thumbnail = join(input.workDir, "thumb.webp");
    const webp = join(input.workDir, "cover.webp");
    const retina = join(input.workDir, "cover-2x.webp");
    await this.ffmpeg.runFfmpeg(["-i", input.sourcePath, "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2", "-c:v", "libwebp", "-quality", "84", thumbnail]);
    await this.ffmpeg.runFfmpeg(["-i", input.sourcePath, "-vf", "scale=1600:1600", "-c:v", "libwebp", "-quality", "88", webp]);
    await this.ffmpeg.runFfmpeg(["-i", input.sourcePath, "-vf", "scale=3000:3000", "-c:v", "libwebp", "-quality", "92", retina]);

    const baseKey = `users/${input.userId}/artwork/${input.assetId}`;
    return {
      thumbnail: await this.upload(`${baseKey}/thumb.webp`, thumbnail),
      webp: await this.upload(`${baseKey}/cover.webp`, webp),
      retina: await this.upload(`${baseKey}/cover-2x.webp`, retina),
      validation,
    };
  }

  moderationHook(_input: { assetId: string; path: string }): Promise<{ nsfw: boolean; provider: "placeholder"; score: number }> {
    return Promise.resolve({ nsfw: false, provider: "placeholder", score: 0 });
  }

  private async upload(key: string, path: string) {
    return this.storage.putObject({
      bucket: this.outputBucket,
      key,
      body: await this.ffmpeg.read(path),
      contentType: "image/webp",
      cacheControl: "private, max-age=31536000, immutable",
    });
  }
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
