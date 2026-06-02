import type { SqlExecutor } from "../../royalties/services/royaltyStore";
import type { RoyaltyPlatform } from "../../royalties/models/royaltyTypes";

export type StreamAnalyticsSnapshot = {
  total_streams_per_track: Array<{ track_id: string; streams_count: number }>;
  streams_per_platform: Array<{ platform: RoyaltyPlatform; streams_count: number }>;
  geographic_distribution: Array<{ listener_country: string; streams_count: number }>;
  daily_trends: Array<{ stat_date: string; streams_count: number }>;
  weekly_trends: Array<{ week_start: string; streams_count: number }>;
  monthly_trends: Array<{ month_start: string; streams_count: number }>;
  top_trending_tracks: Array<{ track_id: string; recent_streams: number; previous_streams: number; velocity: number }>;
};

export class StreamAnalyticsService {
  constructor(private db: SqlExecutor) {}

  async getSnapshot(limit = 25): Promise<StreamAnalyticsSnapshot> {
    const [
      total_streams_per_track,
      streams_per_platform,
      geographic_distribution,
      daily_trends,
      weekly_trends,
      monthly_trends,
      top_trending_tracks,
    ] = await Promise.all([
      this.db.query<{ track_id: string; streams_count: number }>(
        `SELECT track_id, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         GROUP BY track_id
         ORDER BY SUM(streams_count) DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ platform: RoyaltyPlatform; streams_count: number }>(
        `SELECT platform, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         GROUP BY platform
         ORDER BY SUM(streams_count) DESC`,
      ),
      this.db.query<{ listener_country: string; streams_count: number }>(
        `SELECT listener_country, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         GROUP BY listener_country
         ORDER BY SUM(streams_count) DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ stat_date: string; streams_count: number }>(
        `SELECT stat_date::text AS stat_date, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         WHERE stat_date >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY stat_date
         ORDER BY stat_date`,
      ),
      this.db.query<{ week_start: string; streams_count: number }>(
        `SELECT date_trunc('week', stat_date)::date::text AS week_start, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         WHERE stat_date >= CURRENT_DATE - INTERVAL '12 weeks'
         GROUP BY date_trunc('week', stat_date)::date
         ORDER BY week_start`,
      ),
      this.db.query<{ month_start: string; streams_count: number }>(
        `SELECT date_trunc('month', stat_date)::date::text AS month_start, SUM(streams_count)::int AS streams_count
         FROM streaming_stats
         WHERE stat_date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY date_trunc('month', stat_date)::date
         ORDER BY month_start`,
      ),
      this.db.query<{ track_id: string; recent_streams: number; previous_streams: number; velocity: number }>(
        `WITH windows AS (
           SELECT
             track_id,
             SUM(streams_count) FILTER (WHERE stat_date >= CURRENT_DATE - INTERVAL '1 day')::int AS recent_streams,
             SUM(streams_count) FILTER (
               WHERE stat_date < CURRENT_DATE - INTERVAL '1 day'
                 AND stat_date >= CURRENT_DATE - INTERVAL '2 days'
             )::int AS previous_streams
           FROM streaming_stats
           WHERE stat_date >= CURRENT_DATE - INTERVAL '2 days'
           GROUP BY track_id
         )
         SELECT
           track_id,
           COALESCE(recent_streams, 0) AS recent_streams,
           COALESCE(previous_streams, 0) AS previous_streams,
           (COALESCE(recent_streams, 0) - COALESCE(previous_streams, 0))::float AS velocity
         FROM windows
         ORDER BY velocity DESC, recent_streams DESC
         LIMIT :limit`,
        { limit },
      ),
    ]);

    return {
      total_streams_per_track,
      streams_per_platform,
      geographic_distribution,
      daily_trends,
      weekly_trends,
      monthly_trends,
      top_trending_tracks,
    };
  }

  async persistSnapshot(): Promise<StreamAnalyticsSnapshot> {
    const snapshot = await this.getSnapshot();
    await this.db.query(
      `INSERT INTO stream_analytics_snapshots (
         total_streams_per_track, streams_per_platform, geographic_distribution,
         daily_trends, weekly_trends, monthly_trends, top_trending_tracks
       ) VALUES (
         CAST(:totalStreamsPerTrack AS jsonb), CAST(:streamsPerPlatform AS jsonb),
         CAST(:geographicDistribution AS jsonb), CAST(:dailyTrends AS jsonb),
         CAST(:weeklyTrends AS jsonb), CAST(:monthlyTrends AS jsonb),
         CAST(:topTrendingTracks AS jsonb)
       )`,
      {
        totalStreamsPerTrack: JSON.stringify(snapshot.total_streams_per_track),
        streamsPerPlatform: JSON.stringify(snapshot.streams_per_platform),
        geographicDistribution: JSON.stringify(snapshot.geographic_distribution),
        dailyTrends: JSON.stringify(snapshot.daily_trends),
        weeklyTrends: JSON.stringify(snapshot.weekly_trends),
        monthlyTrends: JSON.stringify(snapshot.monthly_trends),
        topTrendingTracks: JSON.stringify(snapshot.top_trending_tracks),
      },
    );
    return snapshot;
  }
}
