import type { SqlExecutor } from "../royalties/services/royaltyStore";
import type { EventBus, RealtimeSnapshot } from "./events";

export class LiveDashboardService {
  constructor(private deps: { db: SqlExecutor; eventBus: EventBus }) {}

  async getSnapshot(artistId: string): Promise<RealtimeSnapshot> {
    const [streams, revenue, fraud, distribution, payouts, rolling] = await Promise.all([
      this.deps.db.query<{ track_id: string; streams_count: number }>(
        `SELECT ss.track_id::text, SUM(ss.streams_count)::int AS streams_count
         FROM streaming_stats ss
         JOIN tracks t ON t.id = ss.track_id
         WHERE t.user_id = :artistId
         GROUP BY ss.track_id`,
        { artistId },
      ),
      this.deps.db.query<{ track_id: string; total_revenue: string }>(
        `SELECT track_id::text, SUM(total_revenue)::text AS total_revenue
         FROM royalty_records
         WHERE artist_id = :artistId
         GROUP BY track_id`,
        { artistId },
      ),
      this.deps.db.query<Record<string, unknown>>(
        `SELECT event_id, track_id, platform, decision, fraud_score, reasons, created_at
         FROM fraud_events
         WHERE user_id = :artistId AND decision IN ('SUSPICIOUS', 'BLOCKED')
         ORDER BY created_at DESC
         LIMIT 25`,
        { artistId },
      ),
      this.deps.db.query<{ release_id: string; track_id: string | null; platform: string; status: string }>(
        `SELECT pd.release_id::text, pd.track_id::text, pd.platform::text, pd.status::text
         FROM platform_deliveries pd
         JOIN releases r ON r.id = pd.release_id
         WHERE r.user_id = :artistId`,
        { artistId },
      ),
      this.deps.db.query<Record<string, unknown>>(
        `SELECT id, amount, currency, state, created_at, updated_at
         FROM payout_requests
         WHERE user_id = :artistId
         ORDER BY created_at DESC
         LIMIT 25`,
        { artistId },
      ),
      this.deps.db.query<Record<string, unknown>>(
        `SELECT rolling_metrics
         FROM live_dashboard_snapshots
         WHERE artist_id = :artistId
         ORDER BY calculated_at DESC
         LIMIT 1`,
        { artistId },
      ),
    ]);

    return {
      artist_id: artistId,
      stream_counts: Object.fromEntries(streams.map((row) => [row.track_id, row.streams_count])),
      revenue_updates: Object.fromEntries(revenue.map((row) => [row.track_id, row.total_revenue])),
      fraud_alerts: fraud,
      distribution_statuses: Object.fromEntries(distribution.map((row) => [`${row.release_id}:${row.track_id ?? "release"}:${row.platform}`, row.status])),
      payout_updates: payouts,
      rolling_metrics: rolling[0]?.rolling_metrics as Record<string, unknown> ?? {},
      updated_at: new Date().toISOString(),
    };
  }

  async publishSnapshot(artistId: string): Promise<RealtimeSnapshot> {
    const snapshot = await this.getSnapshot(artistId);
    await this.deps.db.query(
      `INSERT INTO live_dashboard_snapshots (
         artist_id, stream_counts, revenue_updates, fraud_alerts,
         distribution_statuses, payout_updates, rolling_metrics
       ) VALUES (
         :artistId, CAST(:streamCounts AS jsonb), CAST(:revenueUpdates AS jsonb),
         CAST(:fraudAlerts AS jsonb), CAST(:distributionStatuses AS jsonb),
         CAST(:payoutUpdates AS jsonb), CAST(:rollingMetrics AS jsonb)
       )`,
      {
        artistId,
        streamCounts: JSON.stringify(snapshot.stream_counts),
        revenueUpdates: JSON.stringify(snapshot.revenue_updates),
        fraudAlerts: JSON.stringify(snapshot.fraud_alerts),
        distributionStatuses: JSON.stringify(snapshot.distribution_statuses),
        payoutUpdates: JSON.stringify(snapshot.payout_updates),
        rollingMetrics: JSON.stringify(snapshot.rolling_metrics),
      },
    );
    await this.deps.eventBus.publish({
      event_id: `realtime:DASHBOARD_SNAPSHOT_UPDATED:${artistId}:${snapshot.updated_at}`,
      event_type: "DASHBOARD_SNAPSHOT_UPDATED",
      entity_type: "artist",
      entity_id: artistId,
      artist_id: artistId,
      channels: [`artist:${artistId}`],
      sequence_key: `artist:${artistId}`,
      payload: { snapshot },
      occurred_at: snapshot.updated_at,
    });
    return snapshot;
  }
}
