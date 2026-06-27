import type { FfmpegService } from "./ffmpegService";

export async function generatePromoThumbnail(inputPath: string, outputPath: string, ffmpeg: FfmpegService) {
  await ffmpeg.runFfmpeg([
    "-ss",
    "1",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease",
    "-q:v",
    "2",
    outputPath,
  ]);
}
