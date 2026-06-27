import type { DistributionJobStatus, DistributionPlatformName, NormalizedDistributionError } from "../models/distributionTypes";
import type { DistributionStatus } from "./distributionStatus";
import type { SqlExecutor } from "../services/distributionStore";

export type DistributionTransitionInput = {
  jobId?: string | null;
  releaseId: string;
  trackId?: string | null;
  platform: DistributionPlatformName;
  previousStatus?: DistributionStatus | null;
  nextStatus: DistributionStatus;
  source: "ENGINE" | "WORKER" | "WEBHOOK" | "RETRY" | "ANALYTICS";
  eventId?: string | null;
  metadata?: unknown;
};

export interface DistributionIntelligenceStoreLike {
  getDeliveryStatus(input: { releaseId: string; trackId?: string | null; platform: DistributionPlatformName }): Promise<DistributionStatus | null>;
  appendStateHistory(input: DistributionTransitionInput): Promise<void>;
  scheduleRetry(input: {
    jobId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    attempt: number;
    retryAt: Date;
    error: NormalizedDistributionError;
  }): Promise<void>;
  markDeadLetter(input: {
    jobId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    attempt: number;
    error: NormalizedDistributionError;
  }): Promise<void>;
  updateJobLifecycleStatus?(jobId: string, status: DistributionJobStatus): Promise<void>;
}

export class DistributionIntelligenceStore implements DistributionIntelligenceStoreLike {
  constructor(private db: SqlExecutor) {}

  async getDeliveryStatus(input: { releaseId: string; trackId?: string | null; platform: DistributionPlatformName }): Promise<DistributionStatus | null> {
    const rows = await this.db.query<{ status: DistributionStatus }>(
      `SELECT status FROM platform_deliveries
       WHERE release_id = :releaseId
         AND platform = :platform
         AND (:trackId IS NULL OR track_id = :trackId)
       ORDER BY updated_at DESC
       LIMIT 1`,
      { releaseId: input.releaseId, trackId: input.trackId ?? null, platform: input.platform },
    );
    return rows[0]?.status ?? null;
  }

  async appendStateHistory(input: DistributionTransitionInput): Promise<void> {
    await this.db.query(
      `INSERT INTO distribution_state_history (
         job_id, release_id, track_id, platform, previous_status, next_status, source, event_id, metadata
       ) VALUES (
         :jobId, :releaseId, :trackId, :platform, :previousStatus, :nextStatus, :source, :eventId, CAST(:metadata AS jsonb)
       )
       ON CONFLICT (event_id, release_id, track_id, platform, next_status) WHERE event_id IS NOT NULL DO NOTHING`,
      {
        jobId: input.jobId ?? null,
        releaseId: input.releaseId,
        trackId: input.trackId ?? null,
        platform: input.platform,
        previousStatus: input.previousStatus ?? null,
        nextStatus: input.nextStatus,
        source: input.source,
        eventId: input.eventId ?? null,
        metadata: JSON.stringify(input.metadata ?? null),
      },
    );
  }

  async scheduleRetry(input: {
    jobId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    attempt: number;
    retryAt: Date;
    error: NormalizedDistributionError;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO distribution_retry_logs (
         job_id, release_id, track_id, platform, attempt, retry_at, error_code, error_message, retryable
       ) VALUES (
         :jobId, :releaseId, :trackId, :platform, :attempt, :retryAt, :errorCode, :errorMessage, :retryable
       )`,
      {
        jobId: input.jobId,
        releaseId: input.releaseId,
        trackId: input.trackId ?? null,
        platform: input.platform,
        attempt: input.attempt,
        retryAt: input.retryAt.toISOString(),
        errorCode: input.error.errorCode,
        errorMessage: input.error.message,
        retryable: input.error.retryable,
      },
    );
    await this.db.query(
      `UPDATE distribution_jobs
       SET status = 'PENDING', next_retry_at = :retryAt, last_error = :errorMessage, updated_at = now()
       WHERE id = :jobId`,
      { jobId: input.jobId, retryAt: input.retryAt.toISOString(), errorMessage: input.error.message },
    );
  }

  async markDeadLetter(input: {
    jobId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    attempt: number;
    error: NormalizedDistributionError;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO distribution_retry_logs (
         job_id, release_id, track_id, platform, attempt, error_code, error_message, retryable, dead_lettered_at
       ) VALUES (
         :jobId, :releaseId, :trackId, :platform, :attempt, :errorCode, :errorMessage, :retryable, now()
       )`,
      {
        jobId: input.jobId,
        releaseId: input.releaseId,
        trackId: input.trackId ?? null,
        platform: input.platform,
        attempt: input.attempt,
        errorCode: input.error.errorCode,
        errorMessage: input.error.message,
        retryable: input.error.retryable,
      },
    );
    await this.db.query(
      `UPDATE distribution_jobs SET status = 'DEAD_LETTER', last_error = :errorMessage, updated_at = now() WHERE id = :jobId`,
      { jobId: input.jobId, errorMessage: input.error.message },
    );
  }

  async updateJobLifecycleStatus(jobId: string, status: DistributionJobStatus): Promise<void> {
    await this.db.query(
      `UPDATE distribution_jobs SET status = :status, updated_at = now() WHERE id = :jobId`,
      { jobId, status },
    );
  }
}
