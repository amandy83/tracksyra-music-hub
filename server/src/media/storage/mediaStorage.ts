import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../../config/envLoader";
import type { MediaStorageProvider, StoredMediaObject } from "../models";

export type PutMediaObjectInput = {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array | ArrayBuffer;
  contentType: string;
  cacheControl?: string;
};

export type SignedUrlInput = {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  disposition?: "inline" | "attachment";
  contentType?: string;
};

export interface MediaStorageAdapter {
  readonly provider: MediaStorageProvider;
  getObject(bucket: string, key: string): Promise<Buffer>;
  putObject(input: PutMediaObjectInput): Promise<StoredMediaObject>;
  createSignedUrl(input: SignedUrlInput): Promise<string>;
  getCdnHeaders(variant: string): Record<string, string>;
}

export class SupabaseMediaStorageAdapter implements MediaStorageAdapter {
  readonly provider = "supabase" as const;

  constructor(private readonly client: SupabaseClient = createSupabaseServiceClient()) {}

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(key);
    if (error) throw error;
    return Buffer.from(await data.arrayBuffer());
  }

  async putObject(input: PutMediaObjectInput): Promise<StoredMediaObject> {
    const bytes = toArrayBuffer(input.body);
    const { data, error } = await this.client.storage.from(input.bucket).upload(input.key, bytes, {
      upsert: true,
      contentType: input.contentType,
      cacheControl: input.cacheControl || "private, max-age=31536000, immutable",
    });
    if (error) throw error;
    return {
      provider: this.provider,
      bucket: input.bucket,
      key: data.path,
      contentType: input.contentType,
      sizeBytes: Buffer.byteLength(Buffer.from(bytes)),
      etag: null,
    };
  }

  async createSignedUrl(input: SignedUrlInput): Promise<string> {
    const { data, error } = await this.client.storage.from(input.bucket).createSignedUrl(input.key, input.expiresInSeconds, {
      download: input.disposition === "attachment",
    });
    if (error) throw error;
    return data.signedUrl;
  }

  getCdnHeaders(variant: string): Record<string, string> {
    const immutable = variant === "master_archive" || variant.startsWith("artwork_") || variant.startsWith("mp3_");
    return {
      "Cache-Control": immutable ? "private, max-age=31536000, immutable" : "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; media-src 'self'; img-src 'self';",
    };
  }
}

export class S3CompatibleMediaStorageAdapter implements MediaStorageAdapter {
  readonly provider: MediaStorageProvider;

  constructor(provider: "s3" | "r2") {
    this.provider = provider;
  }

  async getObject(): Promise<Buffer> {
    throw new Error(`${this.provider.toUpperCase()} storage is configured as an interface placeholder. Provide a concrete client adapter before use.`);
  }

  async putObject(): Promise<StoredMediaObject> {
    throw new Error(`${this.provider.toUpperCase()} storage is configured as an interface placeholder. Provide a concrete client adapter before use.`);
  }

  async createSignedUrl(): Promise<string> {
    throw new Error(`${this.provider.toUpperCase()} signing is configured as an interface placeholder. Provide a concrete client adapter before use.`);
  }

  getCdnHeaders(): Record<string, string> {
    return {
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
  }
}

export function createMediaStorageAdapter(provider: MediaStorageProvider = readProvider()): MediaStorageAdapter {
  if (provider === "supabase") return new SupabaseMediaStorageAdapter();
  return new S3CompatibleMediaStorageAdapter(provider);
}

function createSupabaseServiceClient(): SupabaseClient {
  loadRuntimeEnv();
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for media storage.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function toArrayBuffer(body: Buffer | Uint8Array | ArrayBuffer): ArrayBuffer {
  if (body instanceof ArrayBuffer) return body;
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
}

function readProvider(): MediaStorageProvider {
  loadRuntimeEnv();
  const provider = readEnv("MEDIA_STORAGE_PROVIDER");
  if (provider === "r2" || provider === "s3") return provider;
  return "supabase";
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
