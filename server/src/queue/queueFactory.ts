import {
  Job,
  JobScheduler,
  Queue,
  Worker,
  type JobsOptions,
  type Processor,
  type WorkerOptions,
} from "bullmq";
import { getRedisConnection, isRedisQueueEnabled, readQueueEnvironment } from "./redis";
import { collectQueueMetrics, incrementMetric, recordJobLatency, recordProcessingDuration, recordRetry, setWorkerHealth } from "./metrics";
import type { DeadLetterJob, QueueJobMap } from "./jobTypes";
import { captureException } from "../observability/errorTracker";
import { logger } from "../observability/logger";

type KnownQueueName = keyof QueueJobMap;
type QueueData<TName extends KnownQueueName> = QueueJobMap[TName];

export type QueueAddOptions = JobsOptions & {
  idempotencyKey?: string;
};

export type QueueLike<TData extends Record<string, unknown>> = {
  name: string;
  add(name: string, data: TData, options?: QueueAddOptions): Promise<unknown>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  getJob?(id: string): Promise<unknown>;
  getJobs?(types?: string[], start?: number, end?: number): Promise<unknown[]>;
  close(): Promise<void>;
};

export type WorkerLike = {
  name: string;
  pause?(): Promise<void>;
  resume?(): Promise<void>;
  close(): Promise<void>;
};

export type QueueWorkerOptions = Omit<WorkerOptions, "connection" | "prefix">;

const queues = new Map<string, QueueLike<any>>();
const schedulers = new Map<string, JobScheduler>();
const devQueues = new Map<string, DevQueue<any>>();

export function createQueue<TName extends KnownQueueName>(name: TName): QueueLike<QueueData<TName>> {
  const existing = queues.get(name);
  if (existing) return existing;

  const config = readQueueEnvironment();
  if (!isRedisQueueEnabled()) {
    const queue = getDevQueue<QueueData<TName>>(name);
    queues.set(name, queue);
    return queue;
  }

  const queue = new Queue<QueueData<TName>>(name, {
    connection: getRedisConnection() as any,
    prefix: config.queuePrefix,
    defaultJobOptions: defaultJobOptions(),
    streams: { events: { maxLen: 10000 } },
  });
  queues.set(name, queue as unknown as QueueLike<QueueData<TName>>);
  return queue as unknown as QueueLike<QueueData<TName>>;
}

export function createWorker<TName extends KnownQueueName>(
  name: TName,
  processor: Processor<QueueData<TName>, unknown, string>,
  options: QueueWorkerOptions = {},
): WorkerLike {
  const config = readQueueEnvironment();
  const concurrency = options.concurrency ?? config.workerConcurrency;

  if (!isRedisQueueEnabled()) {
    const queue = getDevQueue<QueueData<TName>>(name);
    const worker = queue.registerProcessor(async (job) => {
      const started = Date.now();
      const createdAt = typeof job.data?.createdAt === "string" ? Date.parse(job.data.createdAt) : NaN;
      if (Number.isFinite(createdAt)) recordJobLatency(name, Math.max(Date.now() - createdAt, 0));
      try {
        const result = await processor(job as Job<QueueData<TName>, unknown, string>);
        recordProcessingDuration(name, Date.now() - started);
        setWorkerHealth(name, "healthy");
        return result;
      } catch (error) {
        setWorkerHealth(name, "degraded");
        throw error;
      }
    });
    setWorkerHealth(name, "healthy");
    return worker;
  }

  const worker = new Worker<QueueData<TName>>(
    name,
    async (job) => {
      const started = Date.now();
      const createdAt = typeof job.data?.createdAt === "string" ? Date.parse(job.data.createdAt) : NaN;
      if (Number.isFinite(createdAt)) recordJobLatency(name, Math.max(Date.now() - createdAt, 0));
      try {
        const result = await processor(job);
        recordProcessingDuration(name, Date.now() - started);
        setWorkerHealth(name, "healthy");
        return result;
      } catch (error) {
        if ((job.attemptsMade || 0) > 0) recordRetry(name);
        incrementMetric("tracksyra_worker_exceptions_total", { queue: String(name) });
        setWorkerHealth(name, "degraded");
        throw error;
      }
    },
    {
      ...options,
      concurrency,
      connection: getRedisConnection() as any,
      prefix: config.queuePrefix,
    },
  );

  worker.on("failed", async (job, error) => {
    incrementFailureMetric(name, job?.name || "unknown");
    await captureException({
      error,
      context: {
        component: "worker",
        queue: String(name),
        jobId: job?.id,
        jobName: job?.name,
        traceId: job?.data?.traceId,
        correlationId: job?.data?.correlationId,
        actorUserId: job?.data?.actorUserId,
      },
      tags: { queue: String(name), job: job?.name || "unknown" },
    });
    if (!job || job.attemptsMade < (job.opts.attempts || 1)) return;
    await enqueueDeadLetter(name, job, error);
  });
  worker.on("completed", (job) => {
    incrementSuccessMetric(name, job.name);
  });
  worker.on("stalled", (jobId) => {
    incrementMetric("tracksyra_worker_stalled_jobs_total", { queue: String(name) });
    logger.warn("worker job stalled", { component: "worker", queue: String(name), jobId });
  });
  worker.on("error", (error) => {
    setWorkerHealth(name, "degraded");
    logger.error("worker runtime error", { component: "worker", queue: String(name), error: { message: error.message, stack: error.stack } });
  });
  setWorkerHealth(name, "healthy");
  return worker as unknown as WorkerLike;
}

export function createScheduler(name: KnownQueueName) {
  const existing = schedulers.get(name);
  if (existing) return existing;
  if (!isRedisQueueEnabled()) return null;

  const scheduler = new JobScheduler(name, {
    connection: getRedisConnection() as any,
    prefix: readQueueEnvironment().queuePrefix,
  });
  schedulers.set(name, scheduler);
  return scheduler;
}

export async function enqueueWithDefaults<TName extends KnownQueueName>(
  queueName: TName,
  jobName: string,
  data: QueueData<TName>,
  options: QueueAddOptions = {},
) {
  const queue = createQueue(queueName);
  const jobId = normalizeBullMqJobId(options.jobId || options.idempotencyKey || data.idempotencyKey);
  return queue.add(jobName, data, {
    ...defaultJobOptions(),
    ...options,
    jobId,
  });
}

export async function getQueueMetrics(queueName: KnownQueueName) {
  const queue = createQueue(queueName);
  return collectQueueMetrics(queueName, queue as Queue);
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  await Promise.all([...schedulers.values()].map((scheduler) => scheduler.close()));
  queues.clear();
  schedulers.clear();
}

function defaultJobOptions(): JobsOptions {
  return {
    attempts: 3,
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: false,
    backoff: { type: "exponential", delay: 1000 },
    delay: 0,
  };
}

async function enqueueDeadLetter(queueName: string, job: Job, error: Error) {
  const dlqName = `${queueName}.dlq`;
  const payload: DeadLetterJob = {
    queueName,
    jobName: job.name,
    jobId: job.id,
    payload: job.data || {},
    retries: job.attemptsMade,
    failureReason: error.message,
    stackTrace: error.stack || null,
    failedAt: new Date().toISOString(),
    traceId: job.data?.traceId || null,
    correlationId: job.data?.correlationId || null,
    actorUserId: job.data?.actorUserId || null,
  };

  if (!isRedisQueueEnabled()) return;
  const queue = new Queue(dlqName, {
    connection: getRedisConnection() as any,
    prefix: readQueueEnvironment().queuePrefix,
    defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
  });
  await queue.add("dead-letter", payload, { jobId: normalizeBullMqJobId(`${job.id || job.name}:${Date.now()}`) });
  await queue.close();
}

export async function pauseQueue(queueName: KnownQueueName) {
  await createQueue(queueName).pause?.();
}

export async function resumeQueue(queueName: KnownQueueName) {
  await createQueue(queueName).resume?.();
}

export async function inspectQueue(queueName: KnownQueueName, start = 0, end = 50) {
  const queue = createQueue(queueName);
  const counts = await queue.getJobCounts("waiting", "delayed", "active", "failed", "completed", "paused");
  const jobs = queue.getJobs ? await queue.getJobs(["waiting", "delayed", "active", "failed"], start, end) : [];
  return { name: queueName, counts, jobs };
}

export async function retryQueueJob(queueName: KnownQueueName, jobId: string) {
  const queue = createQueue(queueName);
  const job = queue.getJob ? (await queue.getJob(jobId) as any) : null;
  if (!job) throw new Error(`Job not found: ${queueName}/${jobId}`);
  if (typeof job.retry === "function") return job.retry();
  throw new Error(`Job retry is not supported by queue backend: ${queueName}`);
}

export async function inspectDeadLetterQueue(queueName: string, start = 0, end = 50) {
  if (!isRedisQueueEnabled()) return { name: `${queueName}.dlq`, counts: {}, jobs: [] };
  const queue = new Queue(`${queueName}.dlq`, {
    connection: getRedisConnection() as any,
    prefix: readQueueEnvironment().queuePrefix,
  });
  try {
    const counts = await queue.getJobCounts("waiting", "failed", "completed");
    const jobs = await queue.getJobs(["waiting", "failed", "completed"], start, end);
    return { name: `${queueName}.dlq`, counts, jobs };
  } finally {
    await queue.close();
  }
}

function incrementSuccessMetric(queueName: string, jobName: string) {
  if (queueName === "distributionQueue") incrementMetric("tracksyra_distribution_jobs_total", { status: "success" });
  if (queueName === "emailQueue") incrementMetric("tracksyra_email_jobs_total", { status: "success" });
  if (queueName === "payoutQueue") incrementMetric("tracksyra_payout_jobs_total", { status: "success" });
  if (queueName === "fraudQueue") incrementMetric("tracksyra_fraud_jobs_total", { status: "success", job: jobName });
  if (queueName.startsWith("media") || queueName === "artwork-processing" || queueName === "waveform-generation" || queueName === "fingerprint-analysis") {
    incrementMetric("tracksyra_media_jobs_total", { status: "success", queue: queueName, job: jobName });
  }
}

function incrementFailureMetric(queueName: string, jobName: string) {
  if (queueName === "distributionQueue") incrementMetric("tracksyra_distribution_jobs_total", { status: "failure" });
  if (queueName === "emailQueue") incrementMetric("tracksyra_email_jobs_total", { status: "failure" });
  if (queueName === "payoutQueue") incrementMetric("tracksyra_payout_jobs_total", { status: "failure" });
  if (queueName === "fraudQueue") incrementMetric("tracksyra_fraud_jobs_total", { status: "failure", job: jobName });
  if (queueName.startsWith("media") || queueName === "artwork-processing" || queueName === "waveform-generation" || queueName === "fingerprint-analysis") {
    incrementMetric("tracksyra_media_jobs_total", { status: "failure", queue: queueName, job: jobName });
  }
}

function getDevQueue<TData extends Record<string, unknown>>(name: string): DevQueue<TData> {
  const existing = devQueues.get(name);
  if (existing) return existing;
  const queue = new DevQueue<TData>(name);
  devQueues.set(name, queue);
  return queue;
}

function normalizeBullMqJobId(value: unknown) {
  if (value === undefined || value === null) return undefined;
  return String(value).replace(/:/g, "__");
}

class DevQueue<TData extends Record<string, unknown>> implements QueueLike<TData> {
  private jobs: Array<{ name: string; data: TData; options?: QueueAddOptions }> = [];
  private processor?: (job: Partial<Job<TData>>) => Promise<unknown>;
  private paused = false;
  private closed = false;

  constructor(readonly name: string) {}

  async add(name: string, data: TData, options?: QueueAddOptions) {
    if (this.closed) throw new Error(`Queue ${this.name} is closed`);
    const job = { name, data, options };
    this.jobs.push(job);
    void this.drain();
    return job;
  }

  async getJobCounts(...types: string[]) {
    return Object.fromEntries(types.map((type) => [type, type === "waiting" ? this.jobs.length : 0]));
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
    void this.drain();
  }

  async getJobs(_types: string[] = [], start = 0, end = 50) {
    return this.jobs.slice(start, end + 1);
  }

  registerProcessor(processor: (job: Partial<Job<TData>>) => Promise<unknown>): WorkerLike {
    this.processor = processor;
    void this.drain();
    return {
      name: this.name,
      close: async () => {
        this.processor = undefined;
      },
    };
  }

  async close() {
    this.closed = true;
    this.jobs = [];
    this.processor = undefined;
  }

  private async drain() {
    if (!this.processor || this.paused) return;
    while (!this.paused && this.jobs.length > 0) {
      const processor = this.processor;
      if (!processor) return;
      const next = this.jobs.shift()!;
      await processor({
        id: next.options?.jobId ? String(next.options.jobId) : undefined,
        name: next.name,
        data: next.data,
        opts: next.options,
        attemptsMade: 0,
      });
    }
  }
}
