import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import type { AnalyticsJob } from "../../queue/jobTypes";

export type AnalyticsWorkerDeps = {
  streamAnalyticsService?: { persistSnapshot(): Promise<unknown> };
  revenueAnalyticsService?: { persistSnapshot(): Promise<unknown> };
  fraudAnalyticsService?: { persistSnapshot(): Promise<unknown> };
  distributionAnalyticsService?: { refreshPlatformMetrics(platform: string): Promise<unknown> };
};

export function registerAnalyticsWorker(deps: AnalyticsWorkerDeps, options: { concurrency?: number } = {}) {
  return createWorker(queueNames.analytics, async (job) => {
    const data = job.data as AnalyticsJob;
    if (data.type === "STREAM_ANALYTICS_REFRESH") await deps.streamAnalyticsService?.persistSnapshot();
    if (data.type === "REVENUE_ANALYTICS_REFRESH") await deps.revenueAnalyticsService?.persistSnapshot();
    if (data.type === "FRAUD_ANALYTICS_REFRESH") await deps.fraudAnalyticsService?.persistSnapshot();
    if (data.type === "DISTRIBUTION_ANALYTICS_REFRESH" && data.platform) {
      await deps.distributionAnalyticsService?.refreshPlatformMetrics(data.platform);
    }
  }, { concurrency: options.concurrency });
}
