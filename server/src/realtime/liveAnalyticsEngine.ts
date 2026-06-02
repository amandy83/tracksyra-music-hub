import type { SqlExecutor } from "../royalties/services/royaltyStore";
import type { EventBus, PublishedRealtimeEvent } from "./events";
import type { LiveDashboardService } from "./liveDashboardService";

export class LiveAnalyticsEngine {
  constructor(private deps: {
    db: SqlExecutor;
    eventBus: EventBus;
    dashboardService: LiveDashboardService;
  }) {
    deps.eventBus.subscribe((event) => void this.onEvent(event));
  }

  async getRollingMetrics(artistId: string): Promise<Record<string, unknown>> {
    const [windows, trending, fraud] = await Promise.all([
      this.deps.db.query<{ window_name: string; streams_count: number }>(
        `SELECT '1m' AS window_name, COALESCE(SUM(stream_count_increment), 0)::int AS streams_count
         FROM streaming_events se JOIN tracks t ON t.id = se.track_id
         WHERE t.user_id = :artistId AND se.occurred_at >= now() - INTERVAL '1 minute'
         UNION ALL
         SELECT '5m', COALESCE(SUM(stream_count_increment), 0)::int
         FROM streaming_events se JOIN tracks t ON t.id = se.track_id
         WHERE t.user_id = :artistId AND se.occurred_at >= now() - INTERVAL '5 minutes'
         UNION ALL
         SELECT '1h', COALESCE(SUM(stream_count_increment), 0)::int
         FROM streaming_events se JOIN tracks t ON t.id = se.track_id
         WHERE t.user_id = :artistId AND se.occurred_at >= now() - INTERVAL '1 hour'`,
        { artistId },
      ),
      this.deps.db.query<{ track_id: string; velocity: number }>(
        `WITH recent AS (
           SELECT se.track_id, SUM(se.stream_count_increment)::int AS streams
           FROM streaming_events se JOIN tracks t ON t.id = se.track_id
           WHERE t.user_id = :artistId AND se.occurred_at >= now() - INTERVAL '5 minutes'
           GROUP BY se.track_id
         ), previous AS (
           SELECT se.track_id, SUM(se.stream_count_increment)::int AS streams
           FROM streaming_events se JOIN tracks t ON t.id = se.track_id
           WHERE t.user_id = :artistId
             AND se.occurred_at < now() - INTERVAL '5 minutes'
             AND se.occurred_at >= now() - INTERVAL '10 minutes'
           GROUP BY se.track_id
         )
         SELECT recent.track_id::text, (recent.streams - COALESCE(previous.streams, 0))::float AS velocity
         FROM recent LEFT JOIN previous ON previous.track_id = recent.track_id
         ORDER BY velocity DESC LIMIT 10`,
        { artistId },
      ),
      this.deps.db.query<{ score: number }>(
        `SELECT COALESCE(MAX(fraud_score), 0)::int AS score
         FROM fraud_events
         WHERE user_id = :artistId AND created_at >= now() - INTERVAL '1 hour'`,
        { artistId },
      ),
    ]);

    return {
      windows: Object.fromEntries(windows.map((row) => [row.window_name, row.streams_count])),
      trending_tracks_velocity: trending,
      fraud_risk_live_score: fraud[0]?.score ?? 0,
    };
  }

  private async onEvent(event: PublishedRealtimeEvent): Promise<void> {
    if (!event.artist_id) return;
    const rollingMetrics = await this.getRollingMetrics(event.artist_id);
    await this.deps.db.query(
      `INSERT INTO live_dashboard_snapshots (
         artist_id, stream_counts, revenue_updates, fraud_alerts,
         distribution_statuses, payout_updates, rolling_metrics
       ) VALUES (
         :artistId, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb,
         '{}'::jsonb, '[]'::jsonb, CAST(:rollingMetrics AS jsonb)
       )`,
      { artistId: event.artist_id, rollingMetrics: JSON.stringify(rollingMetrics) },
    );
    if (event.event_type !== "DASHBOARD_SNAPSHOT_UPDATED") {
      await this.deps.dashboardService.publishSnapshot(event.artist_id);
    }
  }
}
