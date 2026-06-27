import type { SupabaseClient } from "@supabase/supabase-js";

import type { DistributionJobStatus, DistributionPlatformName, NormalizedDistributionError } from "../models/distributionTypes";
import { createServiceClient } from "../services/supabaseDistributionStore";
import type { DistributionStatus } from "./distributionStatus";
import type { DistributionIntelligenceStoreLike, DistributionTransitionInput } from "./distributionIntelligenceStore";

type DbClient = SupabaseClient<any, "public", any>;

export class SupabaseDistributionIntelligenceStore implements DistributionIntelligenceStoreLike {
  constructor(private client: DbClient = createServiceClient()) {}

  async getDeliveryStatus(input: { releaseId: string; trackId?: string | null; platform: DistributionPlatformName }): Promise<DistributionStatus | null> {
    let query = this.client
      .from("platform_deliveries")
      .select("status")
      .eq("release_id", input.releaseId)
      .eq("platform", input.platform)
      .order("updated_at", { ascending: false })
      .limit(1);
    query = input.trackId ? query.eq("track_id", input.trackId) : query.is("track_id", null);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to read distribution delivery status: ${error.message}`);
    return (data?.[0]?.status as DistributionStatus | undefined) ?? null;
  }

  async appendStateHistory(input: DistributionTransitionInput): Promise<void> {
    const { error } = await this.client.from("distribution_state_history").insert({
      job_id: input.jobId ?? null,
      release_id: input.releaseId,
      track_id: input.trackId ?? null,
      platform: input.platform,
      previous_status: input.previousStatus ?? null,
      next_status: input.nextStatus,
      source: input.source,
      event_id: input.eventId ?? null,
      metadata: input.metadata ?? null,
    });
    if (error && !/duplicate key/i.test(error.message)) {
      throw new Error(`Failed to append distribution state history: ${error.message}`);
    }
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
    const { error } = await this.client.from("distribution_retry_logs").insert({
      job_id: input.jobId,
      release_id: input.releaseId,
      track_id: input.trackId ?? null,
      platform: input.platform,
      attempt: input.attempt,
      retry_at: input.retryAt.toISOString(),
      error_code: input.error.errorCode,
      error_message: input.error.message,
      retryable: input.error.retryable,
    });
    if (error) throw new Error(`Failed to write distribution retry log: ${error.message}`);

    const { error: updateError } = await this.client
      .from("distribution_jobs")
      .update({
        status: "PENDING",
        attempts: input.attempt,
        next_retry_at: input.retryAt.toISOString(),
        last_error: input.error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.jobId);
    if (updateError) throw new Error(`Failed to schedule distribution retry: ${updateError.message}`);
  }

  async markDeadLetter(input: {
    jobId: string;
    releaseId: string;
    trackId?: string | null;
    platform: DistributionPlatformName;
    attempt: number;
    error: NormalizedDistributionError;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client.from("distribution_retry_logs").insert({
      job_id: input.jobId,
      release_id: input.releaseId,
      track_id: input.trackId ?? null,
      platform: input.platform,
      attempt: input.attempt,
      error_code: input.error.errorCode,
      error_message: input.error.message,
      retryable: input.error.retryable,
      dead_lettered_at: now,
    });
    if (error) throw new Error(`Failed to write dead-letter retry log: ${error.message}`);

    const { error: updateError } = await this.client
      .from("distribution_jobs")
      .update({
        status: "DEAD_LETTER",
        attempts: input.attempt,
        dead_lettered_at: now,
        last_error: input.error.message,
        updated_at: now,
      })
      .eq("id", input.jobId);
    if (updateError) throw new Error(`Failed to mark distribution dead-letter: ${updateError.message}`);
  }

  async updateJobLifecycleStatus(jobId: string, status: DistributionJobStatus): Promise<void> {
    const { error } = await this.client
      .from("distribution_jobs")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) throw new Error(`Failed to update distribution lifecycle status: ${error.message}`);
  }
}
