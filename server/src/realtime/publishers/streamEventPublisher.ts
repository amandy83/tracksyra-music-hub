import type { NormalizedStreamEvent } from "../../ingestion/streams";
import { BaseRealtimePublisher } from "./basePublisher";

export class StreamEventPublisher extends BaseRealtimePublisher {
  publishStreamReceived(event: NormalizedStreamEvent, artistId?: string | null) {
    return this.publish({
      event_id: this.eventId("STREAM_RECEIVED", event.event_id),
      event_type: "STREAM_RECEIVED",
      entity_type: "track",
      entity_id: event.track_id,
      artist_id: artistId ?? null,
      track_id: event.track_id,
      platform: String(event.platform),
      sequence_key: `track:${event.track_id}`,
      payload: {
        track_id: event.track_id,
        platform: event.platform,
        stream_count_increment: event.stream_count_increment,
        listener_country: event.listener_country,
        timestamp: event.timestamp,
      },
    });
  }
}
