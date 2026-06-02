import type { RoyaltyEngine } from "../../royalties";
import type { RoyaltyPlatform } from "../../royalties/models/royaltyTypes";

export type StreamUpdateEvent = {
  eventId: string;
  trackId: string;
  platform?: RoyaltyPlatform;
  periodStart?: string | null;
  periodEnd?: string | null;
  rawPayload?: unknown;
};

export class StreamRevenueHook {
  constructor(private royaltyEngine: RoyaltyEngine) {}

  async handleStreamUpdate(event: StreamUpdateEvent) {
    return this.royaltyEngine.calculateTrackRevenue({
      trackId: event.trackId,
      eventId: event.eventId,
      periodStart: event.periodStart ?? null,
      periodEnd: event.periodEnd ?? null,
    });
  }
}
