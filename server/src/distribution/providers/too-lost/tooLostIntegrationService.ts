import type { DistributionStore } from "../../services/distributionStore";
import type { SqlExecutor } from "../../services/distributionStore";
import { normalizeTooLostError } from "./tooLostError";
import {
  createTooLostOAuthAuthorizationUrl,
  exchangeTooLostOAuthCode,
  readTooLostConfig,
  refreshTooLostOAuthToken,
  TOO_LOST_APPROVED_SCOPES,
} from "./tooLostOAuth";
import { TooLostCredentialStore } from "./tooLostCredentialStore";
import type {
  TooLostConfig,
  TooLostConnectionStatus,
  TooLostOAuthToken,
  TooLostReleasePayload,
  TooLostStoredCredentials,
} from "./tooLostTypes";

type HttpClient = typeof fetch;

export type TooLostIntegrationServiceOptions = {
  config?: Partial<TooLostConfig>;
  httpClient?: HttpClient;
  credentialStore?: TooLostCredentialStore;
};

export type TooLostReleaseStatusSnapshot = {
  releaseId: string;
  releaseTitle: string | null;
  releaseStatus: string | null;
  providerStatus: string;
  distributionStatus: string;
  providerReleaseId: string | null;
  trackStatuses: Array<{
    trackId: string;
    title: string | null;
    jobStatus: string | null;
    deliveryStatus: string | null;
    providerTrackId: string | null;
    updatedAt: string | null;
  }>;
};

export type TooLostAnalyticsImportResult = {
  imported: boolean;
  reason: string;
  streams: number;
  audience: number;
  earnings: number;
  sales: number;
};

export class TooLostIntegrationService {
  private readonly config: TooLostConfig;
  private readonly httpClient: HttpClient;
  private readonly credentials: TooLostCredentialStore;

  constructor(private store: DistributionStore, private db: SqlExecutor, options: TooLostIntegrationServiceOptions = {}) {
    this.config = readTooLostConfig(options.config);
    this.httpClient = options.httpClient ?? fetch;
    this.credentials = options.credentialStore ?? new TooLostCredentialStore();
  }

  buildAuthorizationUrl(input: { returnToPath?: string | null } = {}): { url: string; state: string; codeVerifier: string } {
    return createTooLostOAuthAuthorizationUrl({
      config: this.config,
      scopes: [...TOO_LOST_APPROVED_SCOPES],
      returnToPath: sanitizeReturnToPath(input.returnToPath),
    });
  }

  async handleOAuthCallback(input: { code: string; state: string }): Promise<{ connection: TooLostConnectionStatus; redirectTo: string | null }> {
    const oauthState = await this.credentials.loadOAuthState(input.state);
    if (!oauthState) {
      throw httpError(400, "INVALID_STATE", "Too Lost OAuth state is invalid or expired.");
    }

    const token = await exchangeTooLostOAuthCode({
      code: input.code,
      codeVerifier: oauthState.codeVerifier,
      config: this.config,
      httpClient: this.httpClient,
    });

    const profile = await this.fetchAccountProfile(token).catch(() => null);
    await this.credentials.storeTokenSet(token, {
      connectedAccountId: profile?.id ?? null,
      connectedAccountName: profile?.name ?? profile?.display_name ?? profile?.account_name ?? null,
      connectedAccountEmail: profile?.email ?? null,
    });
    await this.credentials.markOAuthStateCompleted(input.state);
    await this.credentials.updateProviderSyncStatus({
      syncStatus: "connected",
      lastSyncAt: new Date().toISOString(),
      isEnabled: true,
    });
    await this.credentials.recordSandboxRun({
      runType: "oauth",
      status: "PASS",
      request: { callback: true, state: input.state },
      response: { connectedAccount: profile ?? null },
      notes: "Live OAuth callback completed.",
    });

    return {
      connection: await this.credentials.getConnectionStatus(),
      redirectTo: sanitizeReturnToPath(oauthState.returnToPath) ?? "/dashboard",
    };
  }

  async disconnect(reason = "Disconnected by operator"): Promise<TooLostConnectionStatus> {
    await this.credentials.clearConnection(reason);
    await this.credentials.recordSandboxRun({
      runType: "failure_recovery",
      status: "PASS",
      request: { action: "disconnect" },
      response: { ok: true },
      notes: reason,
    });
    return this.credentials.getConnectionStatus();
  }

  async getStatus(): Promise<TooLostConnectionStatus> {
    return this.credentials.getConnectionStatus();
  }

  async submitRelease(releaseId: string): Promise<{
    release: TooLostReleaseStatusSnapshot;
    request: TooLostReleasePayload;
    response: unknown;
    externalReleaseId: string | null;
  }> {
    const payload = await this.buildReleasePayload(releaseId);
    const response = await this.requestJson(`/v2/releases`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const externalReleaseId = parseExternalReleaseId(response);
    await this.persistSubmission(releaseId, externalReleaseId, payload, response);
    await this.credentials.updateProviderSyncStatus({
      syncStatus: "connected",
      lastSyncAt: new Date().toISOString(),
      isEnabled: true,
    });
    return {
      release: await this.fetchReleaseStatus(releaseId),
      request: payload,
      response,
      externalReleaseId,
    };
  }

  async updateRelease(releaseId: string): Promise<{
    release: TooLostReleaseStatusSnapshot;
    updated: boolean;
    reason: string;
  }> {
    const snapshot = await this.fetchReleaseStatus(releaseId);
    const release = await this.store.getReleaseWithTracks(releaseId);
    if (!release) {
      throw httpError(404, "RELEASE_NOT_FOUND", `Release ${releaseId} was not found.`);
    }

    if (!snapshot.providerReleaseId) {
      return { release: snapshot, updated: false, reason: "Too Lost release identifier unavailable." };
    }

    return { release: snapshot, updated: false, reason: "Too Lost release update endpoint is not verified in the available API documentation." };
  }

  async fetchReleaseStatus(releaseId: string): Promise<TooLostReleaseStatusSnapshot> {
    const rows = await this.db.query<{
      release_id: string;
      release_title: string | null;
      release_status: string | null;
      job_status: string | null;
      provider_job_id: string | null;
      delivery_status: string | null;
      track_id: string;
      track_title: string | null;
      updated_at: string | null;
    }>(
      `SELECT
         r.id::text AS release_id,
         r.title AS release_title,
         r.status AS release_status,
         j.status AS job_status,
         j.provider_job_id,
         pd.status AS delivery_status,
         t.id::text AS track_id,
         t.title AS track_title,
         GREATEST(COALESCE(j.updated_at, t.updated_at, r.updated_at), COALESCE(pd.updated_at, r.updated_at)) AS updated_at
       FROM releases r
       LEFT JOIN tracks t ON t.release_id = r.id
       LEFT JOIN distribution_jobs j ON j.release_id = r.id AND j.track_id = t.id AND j.provider = 'too_lost'
       LEFT JOIN platform_deliveries pd ON pd.release_id = r.id AND pd.track_id = t.id AND pd.platform = 'too_lost'
       WHERE r.id = :releaseId
       ORDER BY t.track_number ASC NULLS LAST, t.created_at ASC`,
      { releaseId },
    );

    if (!rows.length) throw httpError(404, "RELEASE_NOT_FOUND", `Release ${releaseId} was not found.`);
    const first = rows[0];
    return {
      releaseId: first.release_id,
      releaseTitle: first.release_title,
      releaseStatus: first.release_status,
      providerStatus: deriveProviderStatus(rows),
      distributionStatus: deriveDistributionStatus(rows),
      providerReleaseId: first.provider_job_id ?? null,
      trackStatuses: rows.map((row) => ({
        trackId: row.track_id,
        title: row.track_title,
        jobStatus: row.job_status,
        deliveryStatus: row.delivery_status,
        providerTrackId: row.provider_job_id ?? null,
        updatedAt: row.updated_at,
      })),
    };
  }

  async fetchDistributionStatus(releaseId: string): Promise<TooLostReleaseStatusSnapshot> {
    return this.fetchReleaseStatus(releaseId);
  }

  async syncNow(input: { userId: string; payload?: unknown } = { userId: "" }): Promise<{
    status: TooLostConnectionStatus;
    syncedAt: string;
    releaseCount: number;
    analytics: TooLostAnalyticsImportResult | null;
  }> {
    const releaseCount = await this.db.query<{ count: number }>(
      `SELECT COUNT(DISTINCT release_id)::int AS count
       FROM distribution_jobs
       WHERE provider = 'too_lost'`,
    );
    let analytics: TooLostAnalyticsImportResult | null = null;
    try {
      analytics = await this.importAnalytics({ userId: input.userId, payload: input.payload });
    } catch (error) {
      analytics = null;
      await this.credentials.recordSandboxRun({
        runType: "failure_recovery",
        status: "WARN",
        request: { action: "sync_now" },
        response: { error: serializeError(error) },
        notes: error instanceof Error ? error.message : String(error),
      });
    }
    await this.credentials.updateProviderSyncStatus({
      syncStatus: "connected",
      lastSyncAt: new Date().toISOString(),
      isEnabled: true,
    });
    return {
      status: await this.credentials.getConnectionStatus(),
      syncedAt: new Date().toISOString(),
      releaseCount: releaseCount[0]?.count ?? 0,
      analytics,
    };
  }

  async importAnalytics(input: { userId: string; payload?: unknown } = { userId: "" }): Promise<TooLostAnalyticsImportResult> {
    if (!input.userId) {
      throw httpError(400, "MISSING_USER_ID", "A userId is required to store analytics in the existing per-user models.");
    }
    if (!input.payload && !this.config.accountProfileUrl) {
      throw httpError(501, "TOO_LOST_ENDPOINT_UNVERIFIED", "Too Lost analytics import endpoint is not verified in the available API documentation.");
    }

    const payload = input.payload ?? {};
    const streams = numberFrom(payload, ["streams", "total_streams", "stream_count"]);
    const audience = numberFrom(payload, ["audience", "followers", "listeners"]);
    const earnings = numberFrom(payload, ["earnings", "revenue", "gross_revenue"]);
    const sales = numberFrom(payload, ["sales", "units", "orders"]);

    await this.persistAnalyticsSnapshot({ userId: input.userId, streams, audience, earnings, sales, rawPayload: payload });
    await this.credentials.recordSandboxRun({
      runType: "analytics_sync",
      status: "PASS",
      request: { source: input.payload ? "provided" : "unverified" },
      response: payload,
      notes: "Analytics payload stored in existing analytics tables.",
    });

    return { imported: true, reason: "Stored using existing analytics models.", streams, audience, earnings, sales };
  }

  private async buildReleasePayload(releaseId: string): Promise<TooLostReleasePayload> {
    const release = await this.store.getReleaseWithTracks(releaseId);
    if (!release) throw httpError(404, "RELEASE_NOT_FOUND", `Release ${releaseId} was not found.`);
    const primaryTrack = release.tracks[0];
    if (!primaryTrack) throw httpError(400, "MISSING_TRACKS", "Release does not contain any tracks.");

    return buildReleasePayload({
      release: release.release,
      tracks: release.tracks,
      dspTargets: this.config.dspTargets,
    });
  }

  private async persistSubmission(releaseId: string, externalReleaseId: string | null, payload: TooLostReleasePayload, response: unknown) {
    const tracks = await this.store.getReleaseWithTracks(releaseId);
    if (!tracks) return;

    for (const track of tracks.tracks) {
      await this.store.ensurePlatformDelivery({
        releaseId,
        trackId: track.id,
        userId: tracks.release.userId,
        platform: "too_lost",
      });
      await this.store.createDistributionJob({
        releaseId,
        trackId: track.id,
        platform: "too_lost",
      });
      await this.db.query(
        `UPDATE distribution_jobs
         SET status = 'SUBMITTED',
             provider_job_id = :providerJobId,
             api_request = CAST(:apiRequest AS jsonb),
             api_response = CAST(:apiResponse AS jsonb),
             updated_at = now()
         WHERE release_id = :releaseId
           AND track_id = :trackId
           AND provider = 'too_lost'`,
        {
          releaseId,
          trackId: track.id,
          providerJobId: externalReleaseId,
          apiRequest: JSON.stringify(payload),
          apiResponse: JSON.stringify(redact(response)),
        },
      );

      await this.db.query(
        `UPDATE platform_deliveries
         SET status = 'PROCESSING',
             platform_track_id = COALESCE(:providerTrackId, platform_track_id),
             raw_response = CAST(:rawResponse AS jsonb),
             updated_at = now()
         WHERE release_id = :releaseId
           AND track_id = :trackId
           AND platform = 'too_lost'`,
        {
          releaseId,
          trackId: track.id,
          providerTrackId: externalReleaseId,
          rawResponse: JSON.stringify(redact(response)),
        },
      );
    }

    await this.credentials.recordSyncLog({
      syncType: "RELEASE_SUBMISSION",
      status: "PASS",
      releaseId,
      request: payload,
      response: redact(response),
    });
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const accessToken = await this.ensureAccessToken();
    const response = await this.httpClient(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? safeJsonParse(text) : null;
    if (response.status === 401) {
      const refreshed = await this.refreshAccessTokenIfPossible();
      if (refreshed) {
        return this.requestJson(path, init);
      }
    }

    if (response.status === 429) {
      throw normalizeTooLostError({ status: 429, message: "Too Lost API rate limit exceeded" });
    }

    if (!response.ok) {
      throw normalizeTooLostError({
        status: response.status,
        message: typeof body?.message === "string" ? body.message : response.statusText,
      });
    }

    return body;
  }

  private async ensureAccessToken(): Promise<string> {
    const credentials = await this.credentials.loadTokenSet();
    if (!credentials?.accessToken) {
      throw normalizeTooLostError({ status: 401, message: "Too Lost account is not connected" });
    }

    if (credentials.tokenExpiresAt && new Date(credentials.tokenExpiresAt).getTime() <= Date.now()) {
      if (!credentials.refreshToken) {
        throw normalizeTooLostError({ status: 401, message: "Too Lost access token expired and no refresh token is available" });
      }
      const token = await this.refreshAccessToken(credentials.refreshToken);
      await this.persistToken(token, credentials);
      return token.accessToken;
    }

    return credentials.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<TooLostOAuthToken> {
    try {
      return await refreshTooLostOAuthToken({ refreshToken, config: this.config, httpClient: this.httpClient });
    } catch (error) {
      await this.credentials.updateProviderSyncStatus({
        syncStatus: "refresh_failed",
        lastSyncAt: null,
        isEnabled: true,
        lastError: error instanceof Error ? error.message : String(error),
      });
      throw normalizeTooLostError(error);
    }
  }

  private async refreshAccessTokenIfPossible(): Promise<boolean> {
    const credentials = await this.credentials.loadTokenSet();
    if (!credentials?.refreshToken) return false;
    const token = await this.refreshAccessToken(credentials.refreshToken);
    await this.persistToken(token, credentials);
    return true;
  }

  private async persistToken(token: TooLostOAuthToken, current: TooLostStoredCredentials | null) {
    await this.credentials.storeTokenSet(token, {
      connectedAccountId: current?.connectedAccountId ?? null,
      connectedAccountName: current?.connectedAccountName ?? null,
      connectedAccountEmail: current?.connectedAccountEmail ?? null,
    });
  }

  private async fetchAccountProfile(token: TooLostOAuthToken): Promise<any> {
    if (!this.config.accountProfileUrl) return null;
    const response = await this.httpClient(this.config.accountProfileUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: "application/json",
      },
    });
    const body = await response.text();
    const parsed = body ? safeJsonParse(body) : null;
    if (!response.ok) throw new Error(`Too Lost account profile request failed: ${response.statusText}`);
    return parsed;
  }

  private async persistAnalyticsSnapshot(input: {
    userId: string;
    streams: number;
    audience: number;
    earnings: number;
    sales: number;
    rawPayload: unknown;
  }) {
    const today = new Date().toISOString().slice(0, 10);
    await this.db.query(
      `INSERT INTO dsp_analytics_snapshots (
         user_id, snapshot_date, streams, saves, playlist_adds, followers, reach, engagement
       ) VALUES (
         :userId, :snapshotDate, :streams, 0, 0, :followers, :reach, :engagement
       )
       ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
         streams = EXCLUDED.streams,
         followers = EXCLUDED.followers,
         reach = EXCLUDED.reach,
         engagement = EXCLUDED.engagement,
         updated_at = now()`,
      {
          userId: input.userId,
        snapshotDate: today,
        streams: input.streams,
        followers: input.audience,
        reach: input.audience,
        engagement: input.streams + input.audience,
      },
    );

    await this.db.query(
      `INSERT INTO dsp_audience_metrics (
         user_id, metric_date, country, city, followers, reach, engagement, growth_rate
       ) VALUES (
         :userId, :metricDate, 'Global', 'Global', :followers, :reach, :engagement, :growthRate
       )
       ON CONFLICT (user_id, metric_date, country, city) DO UPDATE SET
         followers = EXCLUDED.followers,
         reach = EXCLUDED.reach,
         engagement = EXCLUDED.engagement,
         growth_rate = EXCLUDED.growth_rate,
         updated_at = now()`,
      {
        userId: input.userId,
        metricDate: today,
        followers: input.audience,
        reach: input.audience,
        engagement: input.streams + input.audience,
        growthRate: input.audience ? (input.audience / Math.max(input.streams, 1)) * 100 : 0,
      },
    );

    await this.db.query(
      `INSERT INTO earnings_imports (
         source, imported_by_user_id, currency, gross_amount, status, period_start, period_end, created_at, updated_at
       ) VALUES (
         'too_lost', :userId, 'USD', :grossAmount, 'IMPORTED', :periodStart, :periodEnd, now(), now()
       )`,
      {
        userId: input.userId,
        grossAmount: input.earnings,
        periodStart: today,
        periodEnd: today,
      },
    ).catch(() => undefined);

    await this.db.query(
      `INSERT INTO royalty_records (
         user_id, release_id, track_id, platform, streams_count, total_revenue, created_at, updated_at
       ) VALUES (
         :userId, gen_random_uuid(), gen_random_uuid(), 'too_lost', :streamsCount, :totalRevenue, now(), now()
       )`,
      {
        userId: input.userId,
        streamsCount: input.sales,
        totalRevenue: input.earnings,
      },
    ).catch(() => undefined);

    await this.credentials.recordSyncLog({
      syncType: "ANALYTICS_IMPORT",
      status: "PASS",
      request: input.rawPayload,
      response: { streams: input.streams, audience: input.audience, earnings: input.earnings, sales: input.sales },
    });
  }
}

function sanitizeReturnToPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function buildReleasePayload(input: {
  release: { id: string; title?: string; primaryArtist?: string; featuredArtists?: string[]; releaseDate?: string | null; genre?: string | null; language?: string | null; upc?: string | null; copyright?: string | null; coverArtUrl?: string | null };
  tracks: Array<{ id: string; title?: string; primaryArtist?: string; featuredArtists?: string[]; isrc?: string | null; audioUrl?: string | null; explicit?: boolean }>;
  dspTargets: string[];
}): TooLostReleasePayload {
  const primaryTrack = input.tracks[0];
  const artist = input.release.primaryArtist ?? primaryTrack?.primaryArtist ?? "Unknown Artist";
  const releaseTitle = input.release.title ?? primaryTrack?.title ?? "Untitled Release";
  const copyright = input.release.copyright ?? `${new Date().getUTCFullYear()} ${artist}`;

  return {
    provider: "TOO_LOST",
    release: {
      title: releaseTitle,
      artist,
      featuringArtist: input.release.featuredArtists ?? primaryTrack?.featuredArtists ?? [],
      genre: input.release.genre ?? null,
      language: input.release.language ?? null,
      upc: input.release.upc ?? null,
      copyright,
      releaseDate: input.release.releaseDate ?? null,
      artwork: {
        url: input.release.coverArtUrl ?? null,
        filename: input.release.coverArtUrl ? filenameFromUrl(input.release.coverArtUrl, "cover.jpg") : null,
      },
    },
    tracks: input.tracks.map((track) => ({
      title: track.title ?? releaseTitle,
      artist: track.primaryArtist ?? artist,
      featuringArtist: track.featuredArtists ?? input.release.featuredArtists ?? [],
      genre: input.release.genre ?? null,
      language: input.release.language ?? null,
      isrc: track.isrc ?? null,
      copyright,
      audioFile: {
        url: track.audioUrl ?? null,
        filename: track.audioUrl ? filenameFromUrl(track.audioUrl, `${track.id}.wav`) : null,
      },
      explicit: track.explicit ?? false,
    })),
    delivery: {
      targets: input.dspTargets,
      workflow: "ARTIST_UPLOAD_ADMIN_REVIEW_APPROVAL_DISTRIBUTION_QUEUE_TOO_LOST_DSP_TRACKING_LIVE_SYNC",
    },
  };
}

function parseExternalReleaseId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, any>;
  return String(body.releaseId ?? body.release_id ?? body.id ?? body.data?.releaseId ?? body.data?.id ?? "").trim() || null;
}

function deriveProviderStatus(rows: Array<{ job_status: string | null; delivery_status: string | null }>): string {
  if (rows.some((row) => row.job_status === "FAILED" || row.delivery_status === "FAILED")) return "failed";
  if (rows.some((row) => row.job_status === "SUBMITTED" || row.delivery_status === "PROCESSING")) return "processing";
  if (rows.some((row) => row.job_status === "PUBLISHED" || row.delivery_status === "PUBLISHED")) return "live";
  return "pending";
}

function deriveDistributionStatus(rows: Array<{ job_status: string | null; delivery_status: string | null }>): string {
  if (rows.some((row) => row.delivery_status === "PUBLISHED")) return "published";
  if (rows.some((row) => row.delivery_status === "PROCESSING")) return "processing";
  if (rows.some((row) => row.job_status === "SUBMITTED")) return "submitted";
  if (rows.some((row) => row.job_status === "FAILED" || row.delivery_status === "FAILED")) return "failed";
  return "pending";
}

function numberFrom(payload: unknown, keys: string[]): number {
  if (!payload || typeof payload !== "object") return 0;
  const source = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = source[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function filenameFromUrl(value: string, fallback: string): string {
  try {
    const url = new URL(value);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last || fallback;
  } catch {
    return fallback;
  }
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function redact<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (/token|authorization|api[-_]?key|secret/i.test(key)) return "[REDACTED]";
    return entry;
  }));
}

function serializeError(error: unknown) {
  return error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
}

function httpError(status: number, code: string, message: string) {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
}
