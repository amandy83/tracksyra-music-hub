import type {
  DistributionJob,
  DistributionJobStatus,
  NormalizedDistributionError,
  DistributionPlatformName,
  DistributionRelease,
  DistributionTrack,
} from "../models/distributionTypes";
import { mapReleaseAndTracksToMusicRelease, mapMusicReleaseToDistribution } from "../../domain/music";

export type DistributionStore = {
  getReleaseWithTracks(releaseId: string): Promise<{ release: DistributionRelease; tracks: DistributionTrack[] } | null>;
  getTrackWithRelease(trackId: string): Promise<{ release: DistributionRelease; track: DistributionTrack } | null>;
  getJobPayload(job: DistributionJob): Promise<{ release: DistributionRelease; track: DistributionTrack } | null>;
  ensurePlatformDelivery(input: {
    releaseId: string;
    trackId: string;
    userId: string;
    platform: DistributionPlatformName;
  }): Promise<void>;
  createDistributionJob(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<DistributionJob | null>;
  getPendingJobs(limit: number): Promise<DistributionJob[]>;
  updateJobStatus(jobId: string, status: DistributionJobStatus): Promise<void>;
  updateDeliveryStatus(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
    status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  }): Promise<void>;
  recordDeliveryResult(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
    status: "PUBLISHED" | "FAILED";
    platformTrackId?: string | null;
    rawResponse?: unknown;
    error?: NormalizedDistributionError | null;
  }): Promise<void>;
  isWebhookConfirmed(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<boolean>;
};

export type SqlExecutor = {
  query<T = unknown>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
};

export class SqlDistributionStore implements DistributionStore {
  constructor(private db: SqlExecutor) {}

  async getReleaseWithTracks(releaseId: string): Promise<{ release: DistributionRelease; tracks: DistributionTrack[] } | null> {
    const releases = await this.db.query<{
      id: string;
      user_id: string;
      title: string;
      primary_artist: string;
      release_date: string | null;
      genre: string | null;
      language: string | null;
      upc: string | null;
      copyright_owner: string | null;
      cover_art_url: string | null;
      release_type: string | null;
      status: string | null;
      created_at: string | null;
    }>(
      `SELECT id, COALESCE(artist_id, user_id) AS user_id, title, primary_artist, release_type, release_date, genre, language, upc, copyright_owner, cover_art_url, status, created_at
       FROM releases
       WHERE id = :releaseId
       LIMIT 1`,
      { releaseId },
    );
    const releaseRow = releases[0];
    if (!releaseRow) return null;

    const trackRows = await this.db.query<{
      id: string;
      release_id: string;
      user_id: string;
      title: string;
      primary_artist: string | null;
      featured_artists: string | null;
      audio_url: string | null;
      isrc: string | null;
      explicit: boolean | null;
      duration_sec: string | number | null;
      file_size_bytes: string | number | null;
      audio_format: string | null;
      track_number: number | null;
    }>(
      `SELECT id, release_id, COALESCE(artist_id, user_id) AS user_id, title, primary_artist, featured_artists, audio_url, isrc,
         explicit, duration_sec, file_size_bytes, audio_format, track_number
       FROM tracks WHERE release_id = :releaseId ORDER BY track_number, created_at`,
      { releaseId },
    );
    const musicRelease = mapReleaseAndTracksToMusicRelease({ release: releaseRow, tracks: trackRows });

    return {
      release: mapMusicReleaseToDistribution({ release: musicRelease, trackId: musicRelease.audioFiles[0].trackId }).release,
      tracks: musicRelease.audioFiles.map((audio) => mapMusicReleaseToDistribution({ release: musicRelease, trackId: audio.trackId }).track),
    };
  }

  async getTrackWithRelease(trackId: string): Promise<{ release: DistributionRelease; track: DistributionTrack } | null> {
    const rows = await this.db.query<{
      release_id: string;
      release_user_id: string;
      track_id: string;
      track_user_id: string;
    }>(
      `SELECT r.id AS release_id, COALESCE(r.artist_id, r.user_id) AS release_user_id,
              t.id AS track_id, COALESCE(t.artist_id, t.user_id) AS track_user_id
       FROM tracks t
       JOIN releases r ON r.id = t.release_id
       WHERE t.id = :trackId
       LIMIT 1`,
      { trackId },
    );
    const row = rows[0];
    if (!row) return null;

    return {
      release: { id: row.release_id, userId: row.release_user_id },
      track: { id: row.track_id, releaseId: row.release_id, userId: row.track_user_id },
    };
  }

  async getJobPayload(job: DistributionJob): Promise<{ release: DistributionRelease; track: DistributionTrack } | null> {
    if (!job.releaseId || !job.trackId) return null;

    const rows = await this.db.query<{
      release_id: string;
      release_user_id: string;
      release_title: string;
      release_primary_artist: string;
      release_date: string | null;
      genre: string | null;
      language: string | null;
      upc: string | null;
      copyright_owner: string | null;
      cover_art_url: string | null;
      release_type: string | null;
      release_status: string | null;
      release_created_at: string | null;
      track_id: string;
      track_user_id: string;
      track_title: string;
      track_primary_artist: string;
      featured_artists: string | null;
      audio_url: string | null;
      isrc: string | null;
      explicit: boolean;
      duration_sec: string | number | null;
      file_size_bytes: string | number | null;
      audio_format: string | null;
      track_number: number | null;
    }>(
      `SELECT
         r.id AS release_id,
         COALESCE(r.artist_id, r.user_id) AS release_user_id,
         r.title AS release_title,
         r.primary_artist AS release_primary_artist,
         r.release_type,
         r.status AS release_status,
         r.created_at AS release_created_at,
         r.release_date,
         r.genre,
         r.language,
         r.upc,
         r.copyright_owner,
         r.cover_art_url,
         t.id AS track_id,
         COALESCE(t.artist_id, t.user_id) AS track_user_id,
         t.title AS track_title,
         t.primary_artist AS track_primary_artist,
         t.featured_artists,
         t.audio_url,
         t.isrc,
         t.explicit,
         t.duration_sec,
         t.file_size_bytes,
         t.audio_format,
         t.track_number
       FROM distribution_jobs j
       JOIN releases r ON r.id = j.release_id
       JOIN tracks t ON t.id = j.track_id
       WHERE j.id = :jobId
       LIMIT 1`,
      { jobId: job.id },
    );

    const row = rows[0];
    if (!row) return null;

    const musicRelease = mapReleaseAndTracksToMusicRelease({
      release: {
        id: row.release_id,
        user_id: row.release_user_id,
        title: row.release_title,
        primary_artist: row.release_primary_artist,
        release_type: row.release_type,
        release_date: row.release_date,
        genre: row.genre,
        language: row.language,
        upc: row.upc,
        copyright_owner: row.copyright_owner,
        cover_art_url: row.cover_art_url,
        status: row.release_status,
        created_at: row.release_created_at,
      },
      tracks: [{
        id: row.track_id,
        release_id: row.release_id,
        user_id: row.track_user_id,
        title: row.track_title,
        primary_artist: row.track_primary_artist,
        featured_artists: row.featured_artists,
        audio_url: row.audio_url,
        isrc: row.isrc,
        explicit: row.explicit,
        duration_sec: row.duration_sec,
        file_size_bytes: row.file_size_bytes,
        audio_format: row.audio_format,
        track_number: row.track_number,
      }],
    });
    return mapMusicReleaseToDistribution({ release: musicRelease, trackId: row.track_id });
  }

  async ensurePlatformDelivery(input: {
    releaseId: string;
    trackId: string;
    userId: string;
    platform: DistributionPlatformName;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO platform_deliveries (release_id, track_id, user_id, platform, status)
       VALUES (:releaseId, :trackId, :userId, :platform, 'PENDING')
       ON CONFLICT (track_id, platform) WHERE track_id IS NOT NULL DO NOTHING`,
      input,
    );
  }

  async createDistributionJob(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<DistributionJob | null> {
    const rows = await this.db.query<{
      id: string;
      release_id: string;
      track_id: string;
      platform: DistributionPlatformName;
      status: DistributionJobStatus;
      created_at: string;
      attempts: number;
      next_retry_at: string | null;
    }>(
      `INSERT INTO distribution_jobs (release_id, track_id, platform, status)
       VALUES (:releaseId, :trackId, :platform, 'PENDING')
       ON CONFLICT (track_id, platform) DO NOTHING
       RETURNING id, release_id, track_id, platform, status, created_at, attempts, next_retry_at`,
      input,
    );
    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      releaseId: row.release_id,
      trackId: row.track_id,
      platform: row.platform,
      status: row.status,
      createdAt: new Date(row.created_at),
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    };
  }

  async getPendingJobs(limit: number): Promise<DistributionJob[]> {
    const rows = await this.db.query<{
      id: string;
      release_id: string;
      track_id: string;
      platform: DistributionPlatformName;
      status: DistributionJobStatus;
      created_at: string;
      attempts: number;
      next_retry_at: string | null;
    }>(
      `SELECT id, release_id, track_id, platform, status, created_at, attempts, next_retry_at
       FROM distribution_jobs
       WHERE status = 'PENDING'
         AND (next_retry_at IS NULL OR next_retry_at <= now())
       ORDER BY created_at
       LIMIT :limit`,
      { limit },
    );

    return rows.map((row) => ({
      id: row.id,
      releaseId: row.release_id,
      trackId: row.track_id,
      platform: row.platform,
      status: row.status,
      createdAt: new Date(row.created_at),
      attempts: row.attempts,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    }));
  }

  async updateJobStatus(jobId: string, status: DistributionJobStatus): Promise<void> {
    await this.db.query(
      `UPDATE distribution_jobs
       SET status = :status, updated_at = now(), processed_at = CASE WHEN :status IN ('PUBLISHED', 'FAILED') THEN now() ELSE processed_at END
       WHERE id = :jobId`,
      { jobId, status },
    );
  }

  async isWebhookConfirmed(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
  }): Promise<boolean> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM distribution_state_history
       WHERE release_id = :releaseId
         AND track_id = :trackId
         AND platform = :platform
         AND source = 'WEBHOOK'
         AND next_status IN ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DELIVERED', 'REJECTED')`,
      input,
    );
    return (rows[0]?.count ?? 0) > 0;
  }

  async updateDeliveryStatus(input: {
    releaseId: string;
    trackId: string;
    platform: DistributionPlatformName;
    status: "PENDING" | "PROCESSING" | "PUBLISHED" | "FAILED";
  }): Promise<void> {
    await this.db.query(
      `UPDATE platform_deliveries
       SET status = :status, updated_at = now(), delivered_at = CASE WHEN :status = 'PUBLISHED' THEN now() ELSE delivered_at END
       WHERE release_id = :releaseId AND track_id = :trackId AND platform = :platform`,
      input,
    );
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
    await this.db.query(
      `UPDATE platform_deliveries
       SET status = :status,
           platform_track_id = :platformTrackId,
           raw_response = CAST(:rawResponse AS jsonb),
           error_code = :errorCode,
           error_message = :errorMessage,
           retryable = :retryable,
           delivered_at = CASE WHEN :status = 'PUBLISHED' THEN now() ELSE delivered_at END,
           updated_at = now()
       WHERE release_id = :releaseId AND track_id = :trackId AND platform = :platform`,
      {
        releaseId: input.releaseId,
        trackId: input.trackId,
        platform: input.platform,
        status: input.status,
        platformTrackId: input.platformTrackId ?? null,
        rawResponse: JSON.stringify(input.rawResponse ?? null),
        errorCode: input.error?.errorCode ?? null,
        errorMessage: input.error?.message ?? null,
        retryable: input.error?.retryable ?? null,
      },
    );

    await this.db.query(
      `UPDATE distribution_jobs
       SET api_request = CAST(:apiRequest AS jsonb),
           api_response = CAST(:apiResponse AS jsonb),
           failure_reason = :failureReason,
           retry_count = CASE WHEN :status = 'FAILED' THEN retry_count + 1 ELSE retry_count END,
           updated_at = now()
       WHERE release_id = :releaseId AND track_id = :trackId AND platform = :platform`,
      {
        releaseId: input.releaseId,
        trackId: input.trackId,
        platform: input.platform,
        status: input.status,
        apiRequest: JSON.stringify(extractApiRequest(input.rawResponse)),
        apiResponse: JSON.stringify(extractApiResponse(input.rawResponse)),
        failureReason: input.error?.message ?? null,
      },
    );

    await this.db.query(
      `INSERT INTO distribution_sync_logs (
         provider, release_id, track_id, sync_type, status, api_request, api_response, failure_reason, retry_count
       ) VALUES (
         'too_lost', :releaseId, :trackId, 'DELIVERY_RESULT', :status,
         CAST(:apiRequest AS jsonb), CAST(:apiResponse AS jsonb), :failureReason,
         CASE WHEN :status = 'FAILED' THEN 1 ELSE 0 END
       )`,
      {
        releaseId: input.releaseId,
        trackId: input.trackId,
        status: input.status,
        apiRequest: JSON.stringify(extractApiRequest(input.rawResponse)),
        apiResponse: JSON.stringify(extractApiResponse(input.rawResponse)),
        failureReason: input.error?.message ?? null,
      },
    );
  }

  private mapRelease(row: {
    id: string;
    user_id: string;
    title?: string;
    primary_artist?: string;
    release_date?: string | null;
    genre?: string | null;
    language?: string | null;
    cover_art_url?: string | null;
    upc?: string | null;
    copyright_owner?: string | null;
  }): DistributionRelease {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      primaryArtist: row.primary_artist,
      releaseDate: row.release_date,
      genre: row.genre,
      language: row.language,
      upc: row.upc,
      copyright: row.copyright_owner,
      coverArtUrl: row.cover_art_url,
    };
  }
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
