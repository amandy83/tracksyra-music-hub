import type { PromoVideoMetadata } from "../processing/videoMetadata";
import { buildPlatformResult, isH264, isMp4Container, matchesAspect, type PlatformRuleFailure } from "./platformValidator";

export function validateSpotifyCanvas(metadata: PromoVideoMetadata) {
  const failures: PlatformRuleFailure[] = [];
  const duration = Number(metadata.durationSeconds || 0);
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (duration < 3) failures.push({ severity: "fail", penalty: 25, message: "Duration is below 3 seconds." });
  if (duration > 8) failures.push({ severity: "fail", penalty: 30, message: "Duration exceeds 8 seconds." });
  if (!matchesAspect(metadata, 9, 16)) failures.push({ severity: "fail", penalty: 25, message: `Aspect ratio is ${aspect(width, height)} not 9:16.` });
  if (!isH264(metadata)) failures.push({ severity: "fail", penalty: 20, message: `Codec is ${metadata.codec || "unknown"} not H264.` });
  if (!isMp4Container(metadata)) failures.push({ severity: "fail", penalty: 20, message: "Container is not MP4." });
  if (width < 720 || height < 1280) failures.push({ severity: "fail", penalty: 20, message: "Resolution is below 720x1280." });
  else if (width < 1080 || height < 1920) failures.push({ severity: "warning", penalty: 15, message: "Resolution passes minimum but is below 1080x1920." });

  return buildPlatformResult("spotify_canvas", metadata, failures);
}

function aspect(width: number, height: number) {
  if (!width || !height) return "unknown";
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
