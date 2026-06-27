import type {
  DistributionPlatform,
  NormalizedDistributionError,
  Release,
  Track,
} from "../models/distributionTypes";

import type { PlatformAdapter } from "./platformAdapter";

export type AdapterLogger = {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
};

export type UploadTrackResult = {
  platformTrackId: string;
  status: "PUBLISHED" | "FAILED";
  rawResponse: any;
};

export type BasePlatformAdapterOptions = {
  logger?: AdapterLogger;
};

export abstract class BasePlatformAdapter implements PlatformAdapter {
  protected readonly logger: AdapterLogger;

  abstract readonly name: DistributionPlatform;

  constructor(options: BasePlatformAdapterOptions = {}) {
    this.logger = options.logger ?? console;
  }

  async authenticate(): Promise<void> {
    this.logger.info("[distribution][adapter] authenticated", { platform: this.name });
  }

  async uploadTrack(input: { track: Track; release: Release }): Promise<UploadTrackResult> {
    return this.withAdapterErrors("uploadTrack", async () => {
      throw new Error(`${this.name} adapter must implement a real provider uploadTrack call.`);
    });
  }

  async updateMetadata(input: { platformTrackId: string; track: Track }): Promise<void> {
    await this.withAdapterErrors("updateMetadata", async () => {
      this.logger.info("[distribution][adapter] metadata updated", {
        platform: this.name,
        platformTrackId: input.platformTrackId,
        trackId: input.track.id,
      });
    });
  }

  normalizeError(error: unknown): NormalizedDistributionError {
    const message = error instanceof Error ? error.message : String(error);
    return {
      errorCode: `${this.name.toUpperCase()}_ADAPTER_ERROR`,
      message,
      platform: this.name,
      provider: "too_lost",
      retryable: true,
    };
  }

  protected formatSuccess(platformTrackId: string, rawResponse: any): UploadTrackResult {
    return {
      platformTrackId,
      status: "PUBLISHED",
      rawResponse,
    };
  }

  protected async withAdapterErrors<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const normalized = this.normalizeError(error);
      this.logger.error("[distribution][adapter] operation failed", {
        operation,
        ...normalized,
      });
      throw normalized;
    }
  }

}
