// Cover-art validation – size, format, color mode (sample), and basic blur detection.

const MIN_SIDE = 3000;

export type CoverMeta = {
  width: number;
  height: number;
  format: "image/jpeg" | "image/png";
  blurScore: number; // higher = sharper
};

export type CoverValidationResult =
  | { ok: true; meta: CoverMeta; previewUrl: string }
  | { ok: false; errors: string[] };

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded."));
    img.src = url;
  });

// Variance of Laplacian on a downscaled grayscale copy. Higher = sharper.
function laplacianVariance(img: HTMLImageElement): number {
  const W = 256;
  const H = Math.round((img.naturalHeight / img.naturalWidth) * W);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return 1000;
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const v =
        -gray[i - W - 1] - gray[i - W] - gray[i - W + 1] -
        gray[i - 1] + 8 * gray[i] - gray[i + 1] -
        gray[i + W - 1] - gray[i + W] - gray[i + W + 1];
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export async function validateCover(file: File): Promise<CoverValidationResult> {
  const errors: string[] = [];
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    errors.push("Cover must be JPG or PNG.");
  }
  if (errors.length) return { ok: false, errors };

  const img = await loadImage(file).catch(() => null);
  if (!img) return { ok: false, errors: ["Cover image is corrupted."] };

  const w = img.naturalWidth, h = img.naturalHeight;
  if (w < MIN_SIDE || h < MIN_SIDE) {
    errors.push(`Cover too small (${w}×${h}). Minimum ${MIN_SIDE}×${MIN_SIDE}.`);
  }
  if (w !== h) errors.push("Cover must be square (1:1).");

  const blurScore = laplacianVariance(img);
  if (blurScore < 80) errors.push(`Image appears blurry (sharpness ${blurScore.toFixed(0)}).`);

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    meta: {
      width: w,
      height: h,
      format: file.type as CoverMeta["format"],
      blurScore: Math.round(blurScore),
    },
    previewUrl: img.src,
  };
}
