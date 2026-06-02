import type { DistributionJob } from "../models/distributionTypes";
import { QueueDispatcher } from "../../queue/queueDispatcher";

export type DistributionQueue = {
  enqueue(job: DistributionJob): Promise<void>;
};

export class InMemoryDistributionQueue implements DistributionQueue {
  private readonly jobs: DistributionJob[] = [];

  async enqueue(job: DistributionJob): Promise<void> {
    this.jobs.push(job);
  }

  drain(): DistributionJob[] {
    return this.jobs.splice(0, this.jobs.length);
  }
}

export class BullMqDistributionQueue implements DistributionQueue {
  async enqueue(job: DistributionJob): Promise<void> {
    await QueueDispatcher.enqueueDistribution({
      distributionJob: job,
      actorUserId: null,
      correlationId: job.id,
      traceId: job.id,
      idempotencyKey: `distribution:${job.id}`,
      sourceSystem: "distribution",
    });
  }
}
