import type { MediaVariantType } from "../models";
import type { MediaStorageAdapter } from "../storage/mediaStorage";

export type SignedMediaUrl = {
  url: string;
  expiresAt: string;
  headers: Record<string, string>;
};

export class SignedMediaUrlService {
  constructor(private readonly storage: MediaStorageAdapter) {}

  async createPlaybackUrl(input: {
    bucket: string;
    key: string;
    variantType: MediaVariantType;
    expiresInSeconds?: number;
    contentType?: string;
  }): Promise<SignedMediaUrl> {
    const expiresInSeconds = clamp(input.expiresInSeconds ?? defaultExpiry(input.variantType), 60, 86_400);
    const url = await this.storage.createSignedUrl({
      bucket: input.bucket,
      key: input.key,
      expiresInSeconds,
      disposition: "inline",
      contentType: input.contentType,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      headers: this.storage.getCdnHeaders(input.variantType),
    };
  }
}

function defaultExpiry(variant: MediaVariantType) {
  if (variant === "preview_clip" || variant === "aac_preview") return 3600;
  if (variant === "waveform_json") return 600;
  return 900;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
