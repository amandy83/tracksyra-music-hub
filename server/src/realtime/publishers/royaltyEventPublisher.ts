import type { RoyaltyRecord } from "../../royalties";
import { BaseRealtimePublisher } from "./basePublisher";

export class RoyaltyEventPublisher extends BaseRealtimePublisher {
  publishRoyaltyUpdated(record: RoyaltyRecord) {
    return this.publish({
      event_id: this.eventId("ROYALTY_UPDATED", record.id),
      event_type: "ROYALTY_UPDATED",
      entity_type: "track",
      entity_id: record.track_id,
      artist_id: record.artist_id,
      track_id: record.track_id,
      release_id: record.release_id,
      platform: String(record.platform),
      sequence_key: `track:${record.track_id}`,
      payload: {
        royalty_record_id: record.id,
        track_id: record.track_id,
        release_id: record.release_id,
        platform: record.platform,
        streams_count: record.streams_count,
        total_revenue: record.total_revenue,
      },
    });
  }

  publishWalletCredited(input: {
    userId: string;
    trackId: string;
    royaltyRecordId: string;
    amount: string;
  }) {
    return this.publish({
      event_id: this.eventId("WALLET_CREDITED", `${input.royaltyRecordId}:${input.userId}`),
      event_type: "WALLET_CREDITED",
      entity_type: "artist",
      entity_id: input.userId,
      artist_id: input.userId,
      track_id: input.trackId,
      sequence_key: `artist:${input.userId}`,
      payload: {
        user_id: input.userId,
        track_id: input.trackId,
        royalty_record_id: input.royaltyRecordId,
        amount: input.amount,
      },
    });
  }
}
