import type { DistributionPlatformName, DistributionJobStatus } from "../../distribution";
import { BaseRealtimePublisher } from "./basePublisher";

export class DistributionEventPublisher extends BaseRealtimePublisher {
  publishDistributionStatusChanged(input: {
    eventId: string;
    artistId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    status: DistributionJobStatus | string;
  }) {
    return this.publish({
      event_id: this.eventId("DISTRIBUTION_STATUS_CHANGED", input.eventId),
      event_type: "DISTRIBUTION_STATUS_CHANGED",
      entity_type: input.trackId ? "track" : "release",
      entity_id: input.trackId ?? input.releaseId,
      artist_id: input.artistId,
      track_id: input.trackId ?? null,
      release_id: input.releaseId,
      platform: String(input.platform),
      sequence_key: input.trackId ? `track:${input.trackId}` : `release:${input.releaseId}`,
      payload: {
        release_id: input.releaseId,
        track_id: input.trackId ?? null,
        platform: input.platform,
        status: input.status,
      },
    });
  }
}
