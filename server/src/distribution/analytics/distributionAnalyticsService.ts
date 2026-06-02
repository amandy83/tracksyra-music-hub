import type { DistributionPlatformName } from "../models/distributionTypes";
import type { SqlExecutor } from "../services/distributionStore";

export type DistributionAnalyticsSnapshot = {
  platform: DistributionPlatformName;
  totalReleasesSubmitted: number;
  platformSuccessRate: number;
  averageDeliveryTimeSeconds: number | null;
  rejectionRate: number;
  failureClassificationMetrics: Record<string, number>;
};

export class DistributionAnalyticsService {
  constructor(private db: SqlExecutor) {}

  async refreshPlatformMetrics(platform: DistributionPlatformName): Promise<DistributionAnalyticsSnapshot> {
    const rows = await this.db.query<{
      total_releases_submitted: number;
      successful_deliveries: number;
      rejected_deliveries: number;
      failed_deliveries: number;
      avg_delivery_seconds: number | null;
    }>(
      `SELECT
         COUNT(DISTINCT release_id)::int AS total_releases_submitted,
         COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'PUBLISHED'))::int AS successful_deliveries,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_deliveries,
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_deliveries,
         AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) FILTER (WHERE delivered_at IS NOT NULL) AS avg_delivery_seconds
       FROM platform_deliveries
       WHERE platform = :platform`,
      { platform },
    );

    const failures = await this.db.query<{ error_code: string; count: number }>(
      `SELECT COALESCE(error_code, 'UNKNOWN') AS error_code, COUNT(*)::int AS count
       FROM platform_deliveries
       WHERE platform = :platform AND status IN ('FAILED', 'REJECTED')
       GROUP BY COALESCE(error_code, 'UNKNOWN')`,
      { platform },
    );

    const row = rows[0] ?? {
      total_releases_submitted: 0,
      successful_deliveries: 0,
      rejected_deliveries: 0,
      failed_deliveries: 0,
      avg_delivery_seconds: null,
    };

    const totalTerminal = row.successful_deliveries + row.rejected_deliveries + row.failed_deliveries;
    const snapshot: DistributionAnalyticsSnapshot = {
      platform,
      totalReleasesSubmitted: row.total_releases_submitted,
      platformSuccessRate: totalTerminal ? row.successful_deliveries / totalTerminal : 0,
      averageDeliveryTimeSeconds: row.avg_delivery_seconds,
      rejectionRate: totalTerminal ? row.rejected_deliveries / totalTerminal : 0,
      failureClassificationMetrics: Object.fromEntries(failures.map((item) => [item.error_code, item.count])),
    };

    await this.db.query(
      `INSERT INTO distribution_analytics (
         platform, total_releases_submitted, platform_success_rate, average_delivery_time_seconds,
         rejection_rate, failure_classification_metrics
       ) VALUES (
         :platform, :totalReleasesSubmitted, :platformSuccessRate, :averageDeliveryTimeSeconds,
         :rejectionRate, CAST(:failureClassificationMetrics AS jsonb)
       )`,
      {
        platform: snapshot.platform,
        totalReleasesSubmitted: snapshot.totalReleasesSubmitted,
        platformSuccessRate: snapshot.platformSuccessRate,
        averageDeliveryTimeSeconds: snapshot.averageDeliveryTimeSeconds,
        rejectionRate: snapshot.rejectionRate,
        failureClassificationMetrics: JSON.stringify(snapshot.failureClassificationMetrics),
      },
    );

    return snapshot;
  }
}

