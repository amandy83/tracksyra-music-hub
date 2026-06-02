import type { BaseRealtimePublisher } from "../../realtime/publishers/basePublisher";
import type { RealtimeEventType } from "../../realtime/events";

export type MediaRealtimeEventType =
  | "MEDIA_PROCESSING_STARTED"
  | "MEDIA_READY"
  | "WAVEFORM_READY"
  | "DUPLICATE_DETECTED"
  | "MEDIA_REJECTED";

export class MediaEventPublisher {
  constructor(private readonly publisher: BaseRealtimePublisher) {}

  publish(input: {
    type: MediaRealtimeEventType;
    assetId: string;
    artistId?: string | null;
    trackId?: string | null;
    releaseId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    return (this.publisher as any).publish({
      event_id: `realtime:${input.type}:${input.assetId}`,
      event_type: input.type as RealtimeEventType,
      entity_type: input.trackId ? "track" : "release",
      entity_id: input.trackId || input.releaseId || input.assetId,
      artist_id: input.artistId,
      track_id: input.trackId,
      release_id: input.releaseId,
      sequence_key: input.trackId ? `track:${input.trackId}` : `media:${input.assetId}`,
      payload: { asset_id: input.assetId, ...(input.payload || {}) },
    });
  }
}
