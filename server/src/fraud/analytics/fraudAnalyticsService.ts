import type { SqlExecutor } from "../../royalties/services/royaltyStore";

export type FraudAnalyticsSnapshot = {
  fraud_rate_per_platform: Array<{ platform: string; fraud_rate: number; total_events: number; flagged_events: number }>;
  fraud_rate_per_artist: Array<{ user_id: string; fraud_rate: number; total_events: number; flagged_events: number }>;
  flagged_tracks: Array<{ track_id: string; max_score: number; flagged_events: number }>;
  blocked_stream_counts: Array<{ platform: string; blocked_streams: number }>;
  suspicious_geographic_clusters: Array<{ listener_country: string; platform: string; suspicious_events: number }>;
};

export class FraudAnalyticsService {
  constructor(private db: SqlExecutor) {}

  async getSnapshot(limit = 25): Promise<FraudAnalyticsSnapshot> {
    const [
      fraud_rate_per_platform,
      fraud_rate_per_artist,
      flagged_tracks,
      blocked_stream_counts,
      suspicious_geographic_clusters,
    ] = await Promise.all([
      this.db.query<{ platform: string; fraud_rate: number; total_events: number; flagged_events: number }>(
        `SELECT
           platform,
           (COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED'))::float / NULLIF(COUNT(*), 0)) AS fraud_rate,
           COUNT(*)::int AS total_events,
           COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED'))::int AS flagged_events
         FROM fraud_events
         GROUP BY platform
         ORDER BY fraud_rate DESC`,
      ),
      this.db.query<{ user_id: string; fraud_rate: number; total_events: number; flagged_events: number }>(
        `SELECT
           user_id::text,
           (COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED'))::float / NULLIF(COUNT(*), 0)) AS fraud_rate,
           COUNT(*)::int AS total_events,
           COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED'))::int AS flagged_events
         FROM fraud_events
         WHERE user_id IS NOT NULL
         GROUP BY user_id
         ORDER BY fraud_rate DESC, flagged_events DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ track_id: string; max_score: number; flagged_events: number }>(
        `SELECT
           track_id::text,
           MAX(fraud_score)::int AS max_score,
           COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED'))::int AS flagged_events
         FROM fraud_events
         GROUP BY track_id
         HAVING COUNT(*) FILTER (WHERE decision IN ('SUSPICIOUS', 'BLOCKED')) > 0
         ORDER BY max_score DESC, flagged_events DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ platform: string; blocked_streams: number }>(
        `SELECT
           platform,
           COALESCE(SUM((raw_event->>'stream_count_increment')::int), 0)::int AS blocked_streams
         FROM fraud_events
         WHERE decision = 'BLOCKED'
         GROUP BY platform
         ORDER BY blocked_streams DESC`,
      ),
      this.db.query<{ listener_country: string; platform: string; suspicious_events: number }>(
        `SELECT
           COALESCE(raw_event->>'listener_country', 'UNKNOWN') AS listener_country,
           platform,
           COUNT(*)::int AS suspicious_events
         FROM fraud_events
         WHERE decision IN ('SUSPICIOUS', 'BLOCKED')
         GROUP BY COALESCE(raw_event->>'listener_country', 'UNKNOWN'), platform
         ORDER BY suspicious_events DESC
         LIMIT :limit`,
        { limit },
      ),
    ]);

    return {
      fraud_rate_per_platform,
      fraud_rate_per_artist,
      flagged_tracks,
      blocked_stream_counts,
      suspicious_geographic_clusters,
    };
  }

  async persistSnapshot(): Promise<FraudAnalyticsSnapshot> {
    const snapshot = await this.getSnapshot();
    await this.db.query(
      `INSERT INTO fraud_analytics_snapshots (
         fraud_rate_per_platform, fraud_rate_per_artist, flagged_tracks,
         blocked_stream_counts, suspicious_geographic_clusters
       ) VALUES (
         CAST(:fraudRatePerPlatform AS jsonb), CAST(:fraudRatePerArtist AS jsonb),
         CAST(:flaggedTracks AS jsonb), CAST(:blockedStreamCounts AS jsonb),
         CAST(:suspiciousGeographicClusters AS jsonb)
       )`,
      {
        fraudRatePerPlatform: JSON.stringify(snapshot.fraud_rate_per_platform),
        fraudRatePerArtist: JSON.stringify(snapshot.fraud_rate_per_artist),
        flaggedTracks: JSON.stringify(snapshot.flagged_tracks),
        blockedStreamCounts: JSON.stringify(snapshot.blocked_stream_counts),
        suspiciousGeographicClusters: JSON.stringify(snapshot.suspicious_geographic_clusters),
      },
    );
    return snapshot;
  }
}
