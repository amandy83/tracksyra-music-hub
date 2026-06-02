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
  simulateFailure?: boolean;
  minLatencyMs?: number;
  maxLatencyMs?: number;
};

export abstract class BasePlatformAdapter implements PlatformAdapter {
  protected readonly logger: AdapterLogger;
  private readonly simulateFailure: boolean;
  private readonly minLatencyMs: number;
  private readonly maxLatencyMs: number;

  abstract readonly name: DistributionPlatform;

  constructor(options: BasePlatformAdapterOptions = {}) {
    this.logger = options.logger ?? console;
    this.simulateFailure = options.simulateFailure ?? false;
    this.minLatencyMs = options.minLatencyMs ?? 500;
    this.maxLatencyMs = options.maxLatencyMs ?? 1500;
  }

  async authenticate(): Promise<void> {
    await this.withAdapterErrors("authenticate", async () => {
      await this.simulateLatency();
      this.logger.info("[distribution][adapter] authenticated", { platform: this.name });
    });
  }

  async uploadTrack(input: { track: Track; release: Release }): Promise<UploadTrackResult> {
    return this.withAdapterErrors("uploadTrack", async () => {
      await this.simulateLatency();
      if (this.simulateFailure) {
        throw new Error(`Simulated ${this.name} upload failure`);
      }

      const platformTrackId = this.createPlatformTrackId(input.track.id);
      return this.formatSuccess(platformTrackId, {
        platform: this.name,
        releaseId: input.release.id,
        trackId: input.track.id,
        acceptedAt: new Date().toISOString(),
        mock: true,
      });
    });
  }

  async updateMetadata(input: { platformTrackId: string; track: Track }): Promise<void> {
    await this.withAdapterErrors("updateMetadata", async () => {
      await this.simulateLatency();
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
      provider: "revelator",
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

  protected async simulateLatency(): Promise<void> {
    const delay = this.minLatencyMs + Math.floor(Math.random() * (this.maxLatencyMs - this.minLatencyMs + 1));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected createPlatformTrackId(trackId: string): string {
    const compact = trackId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
    return `${this.name}_${compact}_${Date.now()}`;
  }
}
