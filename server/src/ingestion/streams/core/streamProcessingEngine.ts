import type { RoyaltyEngine } from "../../../royalties";
import type { RevenueAnalyticsService } from "../../../analytics/revenue";
import type { StreamAnalyticsService } from "../../../analytics/streams";
import type { NormalizedStreamEvent, StreamProcessingResult } from "../models/streamTypes";
import type { StreamingStore } from "../services/streamingStore";

export type RevenueUpdateEvent = {
  batch_id: string;
  track_id: string;
  recalculation_key: string;
};

export type StreamProcessingEngineDeps = {
  store: StreamingStore;
  royaltyEngine: Pick<RoyaltyEngine, "calculateTrackRevenue">;
  analyticsService?: Pick<RevenueAnalyticsService, "persistSnapshot">;
  streamAnalyticsService?: Pick<StreamAnalyticsService, "persistSnapshot">;
  emitRevenueUpdate?: (event: RevenueUpdateEvent) => Promise<void> | void;
};

export class StreamProcessingEngine {
  constructor(private deps: StreamProcessingEngineDeps) {}

  async processEvents(input: {
    batchId: string;
    provider: string;
    events: NormalizedStreamEvent[];
  }): Promise<StreamProcessingResult> {
    const result: StreamProcessingResult = {
      received: input.events.length,
      inserted: 0,
      duplicates: 0,
      processed_event_ids: [],
      royalty_recalculation_keys: [],
    };

    try {
      const insertedEvents: NormalizedStreamEvent[] = [];
      for (const event of input.events) {
        const inserted = await this.deps.store.insertEvent(event);
        if (!inserted) {
          result.duplicates += 1;
          continue;
        }
        await this.deps.store.applyEventToStats(event);
        insertedEvents.push(event);
        result.inserted += 1;
        result.processed_event_ids.push(event.event_id);
      }

      const recalculationInputs = this.buildRecalculationInputs(input.batchId, insertedEvents);
      for (const recalculation of recalculationInputs) {
        await this.deps.royaltyEngine.calculateTrackRevenue({
          trackId: recalculation.trackId,
          eventId: recalculation.key,
          periodStart: recalculation.periodStart,
          periodEnd: recalculation.periodEnd,
        });
        result.royalty_recalculation_keys.push(recalculation.key);
        await this.deps.emitRevenueUpdate?.({
          batch_id: input.batchId,
          track_id: recalculation.trackId,
          recalculation_key: recalculation.key,
        });
      }

      await this.deps.analyticsService?.persistSnapshot();
      await this.deps.streamAnalyticsService?.persistSnapshot();
      await this.deps.store.appendProcessingLog({
        batchId: input.batchId,
        provider: input.provider,
        status: "PROCESSED",
        result,
      });
      return result;
    } catch (error) {
      await this.deps.store.appendProcessingLog({
        batchId: input.batchId,
        provider: input.provider,
        status: "FAILED",
        result,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private buildRecalculationInputs(batchId: string, events: NormalizedStreamEvent[]) {
    const keys = new Map<string, { trackId: string; periodStart: string; periodEnd: string; key: string }>();
    for (const event of events) {
      const day = event.timestamp.slice(0, 10);
      const mapKey = `${event.track_id}:${day}`;
      keys.set(mapKey, {
        trackId: event.track_id,
        periodStart: day,
        periodEnd: day,
        key: `stream-recalc:${batchId}:${event.track_id}:${day}`,
      });
    }
    return [...keys.values()];
  }
}
