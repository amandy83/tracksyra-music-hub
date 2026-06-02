import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import type { RealtimeJob } from "../../queue/jobTypes";
import type { EventBus } from "../../realtime/events/eventBus";
import type { LiveDashboardService } from "../../realtime/liveDashboardService";

export type RealtimeWorkerDeps = {
  eventBus?: Pick<EventBus, "publish">;
  liveDashboardService?: Pick<LiveDashboardService, "publishSnapshot">;
};

export function registerRealtimeWorker(deps: RealtimeWorkerDeps, options: { concurrency?: number } = {}) {
  return createWorker(queueNames.realtime, async (job) => {
    const data = job.data as RealtimeJob;
    if (data.type === "PUBLISH_EVENT" && data.event) {
      await deps.eventBus?.publish(data.event);
      return;
    }
    if (data.type === "DASHBOARD_SNAPSHOT_REFRESH" && data.artistId) {
      await deps.liveDashboardService?.publishSnapshot(data.artistId);
    }
  }, { concurrency: options.concurrency });
}
