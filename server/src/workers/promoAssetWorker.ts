import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../config/envLoader";
import { logger, serializeError } from "../observability/logger";
import type { WorkerLike } from "../queue/queueFactory";
import { PromoAssetVideoProcessor } from "../media/promo-assets/processing/videoProcessor";

type PromoAssetJob = {
  id: string;
  promo_asset_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  created_at: string;
};

export type PromoAssetWorkerOptions = {
  pollIntervalMs?: number;
};

const log = logger.child({ component: "promo-asset-worker" });

export class PromoAssetWorker implements WorkerLike {
  readonly name = "promo-asset-processing";
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private paused = false;
  private closed = false;

  constructor(
    private readonly processor = new PromoAssetVideoProcessor(),
    private readonly supabase: SupabaseClient = createSupabaseServiceClient(),
    private readonly options: PromoAssetWorkerOptions = {},
  ) {}

  async start() {
    await this.processor.startupCheck();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.options.pollIntervalMs ?? 5000);
    return this;
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
    void this.tick();
  }

  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.running || this.paused || this.closed) return;
    this.running = true;
    try {
      const job = await this.claimJob();
      if (!job) return;
      await this.processJob(job);
    } catch (error) {
      log.error("promo asset worker tick failed", { error: serializeError(error) });
    } finally {
      this.running = false;
    }
  }

  private async claimJob(): Promise<PromoAssetJob | null> {
    const { data, error } = await (this.supabase as any).rpc("claim_next_promo_asset_job");
    if (error) throw error;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return rows[0] || null;
  }

  private async processJob(job: PromoAssetJob) {
    log.info("promo asset job started", { jobId: job.id, assetId: job.promo_asset_id });
    try {
      await this.processor.process(job.promo_asset_id, async (progress) => {
        await this.updateJob(job.id, { progress });
      });
      await this.updateJob(job.id, {
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
      });
      log.info("promo asset job completed", { jobId: job.id, assetId: job.promo_asset_id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Promise.all([
        this.updateJob(job.id, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message,
        }),
        this.markAssetFailed(job.promo_asset_id, message),
      ]);
      log.error("promo asset job failed", {
        jobId: job.id,
        assetId: job.promo_asset_id,
        error: serializeError(error),
      });
    }
  }

  private async updateJob(jobId: string, patch: Record<string, unknown>) {
    const { error } = await this.supabase.from("promo_asset_jobs").update(patch as any).eq("id", jobId);
    if (error) throw error;
  }

  private async markAssetFailed(assetId: string, message: string) {
    const { error } = await this.supabase
      .from("promo_assets")
      .update({
        validation_status: "failed",
        approval_status: "rejected",
        rejection_reason: message,
        validation_details: {
          summary: message,
          processing_error: true,
        },
      } as any)
      .eq("id", assetId);
    if (error) throw error;
  }
}

export async function registerPromoAssetWorker(options: PromoAssetWorkerOptions = {}) {
  const worker = new PromoAssetWorker(undefined, undefined, options);
  await worker.start();
  return worker;
}

function createSupabaseServiceClient(): SupabaseClient {
  loadRuntimeEnv();
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for promo asset worker.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
