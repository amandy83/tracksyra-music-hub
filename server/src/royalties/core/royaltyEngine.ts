import { decimalUsdToMicros, microsToDecimalUsd } from "./money";
import { getRoyaltyRate, type PlatformRate } from "./rateCard";
import type {
  CalculateTrackRevenueInput,
  RoyaltyPlatform,
  TrackRevenueResult,
} from "../models/royaltyTypes";
import type { RoyaltyStore } from "../services/royaltyStore";
import type { SplitDistributionEngine } from "./splitDistributionEngine";

export type RoyaltyEngineDeps = {
  royaltyStore: RoyaltyStore;
  splitEngine?: SplitDistributionEngine;
  rateCard?: Record<string, PlatformRate>;
};

export class RoyaltyEngine {
  constructor(private deps: RoyaltyEngineDeps) {}

  async calculateTrackRevenue(input: string | CalculateTrackRevenueInput): Promise<TrackRevenueResult> {
    const normalized = typeof input === "string" ? { trackId: input } : input;
    const context = await this.deps.royaltyStore.getTrackContext(normalized.trackId);
    if (!context) throw new Error(`Track not found: ${normalized.trackId}`);

    const streamCounts = await this.deps.royaltyStore.getStreamCountsByPlatform({
      trackId: normalized.trackId,
      periodStart: normalized.periodStart ?? null,
      periodEnd: normalized.periodEnd ?? null,
    });

    const records = [];
    let totalMicros = 0n;

    for (const streamCount of streamCounts) {
      const platform = String(streamCount.platform) as RoyaltyPlatform;
      const rate = getRoyaltyRate(platform, this.deps.rateCard);
      const rateMicros = decimalUsdToMicros(rate.defaultUsdPerStream);
      const revenueMicros = rateMicros * BigInt(streamCount.streams_count);
      totalMicros += revenueMicros;

      const record = await this.deps.royaltyStore.upsertRoyaltyRecord({
        track_id: context.track_id,
        release_id: context.release_id,
        platform,
        streams_count: streamCount.streams_count,
        revenue_per_stream: rate.defaultUsdPerStream,
        total_revenue: microsToDecimalUsd(revenueMicros),
        artist_id: context.artist_id,
        metadata: {
          artist_id: context.artist_id,
          featured_artists: context.featured_artists ?? [],
          genre: context.genre ?? null,
          language: context.language ?? null,
        },
        calculation_key: this.buildCalculationKey({
          trackId: context.track_id,
          platform,
          eventId: normalized.eventId ?? null,
          periodStart: normalized.periodStart ?? null,
          periodEnd: normalized.periodEnd ?? null,
        }),
      });
      records.push(record);
      await this.deps.splitEngine?.calculateSplitDistribution(record);
    }

    return {
      track_id: context.track_id,
      release_id: context.release_id,
      artist_id: context.artist_id,
      total_revenue: microsToDecimalUsd(totalMicros),
      records,
    };
  }

  private buildCalculationKey(input: {
    trackId: string;
    platform: RoyaltyPlatform;
    eventId?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  }): string {
    return [
      "track-revenue",
      input.trackId,
      input.platform,
      input.eventId ?? "snapshot",
      input.periodStart ?? "all",
      input.periodEnd ?? "all",
    ].join(":");
  }
}
