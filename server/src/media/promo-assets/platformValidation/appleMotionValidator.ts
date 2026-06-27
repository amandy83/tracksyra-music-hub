import type { PromoVideoMetadata } from "../processing/videoMetadata";
import { buildPlatformResult, isH264, isMp4Container, isSquare, isVertical, type PlatformRuleFailure } from "./platformValidator";

const MAX_BYTES = 30 * 1024 * 1024;

export function validateAppleMotionArtwork(metadata: PromoVideoMetadata) {
  const failures: PlatformRuleFailure[] = [];

  if (!isMp4Container(metadata)) failures.push({ severity: "fail", penalty: 25, message: "Container is not MP4." });
  if (!isH264(metadata)) failures.push({ severity: "fail", penalty: 25, message: `Codec is ${metadata.codec || "unknown"} not H264.` });
  if (!isVertical(metadata) && !isSquare(metadata)) failures.push({ severity: "fail", penalty: 25, message: "Video is not vertical or square." });
  if (metadata.fileSize > MAX_BYTES) failures.push({ severity: "fail", penalty: 30, message: "File size exceeds 30 MB." });
  else if (metadata.fileSize > 25 * 1024 * 1024) failures.push({ severity: "warning", penalty: 15, message: "File size is close to the 30 MB maximum." });

  return buildPlatformResult("apple_motion_artwork", metadata, failures);
}
