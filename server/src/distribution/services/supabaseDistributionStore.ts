import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadRuntimeEnv } from "../../config/envLoader";
import type {
  DistributionJob,
  DistributionJobStatus,
  DistributionPlatformName,
  DistributionRelease,
  DistributionTrack,
  NormalizedDistributionError,
} from "../models/distributionTypes";
import type { DistributionStore } from "./distributionStore";

type DbClient = SupabaseClient<any, "public", any>;

const SIGNED_AUDIO_URL_TTL_SECONDS = 60 * 60 * 24;

export class SupabaseDistributionStore implements DistributionStore {
  constructor(private client: DbClient = createServiceClient()) {}

  async getReleaseWithTracks(releaseId: string): Promise<{ release: DistributionRelease; tracks: DistributionTrack[] } | null> {
    const { data: release, error: releaseError } = await this.client
      .from("releases")
      .select("*")
      .eq("id", releaseId)
      .maybeSingle();
    if (releaseError) throw new Error(`Failed to read release ${releaseId}: ${releaseError.message}`);
    if (!release) return null;

    const { data: tracks, error: tracksError } = await this.client
      .from("tracks")
      .select("*")
      .eq("release_id", releaseId)
      .order("track_number", { ascending: true });
    if (tracksError) throw new Error(`Failed to read tracks for release ${releaseId}: ${tracksError.message}`);

    return {
      release: this.mapRelease(release),
      tracks: await Promise.all((tracks || []).map((track) => this.mapTrack(track))),
    };
  }

  async getTrackWithRelease(trackId: string): Promise<{ release: DistributionRelease; track: DistributionTrack } | null> {
    const { data: track, error: trackError } = await this.client
      .from("tracks")
      .select("*")
      .eq("id", trackId)
      .maybeSingle();
    if (trackError) throw new Error(`Failed to read track ${trackId}: ${trackError.message}`);
    if (!track) return null;

    const { data: release, error: releaseError } = await this.client
      .from("releases")
      .select("*")
      .eq("id", track.release_id)
      .maybeSingle();
    if (releaseError) throw new Error(`Failed to read release ${track.release_id}: ${releaseError.message}`);
    if (!release) return null;

    return { release: this.mapRelease(release), track: await this.mapTrack(track) };
  }

  async getJobPayload(job: DistributionJob): Promise<{ release: DistributionRelease; track: DistributionTrack } | null> {
    if (!job.trackId) return null;
    return this.getTrackWithRelease(job.trackId);
  }

  async ensurePlatformDelivery(input: {
    releaseId: string;
    trackId: string;
    userId: string;
    platform: DistributionPlatformName;
  }): Promise<void> {
    const { error } = await this.client
      .from("platform_deliveries")
      .upsert({
        release_id: input.releaseId,
        track_id: input.trackId,
        user_id: input.userId,
        platform: input.platform,
        status: "PENDING",
      }, { onConflict: "track_id,platform", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to ensure platform delivery: ${error.message}`);
  }

  async createDistributionJob(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<DistributionJob | null> {
    const { data, error } = await this.client
      .from("distribution_jobs")
      .upsert({
        release_id: input.releaseId,
        track_id: input.trackId,
        platform: input.platform,
        status: "PENDING",
      }, { onConflict: "track_id,platform", ignoreDuplicates: true })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to create distribution job: ${error.message}`);
    return data ? this.mapJob(data) : null;
  }

  async getPendingJobs(limit: number): Promise<DistributionJob[]> {
    const { data, error } = await this.client
      .from("distribution_jobs")
      .select("*")
      .eq("status", "PENDING")
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to read pending distribution jobs: ${error.message}`);
    return (data || []).map((row) => this.mapJob(row));
  }

  async updateJobStatus(jobId: string, status: DistributionJobStatus): Promise<void> {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (["PUBLISHED", "FAILED", "DELIVERED", "REJECTED", "DEAD_LETTER"].includes(status)) {
      patch.processed_at = new Date().toISOString();
    }
    const { error } = await this.client.from("distribution_jobs").update(patch).eq("id", jobId);
    if (error) throw new Error(`Failed to update distribution job ${jobId}: ${error.message}`);
  }

  async updateDeliveryStatus(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
    status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  }): Promise<void> {
    const patch: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
    if (input.status === "PUBLISHED") patch.delivered_at = new Date().toISOString();
    const { error } = await this.client
      .from("platform_deliveries")
      .update(patch)
      .eq("release_id", input.releaseId)
      .eq("track_id", input.trackId)
      .eq("platform", input.platform);
    if (error) throw new Error(`Failed to update delivery status: ${error.message}`);
  }

  async recordDeliveryResult(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
    status: "PUBLISHED" | "FAILED";
    platformTrackId?: string | null;
    rawResponse?: unknown;
    error?: NormalizedDistributionError | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      status: input.status,
      platform_track_id: input.platformTrackId ?? null,
      raw_response: input.rawResponse ?? null,
      error_code: input.error?.errorCode ?? null,
      error_message: input.error?.message ?? null,
      retryable: input.error?.retryable ?? null,
      updated_at: new Date().toISOString(),
    };
    if (input.status === "PUBLISHED") patch.delivered_at = new Date().toISOString();

    const { error } = await this.client
      .from("platform_deliveries")
      .update(patch)
      .eq("release_id", input.releaseId)
      .eq("track_id", input.trackId)
      .eq("platform", input.platform);
    if (error) throw new Error(`Failed to record delivery result: ${error.message}`);

    const request = extractApiRequest(input.rawResponse);
    const response = extractApiResponse(input.rawResponse);
    const failureReason = input.error?.message ?? null;
    const { error: jobError } = await this.client
      .from("distribution_jobs")
      .update({
        api_request: request,
        api_response: response,
        failure_reason: failureReason,
        retry_count: input.status === "FAILED" ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("release_id", input.releaseId)
      .eq("track_id", input.trackId)
      .eq("platform", input.platform);
    if (jobError) throw new Error(`Failed to persist distribution API audit fields: ${jobError.message}`);

    await this.client.from("distribution_sync_logs").insert({
      provider: "too_lost",
      release_id: input.releaseId,
      track_id: input.trackId,
      sync_type: "DELIVERY_RESULT",
      status: input.status,
      api_request: request,
      api_response: response,
      failure_reason: failureReason,
      retry_count: input.status === "FAILED" ? 1 : 0,
    });

    await this.audit({
      releaseId: input.releaseId,
      trackId: input.trackId,
      provider: input.platform,
      action: "DELIVERY_RESULT",
      status: input.status,
      metadata: { platformTrackId: input.platformTrackId ?? null, error: input.error ?? null },
    });
  }

  async isWebhookConfirmed(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<boolean> {
    const { data, error } = await this.client
      .from("distribution_state_history")
      .select("id")
      .eq("release_id", input.releaseId)
      .eq("track_id", input.trackId)
      .eq("platform", input.platform)
      .eq("source", "WEBHOOK")
      .in("next_status", ["SUBMITTED", "IN_REVIEW", "APPROVED", "DELIVERED", "REJECTED"])
      .limit(1);
    if (error) throw new Error(`Failed to check webhook state: ${error.message}`);
    return Boolean(data?.length);
  }

  private async mapTrack(row: any): Promise<DistributionTrack> {
    return {
      id: row.id,
      releaseId: row.release_id,
      userId: row.artist_id || row.user_id,
      artistId: row.artist_id || row.user_id,
      title: row.title,
      primaryArtist: row.primary_artist || undefined,
      featuredArtists: splitArtists(row.featured_artists),
      audioUrl: await this.resolveAudioUrl(row.audio_url),
      isrc: row.isrc,
      explicit: Boolean(row.explicit),
    };
  }

  private mapRelease(row: any): DistributionRelease {
    return {
      id: row.id,
      userId: row.artist_id || row.user_id,
      artistId: row.artist_id || row.user_id,
      title: row.title,
      primaryArtist: row.primary_artist,
      releaseDate: row.release_date,
      genre: row.genre,
      language: row.language,
      upc: row.upc,
      copyright: row.copyright_owner,
      coverArtUrl: row.cover_art_url,
      type: row.release_type,
    };
  }

  private mapJob(row: any): DistributionJob {
    return {
      id: row.id,
      releaseId: row.release_id,
      trackId: row.track_id,
      platform: row.platform,
      status: row.status,
      createdAt: new Date(row.created_at),
      attempts: row.attempts ?? 0,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    };
  }

  private async resolveAudioUrl(value: string | null | undefined): Promise<string | null> {
    if (!value || /^https?:\/\//i.test(value)) return value ?? null;
    const { data, error } = await this.client.storage
      .from("audio")
      .createSignedUrl(value, SIGNED_AUDIO_URL_TTL_SECONDS);
    if (error) throw new Error(`Failed to create signed audio URL for distribution: ${error.message}`);
    return data.signedUrl;
  }

  private async audit(input: {
    releaseId: string;
    trackId: string;
    provider: DistributionPlatformName;
    action: string;
    status: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.client.from("distribution_audit_logs").insert({
      release_id: input.releaseId,
      track_id: input.trackId,
      provider: input.provider,
      action: input.action,
      status: input.status,
      actor: "worker",
      metadata: input.metadata ?? {},
    });
  }
}

export function createServiceClient(): DbClient {
  loadRuntimeEnv();
  const env = (globalThis as any).process?.env as Record<string, string | undefined>;
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Distribution worker requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function splitArtists(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractApiRequest(value: unknown): unknown {
  if (value && typeof value === "object" && "payload" in value) return (value as { payload?: unknown }).payload ?? {};
  return {};
}

function extractApiResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value ?? {};
  const { payload: _payload, ...response } = value as Record<string, unknown>;
  return response;
}
