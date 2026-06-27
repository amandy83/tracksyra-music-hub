import { DISTRIBUTION_PLATFORMS, type DistributionPlatformName } from "../models/distributionTypes";
import { TooLostAdapter } from "../providers/too-lost/tooLostAdapter";

import type { PlatformAdapter } from "./platformAdapter";

export class UnsupportedPlatformError extends Error {
  readonly errorCode = "UNSUPPORTED_PLATFORM";
  readonly retryable = false;

  constructor(readonly platform: string) {
    super(`Unsupported distribution platform: ${platform}`);
  }
}

export class PlatformAdapterRegistry {
  private readonly adapters = new Map<string, PlatformAdapter>();
  private readonly supportedPlatforms: ReadonlySet<string>;
  private readonly fallbackPlatform: string | null;

  constructor(
    supportedPlatforms: readonly string[] = DISTRIBUTION_PLATFORMS,
    fallbackPlatform: string | null = "too_lost",
  ) {
    this.supportedPlatforms = new Set(supportedPlatforms);
    this.fallbackPlatform = fallbackPlatform;
  }

  register(adapter: PlatformAdapter): void {
    if (!this.supportedPlatforms.has(adapter.name)) {
      throw new UnsupportedPlatformError(adapter.name);
    }
    this.adapters.set(adapter.name, adapter);
  }

  get(platform: DistributionPlatformName | string): PlatformAdapter {
    const adapter = this.adapters.get(platform) ?? (this.fallbackPlatform ? this.adapters.get(this.fallbackPlatform) : undefined);
    if (!adapter) throw new UnsupportedPlatformError(platform);
    return adapter;
  }

  has(platform: DistributionPlatformName | string): boolean {
    return this.adapters.has(platform);
  }

  validateSupported(platform: DistributionPlatformName | string): boolean {
    return this.supportedPlatforms.has(platform) || Boolean(this.fallbackPlatform && this.adapters.has(this.fallbackPlatform));
  }

  listSupported(): string[] {
    return Array.from(this.supportedPlatforms);
  }
}

export function createDefaultPlatformAdapterRegistry(): PlatformAdapterRegistry {
  const registry = new PlatformAdapterRegistry(["too_lost"], "too_lost");
  registry.register(new TooLostAdapter());
  return registry;
}
