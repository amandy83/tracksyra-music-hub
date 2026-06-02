import type { SqlExecutor } from "../../royalties/services/royaltyStore";
import type { RoyaltyPlatform } from "../../royalties/models/royaltyTypes";

export type RevenueAnalyticsSnapshot = {
  total_platform_revenue: Array<{ platform: RoyaltyPlatform; total_revenue: string; streams_count: number }>;
  revenue_per_artist: Array<{ artist_id: string; total_revenue: string }>;
  revenue_per_track: Array<{ track_id: string; total_revenue: string; streams_count: number }>;
  top_earning_releases: Array<{ release_id: string; total_revenue: string }>;
  payout_success_rate: number;
};

export class RevenueAnalyticsService {
  constructor(private db: SqlExecutor) {}

  async getSnapshot(limit = 10): Promise<RevenueAnalyticsSnapshot> {
    const [
      total_platform_revenue,
      revenue_per_artist,
      revenue_per_track,
      top_earning_releases,
      payoutStats,
    ] = await Promise.all([
      this.db.query<{ platform: RoyaltyPlatform; total_revenue: string; streams_count: number }>(
        `SELECT platform, SUM(total_revenue)::text AS total_revenue, SUM(streams_count)::int AS streams_count
         FROM royalty_records
         GROUP BY platform
         ORDER BY SUM(total_revenue) DESC`,
      ),
      this.db.query<{ artist_id: string; total_revenue: string }>(
        `SELECT artist_id, SUM(total_revenue)::text AS total_revenue
         FROM royalty_records
         GROUP BY artist_id
         ORDER BY SUM(total_revenue) DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ track_id: string; total_revenue: string; streams_count: number }>(
        `SELECT track_id, SUM(total_revenue)::text AS total_revenue, SUM(streams_count)::int AS streams_count
         FROM royalty_records
         GROUP BY track_id
         ORDER BY SUM(total_revenue) DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ release_id: string; total_revenue: string }>(
        `SELECT release_id, SUM(total_revenue)::text AS total_revenue
         FROM royalty_records
         GROUP BY release_id
         ORDER BY SUM(total_revenue) DESC
         LIMIT :limit`,
        { limit },
      ),
      this.db.query<{ completed_count: number; terminal_count: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE state = 'COMPLETED')::int AS completed_count,
           COUNT(*) FILTER (WHERE state IN ('COMPLETED', 'FAILED', 'REJECTED'))::int AS terminal_count
         FROM payout_requests`,
      ),
    ]);

    const stats = payoutStats[0] ?? { completed_count: 0, terminal_count: 0 };
    return {
      total_platform_revenue,
      revenue_per_artist,
      revenue_per_track,
      top_earning_releases,
      payout_success_rate: stats.terminal_count ? stats.completed_count / stats.terminal_count : 0,
    };
  }

  async persistSnapshot(): Promise<RevenueAnalyticsSnapshot> {
    const snapshot = await this.getSnapshot();
    await this.db.query(
      `INSERT INTO revenue_analytics_snapshots (
         total_platform_revenue, revenue_per_artist, revenue_per_track,
         top_earning_releases, payout_success_rate
       ) VALUES (
         CAST(:totalPlatformRevenue AS jsonb), CAST(:revenuePerArtist AS jsonb),
         CAST(:revenuePerTrack AS jsonb), CAST(:topEarningReleases AS jsonb),
         :payoutSuccessRate
       )`,
      {
        totalPlatformRevenue: JSON.stringify(snapshot.total_platform_revenue),
        revenuePerArtist: JSON.stringify(snapshot.revenue_per_artist),
        revenuePerTrack: JSON.stringify(snapshot.revenue_per_track),
        topEarningReleases: JSON.stringify(snapshot.top_earning_releases),
        payoutSuccessRate: snapshot.payout_success_rate,
      },
    );
    return snapshot;
  }
}
