import type { DistributionStore } from "../../distribution/services/distributionStore";
import { registerDistributionQueueWorker } from "../../distribution/queue/distributionWorker";
import type { RoyaltyEngine } from "../../royalties/core/royaltyEngine";
import type { FraudDetectionEngine } from "../../fraud/detectors/fraudDetectionEngine";
import { registerEmailWorker } from "../email/emailWorker";
import { registerRoyaltyWorker } from "../royalties/royaltyWorker";
import { registerFraudWorker } from "../fraud/fraudWorker";
import { registerAnalyticsWorker, type AnalyticsWorkerDeps } from "../analytics/analyticsWorker";
import { registerRealtimeWorker, type RealtimeWorkerDeps } from "../realtime/realtimeWorker";
import { createQueueSchedulers, createWorkerRuntime, type WorkerRuntime } from "../runtime/workerRuntime";
import { readQueueEnvironment } from "../../queue/redis";
import { startOperationsServer } from "../../http/operationsServer";
import { MediaProcessingEngine } from "../../media/services/MediaProcessingEngine";
import { registerArtworkProcessingWorker, registerFingerprintAnalysisWorker, registerMediaProcessingWorker, registerWaveformGenerationWorker } from "../../media/workers/mediaWorkers";
import { loadRuntimeEnv, logRuntimeEnv } from "../../config/envLoader";

export type StartWorkersDeps = {
  distributionStore?: DistributionStore;
  royaltyEngine?: Pick<RoyaltyEngine, "calculateTrackRevenue">;
  fraudDetectionEngine?: FraudDetectionEngine;
  analytics?: AnalyticsWorkerDeps;
  realtime?: RealtimeWorkerDeps;
  mediaProcessingEngine?: MediaProcessingEngine;
};

export async function startWorkers(deps: StartWorkersDeps = {}): Promise<WorkerRuntime> {
  logRuntimeEnv("worker-bootstrap");
  const runtime = createWorkerRuntime();
  const env = readQueueEnvironment();
  await runtime.startupHealthCheck();
  createQueueSchedulers();

  const email = registerEmailWorker({ concurrency: env.workerConcurrency });
  runtime.register({ name: "email", worker: email.worker, shutdown: email.stopDispatcher });

  if (deps.distributionStore) {
    runtime.register({
      name: "distribution",
      worker: registerDistributionQueueWorker(deps.distributionStore, { concurrency: env.workerConcurrency }),
    });
  }
  if (deps.royaltyEngine) {
    runtime.register({
      name: "royalty",
      worker: registerRoyaltyWorker(deps.royaltyEngine, { concurrency: env.workerConcurrency }),
    });
  }
  if (deps.fraudDetectionEngine) {
    runtime.register({
      name: "fraud",
      worker: registerFraudWorker(deps.fraudDetectionEngine, { concurrency: env.workerConcurrency }),
    });
  }
  if (deps.analytics) {
    runtime.register({
      name: "analytics",
      worker: registerAnalyticsWorker(deps.analytics, { concurrency: env.workerConcurrency }),
    });
  }
  if (deps.realtime) {
    runtime.register({
      name: "realtime",
      worker: registerRealtimeWorker(deps.realtime, { concurrency: env.workerConcurrency }),
    });
  }
  if (deps.mediaProcessingEngine) {
    runtime.register({ name: "media-processing", worker: registerMediaProcessingWorker(deps.mediaProcessingEngine, { concurrency: env.workerConcurrency }) });
    runtime.register({ name: "artwork-processing", worker: registerArtworkProcessingWorker(deps.mediaProcessingEngine, { concurrency: env.workerConcurrency }) });
    runtime.register({ name: "waveform-generation", worker: registerWaveformGenerationWorker(deps.mediaProcessingEngine, { concurrency: env.workerConcurrency }) });
    runtime.register({ name: "fingerprint-analysis", worker: registerFingerprintAnalysisWorker(deps.mediaProcessingEngine, { concurrency: env.workerConcurrency }) });
  }

  runtime.startHeartbeat();
  runtime.installSignalHandlers();
  const operations = startOperationsServer(runtime);
  const originalShutdown = runtime.shutdown.bind(runtime);
  runtime.shutdown = async () => {
    await operations.close();
    await originalShutdown();
  };
  return runtime;
}

export const startAllWorkers = startWorkers;

export function startEmailWorker(interval = 5000) {
  loadRuntimeEnv();
  const registration = registerEmailWorker({ dispatchIntervalMs: interval });
  return {
    stop: async () => {
      await registration.stopDispatcher();
      await registration.worker.close();
    },
  };
}

if (isDirectExecution()) {
  void startWorkers().catch((error) => {
    console.error(error);
    const processRef = (globalThis as any).process;
    processRef?.exit?.(1);
  });
}

function isDirectExecution() {
  const processRef = (globalThis as any).process;
  const entry = processRef?.argv?.[1] || "";
  return entry.replace(/\\/g, "/").endsWith("server/src/workers/bootstrap/startWorkers.ts");
}
