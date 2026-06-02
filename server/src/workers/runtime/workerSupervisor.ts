import type { WorkerRuntimeRegistration } from "./workerRuntime";
import { logger } from "../../observability/logger";
import { captureException } from "../../observability/errorTracker";

export type WorkerSupervisorOptions = {
  heartbeatIntervalMs?: number;
  restartDelayMs?: number;
};

export class WorkerSupervisor {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private registrations: WorkerRuntimeRegistration[] = [];

  constructor(private options: WorkerSupervisorOptions = {}) {}

  register(registration: WorkerRuntimeRegistration) {
    this.registrations.push(registration);
    logger.info("worker supervised", { component: "worker-supervisor", worker: registration.name });
  }

  start() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const registration of this.registrations) {
        logger.info("worker heartbeat", {
          component: "worker-supervisor",
          worker: registration.name,
          timestamp: new Date().toISOString(),
        });
      }
    }, this.options.heartbeatIntervalMs ?? 30_000);
  }

  async stop() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async isolateRetry<T>(name: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      await captureException({
        error,
        context: { component: "worker-supervisor", worker: name },
        tags: { worker: name },
      });
      throw error;
    }
  }
}
