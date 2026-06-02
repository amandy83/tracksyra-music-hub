import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import type { FraudJob } from "../../queue/jobTypes";
import type { FraudDetectionEngine } from "../../fraud/detectors/fraudDetectionEngine";

export function registerFraudWorker(engine: FraudDetectionEngine, options: { concurrency?: number } = {}) {
  return createWorker(queueNames.fraud, async (job) => {
    const data = job.data as FraudJob;
    if (data.type === "STREAM_EVENT_SCORE" && data.streamEvent) {
      await engine.analyzeStreamEvent(data.streamEvent);
      return;
    }
    if (data.type === "ROYALTY_SPIKE_SCORE" && data.royaltySpike) {
      await engine.analyzeRoyaltySpike(data.royaltySpike);
      return;
    }
    if (data.type === "DISTRIBUTION_ANOMALY_SCORE" && data.distributionAnomaly) {
      await engine.analyzeDistributionAnomaly(data.distributionAnomaly);
    }
  }, { concurrency: options.concurrency });
}
