import { closeQueues, createScheduler, getQueueMetrics, pauseQueue, resumeQueue, type WorkerLike } from "../../queue/queueFactory";
import { closeRedisConnection, checkRedisHealth, readQueueEnvironment } from "../../queue/redis";
import { toPrometheusMetrics, type QueueMetricSnapshot } from "../../queue/metrics";
import { queueNames } from "../../queue/queueNames";
import { logger } from "../../observability/logger";
import { assertProductionEnvironment, validateProductionEnvironment } from "../../config/environmentValidation";
import { logRuntimeEnv } from "../../config/envLoader";
import { WorkerSupervisor } from "./workerSupervisor";
import { validateEmailQueueSchema } from "../../notifications/emailQueue";

export type WorkerRuntimeRegistration = {
  name: string;
  worker: WorkerLike;
  shutdown?: () => Promise<void>;
};

export class WorkerRuntime {
  private registrations: WorkerRuntimeRegistration[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shuttingDown = false;
  private supervisor = new WorkerSupervisor();

  async startupHealthCheck() {
    logRuntimeEnv("worker-runtime");
    const validation = validateProductionEnvironment();
    for (const warning of validation.warnings) logger.warn("environment validation warning", { component: "worker-runtime", warning });
    assertProductionEnvironment();
    const emailSchema = await validateEmailQueueSchema();
    if (!emailSchema.ok) {
      logger.warn("email queue schema validation failed", { component: "worker-runtime", tables: emailSchema.tables });
    }
    return checkRedisHealth();
  }

  register(registration: WorkerRuntimeRegistration) {
    this.registrations.push(registration);
    this.supervisor.register(registration);
    logger.info("worker registered", { component: "worker-runtime", worker: registration.name });
    return registration;
  }

  startHeartbeat(intervalMs = 30000) {
    if (this.heartbeatTimer) return;
    this.supervisor.start();
    this.heartbeatTimer = setInterval(() => {
      logger.info("runtime heartbeat", {
        component: "worker-runtime",
        workers: this.registrations.length,
        redis: readQueueEnvironment().redisUrl ? "configured" : "dev-fallback",
        memory: getProcessMemory(),
      });
    }, intervalMs);
  }

  installSignalHandlers() {
    const processRef = typeof globalThis !== "undefined" ? (globalThis as any).process : undefined;
    if (!processRef?.once) return;
    const shutdown = async (signal: string) => {
      await this.shutdown();
      processRef.exit(signal === "SIGINT" ? 130 : 143);
    };
    processRef.once("SIGINT", () => void shutdown("SIGINT"));
    processRef.once("SIGTERM", () => void shutdown("SIGTERM"));
  }

  async collectMetrics(): Promise<QueueMetricSnapshot[]> {
    const names = [
      queueNames.email,
      queueNames.distribution,
      queueNames.royalty,
      queueNames.fraud,
      queueNames.analytics,
      queueNames.realtime,
      queueNames.payout,
      queueNames.mediaProcessing,
      queueNames.artworkProcessing,
      queueNames.waveformGeneration,
      queueNames.fingerprintAnalysis,
    ] as const;
    return Promise.all(names.map((name) => getQueueMetrics(name)));
  }

  async prometheusMetrics() {
    return toPrometheusMetrics(await this.collectMetrics());
  }

  async pauseAll() {
    await Promise.all(this.registrations.map((registration) => registration.worker.pause?.()));
    await Promise.all(queueList().map((name) => pauseQueue(name)));
    logger.warn("all queues paused", { component: "worker-runtime" });
  }

  async resumeAll() {
    await Promise.all(queueList().map((name) => resumeQueue(name)));
    await Promise.all(this.registrations.map((registration) => registration.worker.resume?.()));
    logger.info("all queues resumed", { component: "worker-runtime" });
  }

  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    await this.supervisor.stop();

    await Promise.all(this.registrations.map((registration) => registration.shutdown?.()));
    await Promise.all(this.registrations.map((registration) => registration.worker.close()));
    this.registrations = [];
    await closeQueues();
    await closeRedisConnection();
    logger.info("worker runtime shutdown complete", { component: "worker-runtime" });
  }
}

export function createWorkerRuntime() {
  return new WorkerRuntime();
}

export function createQueueSchedulers() {
  return queueList().map((name) => createScheduler(name)).filter(Boolean);
}

function queueList() {
  return [
    queueNames.email,
    queueNames.distribution,
    queueNames.royalty,
    queueNames.fraud,
    queueNames.analytics,
    queueNames.realtime,
    queueNames.payout,
    queueNames.mediaProcessing,
    queueNames.artworkProcessing,
    queueNames.waveformGeneration,
    queueNames.fingerprintAnalysis,
  ] as const;
}

function getProcessMemory() {
  const processRef = typeof globalThis !== "undefined" ? (globalThis as any).process : undefined;
  return processRef?.memoryUsage?.() || {};
}
