export const PROMO_ASSET_TYPES = [
  { key: "spotify_canvas", label: "Spotify Canvas", min: 3, max: 8, ratio: "9:16" },
  { key: "apple_motion_artwork", label: "Apple Motion Artwork", min: 3, max: 30, ratio: "1:1" },
  { key: "youtube_shorts", label: "YouTube Shorts Promo", min: 1, max: 60, ratio: "9:16" },
  { key: "tiktok_preview", label: "TikTok Preview Video", min: 1, max: 60, ratio: "9:16" },
  { key: "instagram_reel", label: "Instagram Reels Promo", min: 1, max: 90, ratio: "9:16" },
] as const;

export type PromoAssetType = typeof PROMO_ASSET_TYPES[number]["key"];

export const PROMO_MAX_BYTES = 100 * 1024 * 1024;

export type PromoVideoMeta = {
  duration_seconds: number;
  width: number;
  height: number;
  fps: number | null;
  file_size: number;
};

export function promoAssetLabel(value: string) {
  return PROMO_ASSET_TYPES.find((type) => type.key === value)?.label || value.replace(/_/g, " ");
}

export function validatePromoVideoMeta(assetType: PromoAssetType, file: File, meta: PromoVideoMeta) {
  const errors: string[] = [];
  const rule = PROMO_ASSET_TYPES.find((type) => type.key === assetType);
  if (!rule) errors.push("Unsupported promo asset type.");
  if (file.type !== "video/mp4" && file.type !== "video/quicktime") errors.push("Promo asset must be MP4 or MOV.");
  if (file.size > PROMO_MAX_BYTES) errors.push("Promo asset must be 100 MB or smaller.");
  if (rule && (meta.duration_seconds < rule.min || meta.duration_seconds > rule.max)) {
    errors.push(`${rule.label} duration must be ${rule.min}-${rule.max} seconds.`);
  }
  if (rule?.ratio && !matchesRatio(meta.width, meta.height, rule.ratio)) {
    errors.push(`${rule.label} must use ${rule.ratio} aspect ratio.`);
  }
  return errors;
}

export function readVideoMeta(file: File): Promise<PromoVideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = async () => {
      const baseMeta = {
        duration_seconds: Math.round(video.duration * 1000) / 1000,
        width: video.videoWidth,
        height: video.videoHeight,
        file_size: file.size,
      };
      const fps = await estimateFps(video).catch(() => null);
      URL.revokeObjectURL(url);
      resolve({ ...baseMeta, fps });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video metadata could not be read."));
    };
    video.src = url;
  });
}

export async function createVideoThumbnail(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Video thumbnail could not be generated."));
    });
    video.currentTime = Math.min(1, Math.max(0, video.duration / 3));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Thumbnail encoding failed.")), "image/jpeg", 0.86);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function estimateFps(video: HTMLVideoElement): Promise<number | null> {
  const withCallback = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void) => number;
  };
  if (!withCallback.requestVideoFrameCallback) return null;
  video.currentTime = 0;
  await video.play().catch(() => null);
  return await new Promise<number | null>((resolve) => {
    let startTime: number | null = null;
    let startFrames: number | null = null;
    const timer = window.setTimeout(() => {
      video.pause();
      resolve(null);
    }, 1800);
    const sample = (_now: number, metadata: { mediaTime: number; presentedFrames: number }) => {
      if (startTime === null) {
        startTime = metadata.mediaTime;
        startFrames = metadata.presentedFrames;
      }
      if (metadata.mediaTime - startTime >= 0.75 && startFrames !== null) {
        window.clearTimeout(timer);
        video.pause();
        resolve(Math.round(((metadata.presentedFrames - startFrames) / (metadata.mediaTime - startTime)) * 100) / 100);
        return;
      }
      withCallback.requestVideoFrameCallback?.(sample);
    };
    withCallback.requestVideoFrameCallback(sample);
  });
}

function matchesRatio(width: number, height: number, ratio: string) {
  if (!width || !height) return false;
  const [rw, rh] = ratio.split(":").map(Number);
  return Math.abs(width / height - rw / rh) <= 0.04;
}
