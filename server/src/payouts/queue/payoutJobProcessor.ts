import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import type { PayoutJob } from "../../queue/jobTypes";

export type PayoutJobEngine = {
  simulateProcessing(payoutId: string, correlationId: string, actor: string | null): Promise<unknown>;
};

// Worker is instantiated in server entrypoints.
// This file provides wiring only to keep queue deterministic.

export function registerPayoutJobProcessor(engine: PayoutJobEngine) {
  // eslint-disable-next-line no-console
  console.log("[payout] registering payout-job-processor");

  return createWorker(queueNames.payout, async (job) => {
    const data = job.data as PayoutJob;
    await engine.simulateProcessing(data.payout_id, data.correlation_id, data.actor ?? null);
  });
}

