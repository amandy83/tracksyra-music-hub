import type {
  PlatformStreamCount,
  RoyaltyPlatform,
  RoyaltyRecord,
  RoyaltySplit,
  TrackRoyaltyContext,
} from "../models/royaltyTypes";
import { splitFeaturedArtists } from "../../domain/music";

export type SqlExecutor = {
  query<T = unknown>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
};

export type PersistRoyaltyRecordInput = {
  track_id: string;
  release_id: string;
  platform: RoyaltyPlatform;
  streams_count: number;
  revenue_per_stream: string;
  total_revenue: string;
  artist_id: string;
  calculation_key: string;
  metadata?: Record<string, unknown>;
};

export class RoyaltyStore {
  constructor(private db: SqlExecutor) {}

  async getTrackContext(trackId: string): Promise<TrackRoyaltyContext | null> {
    const rows = await this.db.query<TrackRoyaltyContext & {
      featured_artists: string | null;
    }>(
      `SELECT t.id AS track_id,
              t.release_id,
              COALESCE(t.artist_id, t.user_id) AS artist_id,
              t.featured_artists,
              r.genre,
              r.language
       FROM tracks t
       JOIN releases r ON r.id = t.release_id
       WHERE t.id = :trackId
       LIMIT 1`,
      { trackId },
    );
    const row = rows[0];
    if (!row) return null;
    return {
      track_id: row.track_id,
      release_id: row.release_id,
      artist_id: row.artist_id,
      featured_artists: splitFeaturedArtists(row.featured_artists),
      genre: row.genre,
      language: row.language,
    };
  }

  async getStreamCountsByPlatform(input: {
    trackId: string;
    periodStart?: string | null;
    periodEnd?: string | null;
  }): Promise<PlatformStreamCount[]> {
    return this.db.query<PlatformStreamCount>(
      `SELECT platform, COALESCE(SUM(streams), 0)::int AS streams_count
       FROM song_analytics
       WHERE song_id = :trackId
         AND (:periodStart IS NULL OR date >= CAST(:periodStart AS date))
         AND (:periodEnd IS NULL OR date <= CAST(:periodEnd AS date))
       GROUP BY platform`,
      {
        trackId: input.trackId,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
      },
    );
  }

  async upsertRoyaltyRecord(input: PersistRoyaltyRecordInput): Promise<RoyaltyRecord> {
    const rows = await this.db.query<RoyaltyRecord>(
      `INSERT INTO royalty_records (
         track_id, release_id, platform, streams_count, revenue_per_stream,
         total_revenue, artist_id, calculation_key, metadata
       ) VALUES (
         :track_id, :release_id, :platform, :streams_count, :revenue_per_stream,
         :total_revenue, :artist_id, :calculation_key, CAST(:metadata AS jsonb)
       )
       ON CONFLICT (calculation_key) DO UPDATE SET
         streams_count = EXCLUDED.streams_count,
         revenue_per_stream = EXCLUDED.revenue_per_stream,
         total_revenue = EXCLUDED.total_revenue,
         metadata = EXCLUDED.metadata
       RETURNING id, track_id, release_id, platform, streams_count, revenue_per_stream,
         total_revenue, artist_id, calculation_key, metadata, created_at`,
      {
        ...input,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    );
    return rows[0];
  }

  async getSplits(trackId: string): Promise<RoyaltySplit[]> {
    return this.db.query<RoyaltySplit>(
      `SELECT track_id, user_id, percentage_share
       FROM royalty_splits
       WHERE track_id = :trackId
       ORDER BY user_id`,
      { trackId },
    );
  }
}
