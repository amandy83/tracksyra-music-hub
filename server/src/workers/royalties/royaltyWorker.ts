import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import type { RoyaltyJob } from "../../queue/jobTypes";
import type { RoyaltyEngine } from "../../royalties/core/royaltyEngine";

export function registerRoyaltyWorker(engine: Pick<RoyaltyEngine, "calculateTrackRevenue">, options: { concurrency?: number } = {}) {
  return createWorker(queueNames.royalty, async (job) => {
    const data = job.data as RoyaltyJob;
    if (data.type !== "TRACK_REVENUE_RECALCULATION") return;
    await engine.calculateTrackRevenue(data.input);
  }, { concurrency: options.concurrency });
}
