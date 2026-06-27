import type { NormalizedStreamEvent } from "../../ingestion/streams";

export type FraudSeverity = "low" | "medium" | "high";
export type FraudDecision = "CLEAN" | "SUSPICIOUS" | "BLOCKED";
export type FraudReviewDecision = "APPROVE" | "REJECT" | "ESCALATE";

export type FraudRuleCode =
  | "STREAM_SPIKE_ANOMALY"
  | "GEO_IMPOSSIBILITY"
  | "REPEAT_EVENT_BURST"
  | "LOW_RETENTION_PATTERN"
  | "REVENUE_VS_STREAM_MISMATCH"
  | "DUPLICATE_ISRC_USAGE"
  | "DUPLICATE_AUDIO_FINGERPRINT"
  | "SUSPICIOUS_METADATA_REUSE"
  | "COPYRIGHT_CONFLICT"
  | "METADATA_ABUSE"
  | "SPAM_RELEASE_VELOCITY"
  | "MULTI_ACCOUNT_ABUSE"
  | "CATALOG_FRAUD_SCORE"
  | "SONG_FRAUD_SCORE"
  | "STREAMING_PATTERN_SCORE";

export type FraudRuleResult = {
  rule: FraudRuleCode;
  severity: FraudSeverity;
  scoreImpact: number;
  explanation: string;
  metadata?: Record<string, unknown>;
};

export type FraudFeatureVector = {
  event_id: string;
  track_id: string;
  user_id?: string | null;
  platform: string;
  stream_count_increment: number;
  listener_country: string;
  event_timestamp: string;
  previous_hour_streams: number;
  distinct_countries_last_5m: number;
  same_fingerprint_events_last_10m: number;
  short_duration_events_last_10m: number;
  listen_duration_seconds?: number | null;
  device_fingerprint?: string | null;
  ip_fingerprint?: string | null;
  revenue_last_day: number;
  streams_last_day: number;
  distribution_failures_last_day: number;
};

export type FraudScore = {
  fraud_event_id: string;
  score: number;
  decision: FraudDecision;
  reasons: FraudRuleResult[];
  featureVector: FraudFeatureVector;
};

export type FraudEventRecord = {
  id: string;
  event_id: string;
  track_id: string;
  user_id?: string | null;
  platform: string;
  decision: FraudDecision;
  fraud_score: number;
  reasons: FraudRuleResult[];
  raw_event: NormalizedStreamEvent;
  created_at: string;
};
