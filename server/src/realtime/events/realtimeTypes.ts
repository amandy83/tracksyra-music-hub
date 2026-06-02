export type RealtimeEventType =
  | "STREAM_RECEIVED"
  | "ROYALTY_UPDATED"
  | "WALLET_CREDITED"
  | "FRAUD_FLAGGED"
  | "DISTRIBUTION_STATUS_CHANGED"
  | "PAYOUT_REQUESTED"
  | "PAYOUT_COMPLETED"
  | "DASHBOARD_SNAPSHOT_UPDATED"
  | "MEDIA_PROCESSING_STARTED"
  | "MEDIA_READY"
  | "WAVEFORM_READY"
  | "DUPLICATE_DETECTED"
  | "MEDIA_REJECTED";

export type RealtimeEntityType = "artist" | "track" | "platform" | "payout" | "release";

export type RealtimeChannel =
  | `artist:${string}`
  | `track:${string}`
  | `platform:${string}`
  | `payout:${string}`
  | `release:${string}`;

export type RealtimeEvent = {
  event_id: string;
  event_type: RealtimeEventType;
  entity_type: RealtimeEntityType;
  entity_id: string;
  artist_id?: string | null;
  track_id?: string | null;
  release_id?: string | null;
  platform?: string | null;
  channels: RealtimeChannel[];
  sequence_key: string;
  sequence_number?: number;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export type PublishedRealtimeEvent = RealtimeEvent & {
  sequence_number: number;
};

export type RealtimeSnapshot = {
  artist_id: string;
  stream_counts: Record<string, number>;
  revenue_updates: Record<string, string>;
  fraud_alerts: Array<Record<string, unknown>>;
  distribution_statuses: Record<string, string>;
  payout_updates: Array<Record<string, unknown>>;
  rolling_metrics: Record<string, unknown>;
  updated_at: string;
};

export type RealtimeClientMessage =
  | { type: "subscribe"; channel: RealtimeChannel; since_sequence?: number }
  | { type: "unsubscribe"; channel: RealtimeChannel }
  | { type: "heartbeat" };

export type RealtimeServerMessage =
  | { type: "event"; event: PublishedRealtimeEvent }
  | { type: "snapshot"; snapshot: RealtimeSnapshot }
  | { type: "subscribed"; channel: RealtimeChannel }
  | { type: "unsubscribed"; channel: RealtimeChannel }
  | { type: "heartbeat"; timestamp: string }
  | { type: "error"; error: string };
