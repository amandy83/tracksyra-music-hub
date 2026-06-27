import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { createHash } from "node:crypto";
import type { MediaValidationIssue } from "../models";
import { MediaValidationService } from "../services/MediaValidationService";
import { createMediaStorageAdapter, type MediaStorageAdapter } from "./mediaStorage";

export type StorageValidationInput = {
  releaseId: string;
  trackId?: string | null;
  bucket: string;
  key: string;
  filename?: string | null;
  mimeType: string;
  sizeBytes: number;
};

export type PersistableValidationResult = {
  release_id: string;
  track_id?: string | null;
  validation_type: "audio" | "artwork";
  status: "passed" | "failed";
  validation_status: "passed" | "failed";
  details: Record<string, unknown>;
  width?: number | null;
  height?: number | null;
  mime_type?: string | null;
};

export class MediaStorageValidationHooks {
  constructor(
    private readonly storage: MediaStorageAdapter = createMediaStorageAdapter(),
    private readonly mediaValidation = new MediaValidationService(),
  ) {}

  async validateUploadedAudio(input: StorageValidationInput): Promise<PersistableValidationResult> {
    const object = await this.storage.getObject(input.bucket, input.key);
    const tempDir = await mkdtemp(join(tmpdir(), "tracksyra-audio-validation-"));
    const safeName = basename(input.filename || input.key).replace(/[^a-zA-Z0-9._-]+/g, "-");
    const tempPath = join(tempDir, safeName || `audio${extname(input.key)}`);

    try {
      await writeFile(tempPath, object);
      const validation = await this.mediaValidation.validateAudioFile(tempPath, {
        filename: input.filename || input.key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });

      return {
        release_id: input.releaseId,
        track_id: input.trackId || null,
        validation_type: "audio",
        status: validation.ok ? "passed" : "failed",
        validation_status: validation.ok ? "passed" : "failed",
        details: validation.ok
          ? { ...validation.metadata, hash: sha256(object) }
          : { errors: validation.issues.map(formatIssue), hash: sha256(object) },
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async validateUploadedArtwork(input: StorageValidationInput): Promise<PersistableValidationResult> {
    const object = await this.storage.getObject(input.bucket, input.key);
    const validation = validateArtworkBuffer(object, input.mimeType, input.sizeBytes);

    return {
      release_id: input.releaseId,
      track_id: null,
      validation_type: "artwork",
      status: validation.ok ? "passed" : "failed",
      validation_status: validation.ok ? "passed" : "failed",
      width: validation.ok ? validation.width : null,
      height: validation.ok ? validation.height : null,
      mime_type: input.mimeType,
      details: validation.ok
        ? {
            width: validation.width,
            height: validation.height,
            mime_type: input.mimeType,
            file_size_bytes: input.sizeBytes,
            hash: sha256(object),
            color_profile: "rgb",
            has_transparency: false,
          }
        : { errors: validation.errors, hash: sha256(object) },
    };
  }
}

function validateArtworkBuffer(bytes: Buffer, mimeType: string, sizeBytes: number):
  | { ok: true; width: number; height: number }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (mimeType !== "image/jpeg" && mimeType !== "image/png") errors.push("Artwork must be JPEG or PNG.");
  if (sizeBytes > 10 * 1024 * 1024) errors.push("Artwork file size must be 10 MB or less.");
  const header = mimeType === "image/png" ? readPngHeader(bytes) : readJpegHeader(bytes);
  if (!header.ok) return { ok: false, errors: [...errors, ...header.errors] };
  if (header.width < 3000 || header.height < 3000) errors.push("Artwork must be at least 3000x3000.");
  if (header.width > 10000 || header.height > 10000) errors.push("Artwork must be at most 10000x10000.");
  if (header.width !== header.height) errors.push("Artwork must be square.");
  if (header.hasTransparency) errors.push("Artwork must not contain transparency.");
  return errors.length ? { ok: false, errors } : { ok: true, width: header.width, height: header.height };
}

function readPngHeader(bytes: Buffer):
  | { ok: true; width: number; height: number; hasTransparency: boolean }
  | { ok: false; errors: string[] } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) return { ok: false, errors: ["PNG signature is invalid."] };
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  if (![2, 6].includes(colorType)) return { ok: false, errors: ["Artwork must use RGB color."] };
  let offset = 8;
  let hasTransparency = colorType === 6;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "tRNS") hasTransparency = true;
    offset += 12 + length;
  }
  return { ok: true, width, height, hasTransparency };
}

function readJpegHeader(bytes: Buffer):
  | { ok: true; width: number; height: number; hasTransparency: false }
  | { ok: false; errors: string[] } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { ok: false, errors: ["JPEG signature is invalid."] };
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return { ok: false, errors: ["JPEG header is corrupted."] };
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      const components = bytes[offset + 9];
      if (components !== 3) return { ok: false, errors: ["Artwork must use RGB color profile."] };
      return { ok: true, width, height, hasTransparency: false };
    }
    offset += 2 + length;
  }
  return { ok: false, errors: ["JPEG image dimensions could not be read."] };
}

function formatIssue(issue: MediaValidationIssue) {
  return `${issue.code}: ${issue.message}`;
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
