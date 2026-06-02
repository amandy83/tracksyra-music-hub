import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../config/envLoader";
import { inspectDeadLetterQueue, retryQueueJob } from "../queue/queueFactory";
import { enqueueEmailJob, type EmailQueueRow } from "../notifications/emailQueue";
import { logger } from "../observability/logger";

export class AdminRecoveryService {
  constructor(private supabase: SupabaseClient = createSupabaseClient()) {}

  async replayFailedEmail(emailQueueId: string) {
    const { data, error } = await this.supabase
      .from("email_queue")
      .update({ status: "PENDING", last_error: null, scheduled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", emailQueueId)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to replay email: ${error.message}`);
    await enqueueEmailJob(data as EmailQueueRow);
    logger.info("admin replayed failed email", { component: "admin-recovery", emailQueueId });
    return data;
  }

  async replayDistributionJob(jobId: string) {
    await retryQueueJob("distributionQueue", jobId);
    logger.info("admin retried distribution job", { component: "admin-recovery", jobId });
  }

  async replayPayoutJob(jobId: string) {
    await retryQueueJob("payoutQueue", jobId);
    logger.info("admin retried payout job", { component: "admin-recovery", jobId });
  }

  async replayWebhookFailure(eventId: string) {
    const { error } = await this.supabase
      .from("distribution_webhook_events")
      .update({ processed_at: null, error_message: null })
      .eq("id", eventId);
    if (error) throw new Error(`Failed to replay webhook event: ${error.message}`);
    logger.info("admin replayed webhook failure", { component: "admin-recovery", eventId });
  }

  async inspectDeadLetters(queueName: string, start = 0, end = 50) {
    return inspectDeadLetterQueue(queueName, start, end);
  }
}

function createSupabaseClient() {
  loadRuntimeEnv();
  const env = typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env
    : {};
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("AdminRecoveryService requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
