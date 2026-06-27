const MIN_SIDE = 3000;
const MAX_SIDE = 10000;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type CoverMeta = {
  width: number;
  height: number;
  format: "image/jpeg" | "image/png";
  hash: string;
  hasTransparency: boolean;
  colorProfile: "rgb";
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

export async function validateCover(file: File): Promise<CoverValidationResult> {
  const errors: string[] = [];
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    errors.push("Cover must be JPG or PNG.");
  }
  if (file.size > MAX_BYTES) errors.push("Cover file too large (max 10 MB).");
  if (errors.length) return { ok: false, errors };

  const buf = await file.arrayBuffer();
  const signature = validateImageSignature(buf, file.type);
  if (signature.ok === false) return { ok: false, errors: signature.errors };

  const img = await loadImage(file).catch(() => null);
  if (!img) return { ok: false, errors: ["Cover image is corrupted."] };

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < MIN_SIDE || h < MIN_SIDE) errors.push(`Cover too small (${w}x${h}). Minimum ${MIN_SIDE}x${MIN_SIDE}.`);
  if (w > MAX_SIDE || h > MAX_SIDE) errors.push(`Cover too large (${w}x${h}). Maximum ${MAX_SIDE}x${MAX_SIDE}.`);
  if (w !== h) errors.push("Cover must be square (1:1).");
  if (signature.hasTransparency) errors.push("Artwork must not contain transparency.");
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    meta: {
      width: w,
      height: h,
      format: file.type as CoverMeta["format"],
      hash: await sha256(buf),
      hasTransparency: false,
      colorProfile: "rgb",
    },
    previewUrl: img.src,
  };
}

const sha256 = async (buf: ArrayBuffer): Promise<string> => {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

type SignatureResult =
  | { ok: true; hasTransparency: boolean }
  | { ok: false; errors: string[] };

function validateImageSignature(buf: ArrayBuffer, mimeType: string): SignatureResult {
  return mimeType === "image/png" ? validatePng(buf) : validateJpeg(buf);
}

function validatePng(buf: ArrayBuffer): SignatureResult {
  const bytes = new Uint8Array(buf);
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !pngSignature.every((value, index) => bytes[index] === value)) {
    return { ok: false, errors: ["PNG signature is invalid or corrupted."] };
  }

  const colorType = bytes[25];
  if (![2, 6].includes(colorType)) {
    return { ok: false, errors: ["Artwork must use RGB color, not grayscale or indexed color."] };
  }

  let offset = 8;
  let hasTransparency = colorType === 6;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "tRNS") hasTransparency = true;
    offset += 12 + length;
  }

  return { ok: true, hasTransparency };
}

function validateJpeg(buf: ArrayBuffer): SignatureResult {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { ok: false, errors: ["JPEG signature is invalid or corrupted."] };
  }

  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return { ok: false, errors: ["JPEG header is corrupted."] };
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      const components = bytes[offset + 9];
      if (components !== 3) return { ok: false, errors: ["Artwork must use RGB color profile. CMYK or grayscale JPEG is not accepted."] };
      return { ok: true, hasTransparency: false };
    }
    offset += 2 + length;
  }

  return { ok: false, errors: ["JPEG image header is missing color information."] };
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
