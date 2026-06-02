import { basename, join } from "node:path";
import { loadRuntimeEnv } from "../../config/envLoader";
import type { StoredMediaObject } from "../models";
import type { MediaStorageAdapter } from "../storage/mediaStorage";
import { FfmpegRunner } from "./ffmpeg";

export type AudioTranscodingOutput = {
  masterArchive: StoredMediaObject;
  mp3_320: StoredMediaObject;
  mp3_128: StoredMediaObject;
  aacPreview: StoredMediaObject;
};

export class AudioTranscodingService {
  constructor(
    private readonly storage: MediaStorageAdapter,
    private readonly ffmpeg = new FfmpegRunner(),
    private readonly outputBucket = readEnv("MEDIA_OUTPUT_BUCKET") || "media-private",
  ) {}

  async transcode(input: { sourcePath: string; userId: string; assetId: string; originalFilename: string; workDir: string }): Promise<AudioTranscodingOutput> {
    const baseKey = `users/${input.userId}/audio/${input.assetId}`;
    const normalizedWav = join(input.workDir, "normalized-master.wav");
    const mp3_320 = join(input.workDir, "stream-320.mp3");
    const mp3_128 = join(input.workDir, "stream-128.mp3");
    const aacPreview = join(input.workDir, "preview.m4a");

    await this.ffmpeg.runFfmpeg([
      "-i",
      input.sourcePath,
      "-af",
      "loudnorm=I=-14:TP=-1.5:LRA=11",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      normalizedWav,
    ]);
    await this.ffmpeg.runFfmpeg(["-i", normalizedWav, "-c:a", "libmp3lame", "-b:a", "320k", mp3_320]);
    await this.ffmpeg.runFfmpeg(["-i", normalizedWav, "-c:a", "libmp3lame", "-b:a", "128k", mp3_128]);
    await this.ffmpeg.runFfmpeg(["-ss", "30", "-t", "30", "-i", normalizedWav, "-c:a", "aac", "-b:a", "128k", aacPreview]);

    return {
      masterArchive: await this.upload(`${baseKey}/master/${safeName(input.originalFilename, "wav")}`, normalizedWav, "audio/wav"),
      mp3_320: await this.upload(`${baseKey}/stream/320.mp3`, mp3_320, "audio/mpeg"),
      mp3_128: await this.upload(`${baseKey}/stream/128.mp3`, mp3_128, "audio/mpeg"),
      aacPreview: await this.upload(`${baseKey}/preview/preview.m4a`, aacPreview, "audio/mp4"),
    };
  }

  private async upload(key: string, path: string, contentType: string) {
    return this.storage.putObject({
      bucket: this.outputBucket,
      key,
      body: await this.ffmpeg.read(path),
      contentType,
      cacheControl: "private, max-age=31536000, immutable",
    });
  }
}

function safeName(filename: string, fallbackExt: string) {
  const clean = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return clean.includes(".") ? clean : `${clean}.${fallbackExt}`;
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
