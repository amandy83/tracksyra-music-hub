import { createHmac, timingSafeEqual } from "crypto";

import { DistributionAnalyticsService } from "../analytics";
import {
  assertDistributionStatusTransition,
  DistributionIntelligenceStore,
  DistributionStatus,
  mapProviderStatus,
} from "../intelligence";
import type { DistributionPlatformName } from "../models/distributionTypes";
import type { DistributionStore, SqlExecutor } from "../services/distributionStore";
import { captureException } from "../../observability/errorTracker";
import { loadRuntimeEnv } from "../../config/envLoader";
import { checkRateLimit, getClientIp, rateLimitRules, suspiciousActivityLog } from "../../security/rateLimiter";

export type RevelatorWebhookEventType =
  | "RELEASE_SUBMITTED"
  | "RELEASE_IN_REVIEW"
  | "RELEASE_APPROVED"
  | "RELEASE_REJECTED"
  | "RELEASE_DELIVERED"
  | "PLATFORM_DELIVERY_FAILED";

export type NormalizedRevelatorWebhookEvent = {
  eventId: string;
  type: RevelatorWebhookEventType;
  releaseId: string;
  trackId?: string | null;
  platform: DistributionPlatformName;
  status: DistributionStatus;
  rawPayload: unknown;
};

export type RevelatorWebhookControllerDeps = {
  db: SqlExecutor;
  distributionStore: DistributionStore;
  secret?: string;
  intelligenceStore?: DistributionIntelligenceStore;
  analyticsService?: DistributionAnalyticsService;
};

export class RevelatorWebhookController {
  private readonly secret: string;
  private readonly intelligenceStore: DistributionIntelligenceStore;
  private readonly analyticsService: DistributionAnalyticsService;

  constructor(private deps: RevelatorWebhookControllerDeps) {
    this.secret = deps.secret ?? readEnv("REVELATOR_WEBHOOK_SECRET");
    this.intelligenceStore = deps.intelligenceStore ?? new DistributionIntelligenceStore(deps.db);
    this.analyticsService = deps.analyticsService ?? new DistributionAnalyticsService(deps.db);
  }

  async handle(input: { body: string; headers: Record<string, string | string[] | undefined> }): Promise<{ ok: true; event: NormalizedRevelatorWebhookEvent }> {
    const ip = getClientIp(input.headers);
    const rate = checkRateLimit(rateLimitRules.webhook, ip);
    if (!rate.allowed) {
      suspiciousActivityLog({ category: "webhook", ip, reason: "revelator webhook rate limit" });
      throw new Error("Webhook rate limit exceeded");
    }

    let event: NormalizedRevelatorWebhookEvent | null = null;
    try {
      this.verifySignature(input.body, input.headers);
      const payload = JSON.parse(input.body);
      event = this.normalize(payload);

      await this.persistRawWebhook(event);

      const previousStatus = await this.intelligenceStore.getDeliveryStatus({
        releaseId: event.releaseId,
        trackId: event.trackId,
        platform: event.platform,
      });
      assertDistributionStatusTransition(previousStatus, event.status);

      await this.deps.distributionStore.updateDeliveryStatus({
        releaseId: event.releaseId,
        trackId: event.trackId ?? "",
        platform: event.platform,
        status: this.toDeliveryStatus(event.status),
      });

      await this.updateMatchingJobs(event);
      await this.intelligenceStore.appendStateHistory({
        releaseId: event.releaseId,
        trackId: event.trackId,
        platform: event.platform,
        previousStatus,
        nextStatus: event.status,
        source: "WEBHOOK",
        eventId: event.eventId,
        metadata: event.rawPayload,
      });
      await this.analyticsService.refreshPlatformMetrics(event.platform);

      return { ok: true, event };
    } catch (error) {
      await captureException({
        error,
        context: { component: "revelator-webhook", eventId: event?.eventId, releaseId: event?.releaseId, ip },
        tags: { webhook: "revelator" },
      });
      throw error;
    }
  }

  normalize(payload: any): NormalizedRevelatorWebhookEvent {
    const type = String(payload.type ?? payload.eventType ?? payload.event ?? "").toUpperCase() as RevelatorWebhookEventType;
    const releaseId = String(payload.releaseId ?? payload.release_id ?? payload.externalReleaseId ?? "");
    if (!releaseId) throw new Error("Webhook payload missing releaseId");

    return {
      eventId: String(payload.id ?? payload.eventId ?? `${type}:${releaseId}:${payload.trackId ?? ""}`),
      type,
      releaseId,
      trackId: payload.trackId ?? payload.track_id ?? null,
      platform: "revelator",
      status: this.mapEventTypeToStatus(type, payload),
      rawPayload: payload,
    };
  }

  private verifySignature(body: string, headers: Record<string, string | string[] | undefined>): void {
    if (!this.secret) return;
    const signature = header(headers, "x-revelator-signature") ?? header(headers, "x-signature");
    if (!signature) throw new Error("Missing Revelator webhook signature");

    const expected = createHmac("sha256", this.secret).update(body).digest("hex");
    const received = signature.replace(/^sha256=/, "");
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(received, "hex");
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
      throw new Error("Invalid Revelator webhook signature");
    }
  }

  private mapEventTypeToStatus(type: RevelatorWebhookEventType, payload: any): DistributionStatus {
    if (payload.status) return mapProviderStatus(String(payload.status));
    switch (type) {
      case "RELEASE_SUBMITTED":
        return DistributionStatus.SUBMITTED;
      case "RELEASE_IN_REVIEW":
        return DistributionStatus.IN_REVIEW;
      case "RELEASE_APPROVED":
        return DistributionStatus.APPROVED;
      case "RELEASE_DELIVERED":
        return DistributionStatus.DELIVERED;
      case "RELEASE_REJECTED":
        return DistributionStatus.REJECTED;
      case "PLATFORM_DELIVERY_FAILED":
        return DistributionStatus.FAILED;
      default:
        return DistributionStatus.PROCESSING;
    }
  }

  private async persistRawWebhook(event: NormalizedRevelatorWebhookEvent): Promise<void> {
    await this.deps.db.query(
      `INSERT INTO distribution_webhook_events (
         event_id, provider, event_type, release_id, track_id, platform, normalized_status, raw_payload
       ) VALUES (
         :eventId, 'revelator', :eventType, :releaseId, :trackId, :platform, :status, CAST(:rawPayload AS jsonb)
       )
       ON CONFLICT (provider, event_id) DO NOTHING`,
      {
        eventId: event.eventId,
        eventType: event.type,
        releaseId: event.releaseId,
        trackId: event.trackId ?? null,
        platform: event.platform,
        status: event.status,
        rawPayload: JSON.stringify(event.rawPayload),
      },
    );
  }

  private async updateMatchingJobs(event: NormalizedRevelatorWebhookEvent): Promise<void> {
    await this.deps.db.query(
      `UPDATE distribution_jobs
       SET status = :status, updated_at = now(), processed_at = CASE WHEN :status IN ('DELIVERED', 'FAILED', 'REJECTED') THEN now() ELSE processed_at END
       WHERE release_id = :releaseId
         AND (:trackId IS NULL OR track_id = :trackId)`,
      { status: event.status, releaseId: event.releaseId, trackId: event.trackId ?? null },
    );
  }

  private toDeliveryStatus(status: DistributionStatus): "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED" {
    if (status === DistributionStatus.PENDING) return "PENDING";
    if (status === DistributionStatus.FAILED || status === DistributionStatus.REJECTED || status === DistributionStatus.DEAD_LETTER) return "FAILED";
    if (status === DistributionStatus.DELIVERED) return "PUBLISHED";
    return "PROCESSING";
  }
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  if (Array.isArray(entry)) return entry[0] ?? null;
  return entry ?? null;
}

function readEnv(key: string): string {
  loadRuntimeEnv();
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key] ?? "";
}
