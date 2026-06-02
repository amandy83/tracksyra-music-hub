import type { DistributionJob as ExistingDistributionJob } from "../distribution/models/distributionTypes";
import type { CalculateTrackRevenueInput } from "../royalties/models/royaltyTypes";
import type { NormalizedStreamEvent } from "../ingestion/streams";
import type { RealtimeEvent } from "../realtime/events/realtimeTypes";
import type { AudioProcessingInput, ArtworkProcessingInput } from "../media/models";

export type SourceSystem =
  | "api"
  | "onboarding"
  | "distribution"
  | "royalties"
  | "fraud"
  | "analytics"
  | "realtime"
  | "media"
  | "worker"
  | "system";

export type JobTrace = {
  traceId: string;
  correlationId: string;
  actorUserId: string | null;
  sourceSystem: SourceSystem;
  createdAt: string;
  idempotencyKey: string;
};

export type QueueJob<TPayload extends Record<string, unknown>> = JobTrace & TPayload;

export type EmailJob = QueueJob<{
  emailQueueId: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  templateType: string;
  payload: Record<string, unknown>;
}>;

export type DistributionJob = QueueJob<{
  distributionJob: ExistingDistributionJob;
}>;

export type RoyaltyJob = QueueJob<{
  type: "TRACK_REVENUE_RECALCULATION";
  input: CalculateTrackRevenueInput;
}>;

export type FraudJob = QueueJob<{
  type: "STREAM_EVENT_SCORE" | "ROYALTY_SPIKE_SCORE" | "DISTRIBUTION_ANOMALY_SCORE";
  streamEvent?: NormalizedStreamEvent;
  royaltySpike?: {
    trackId: string;
    platform: string;
    revenueLastDay: number;
    streamsLastDay: number;
  };
  distributionAnomaly?: {
    trackId: string;
    failuresLastDay: number;
  };
}>;

export type AnalyticsJob = QueueJob<{
  type: "STREAM_ANALYTICS_REFRESH" | "REVENUE_ANALYTICS_REFRESH" | "FRAUD_ANALYTICS_REFRESH" | "DISTRIBUTION_ANALYTICS_REFRESH";
  artistId?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown>;
}>;

export type RealtimeJob = QueueJob<{
  type: "PUBLISH_EVENT" | "DASHBOARD_SNAPSHOT_REFRESH";
  event?: RealtimeEvent;
  artistId?: string | null;
}>;

export type PayoutJob = QueueJob<{
  payout_id: string;
  correlation_id: string;
  actor?: string | null;
}>;

export type MediaProcessingJob = QueueJob<{
  type: "PROCESS_AUDIO";
  input: AudioProcessingInput;
}>;

export type ArtworkProcessingJob = QueueJob<{
  type: "PROCESS_ARTWORK";
  input: ArtworkProcessingInput;
}>;

export type WaveformGenerationJob = QueueJob<{
  type: "GENERATE_WAVEFORM";
  input: AudioProcessingInput;
}>;

export type FingerprintAnalysisJob = QueueJob<{
  type: "ANALYZE_FINGERPRINT";
  input: AudioProcessingInput;
}>;

export type DeadLetterJob<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  queueName: string;
  jobName: string;
  jobId?: string;
  payload: TPayload;
  retries: number;
  failureReason: string;
  stackTrace?: string | null;
  failedAt: string;
  traceId?: string | null;
  correlationId?: string | null;
  actorUserId?: string | null;
};

export type QueueJobMap = {
  emailQueue: EmailJob;
  distributionQueue: DistributionJob;
  royaltyQueue: RoyaltyJob;
  fraudQueue: FraudJob;
  analyticsQueue: AnalyticsJob;
  realtimeQueue: RealtimeJob;
  payoutQueue: PayoutJob;
  "media-processing": MediaProcessingJob;
  "artwork-processing": ArtworkProcessingJob;
  "waveform-generation": WaveformGenerationJob;
  "fingerprint-analysis": FingerprintAnalysisJob;
};

export function createJobTrace(input: Partial<JobTrace> & { idempotencyKey: string; sourceSystem?: SourceSystem }): JobTrace {
  const now = new Date().toISOString();
  const traceId = input.traceId || input.correlationId || input.idempotencyKey;
  return {
    traceId,
    correlationId: input.correlationId || traceId,
    actorUserId: input.actorUserId ?? null,
    sourceSystem: input.sourceSystem || "system",
    createdAt: input.createdAt || now,
    idempotencyKey: input.idempotencyKey,
  };
}
