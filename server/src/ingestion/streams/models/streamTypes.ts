import type { RoyaltyPlatform } from "../../../royalties/models/royaltyTypes";

export type StreamIngestionMode = "REALTIME" | "DAILY_BATCH";

export type StreamEvent = {
  event_id: string;
  track_id: string;
  platform: RoyaltyPlatform;
  stream_count_increment: number;
  listener_country: string;
  timestamp: string;
};

export type NormalizedStreamEvent = StreamEvent & {
  provider: string;
  ingestion_mode: StreamIngestionMode;
  received_at: string;
  raw_payload?: unknown;
};

export type StreamProcessingResult = {
  received: number;
  inserted: number;
  duplicates: number;
  processed_event_ids: string[];
  royalty_recalculation_keys: string[];
};

export type StreamProviderName = "spotify" | "apple_music" | "youtube_music";

export type StreamProviderFetchInput = {
  trackIds: string[];
  from?: string | null;
  to?: string | null;
};
