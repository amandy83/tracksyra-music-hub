import { payoutQueue } from "./payoutQueue";

import { createWorker } from "../../queues/bullmq";

import type { PayoutEngine } from "../core/payoutEngine";

// Worker is instantiated in server entrypoints.
// This file provides wiring only to keep queue deterministic.

export function registerPayoutJobProcessor(engine: PayoutEngine) {
  // eslint-disable-next-line no-console
  console.log("[payout] registering payout-job-processor");

  createWorker({
    name: "payout-job-processing",
    queueName: "payout-queue",
    processor: async (job) => {
      const data = (job as any).data as { payout_id: string; correlation_id: string; actor?: string | null };
      await engine.simulateProcessing(data.payout_id, data.correlation_id, data.actor ?? null);
    },
  });
}

