import { readFileSync } from "node:fs";

function loadEnvFile(path: string) {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (!match) continue;
    if (process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(name: string, check: () => boolean | Promise<boolean>, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true;
    await wait(100);
  }
  throw new Error(`${name} timed out after ${timeoutMs}ms`);
}

loadEnvFile(".env");
const basePrefix = process.env.QUEUE_PREFIX || "tracksyra";
const smokePrefix = `${basePrefix}:redis-smoke:${Date.now()}`;
process.env.QUEUE_PREFIX = smokePrefix;

const failures: Array<{ check: string; error: string }> = [];
const passed: string[] = [];
const workers: Array<{ close: () => Promise<void>; name: string }> = [];

function pass(check: string) {
  passed.push(check);
}

async function run(check: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(check);
  } catch (error) {
    failures.push({ check, error: error instanceof Error ? error.message : String(error) });
  }
}

const redis = await import("../server/src/queue/redis");
const queueFactory = await import("../server/src/queue/queueFactory");
const { queueNames } = await import("../server/src/queue/queueNames");
const { QueueDispatcher } = await import("../server/src/queue/queueDispatcher");
const { createJobTrace } = await import("../server/src/queue/jobTypes");
const { WorkerRuntime, createQueueSchedulers } = await import("../server/src/workers/runtime/workerRuntime");
const { registerRealtimeWorker } = await import("../server/src/workers/realtime/realtimeWorker");

const activeQueues = [
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

await run("redis connectivity", async () => {
  const healthy = await redis.checkRedisHealth();
  if (!healthy) throw new Error("Redis health check returned false");
});

await run("tls rediss url configured", async () => {
  const config = redis.readQueueEnvironment();
  if (!config.redisUrl?.startsWith("rediss://")) throw new Error("REDIS_URL is not rediss://");
});

await run("bullmq queue creation", async () => {
  for (const queueName of activeQueues) {
    const queue = queueFactory.createQueue(queueName);
    await queue.getJobCounts("waiting", "delayed", "active", "failed", "completed");
  }
});

await run("scheduler creation", async () => {
  const schedulers = createQueueSchedulers();
  if (schedulers.length !== activeQueues.length) throw new Error(`Expected ${activeQueues.length} schedulers, got ${schedulers.length}`);
});

await run("worker registration", async () => {
  const worker = queueFactory.createWorker(queueNames.email, async () => ({ ok: true }), { concurrency: 1 });
  workers.push(worker);
  if (worker.name !== queueNames.email) throw new Error(`Unexpected worker name ${worker.name}`);
});

await run("email queue enqueue/dequeue", async () => {
  let processed = 0;
  const worker = queueFactory.createWorker(queueNames.email, async () => {
    processed += 1;
    return { ok: true };
  }, { concurrency: 1 });
  workers.push(worker);
  const trace = createJobTrace({ idempotencyKey: `email-smoke:${Date.now()}`, sourceSystem: "system" });
  await queueFactory.enqueueWithDefaults(queueNames.email, "email.send", {
    ...trace,
    emailQueueId: "00000000-0000-0000-0000-000000000000",
    to: "redis-smoke@example.invalid",
    subject: "Redis smoke",
    html: "<p>Redis smoke</p>",
    text: "Redis smoke",
    templateType: "SMOKE",
    payload: {},
  }, { jobId: trace.idempotencyKey, attempts: 1 });
  await waitFor("email job processing", () => processed === 1);
});

await run("retry flow", async () => {
  let attempts = 0;
  const worker = queueFactory.createWorker(queueNames.payout, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("intentional retry smoke failure");
    return { ok: true };
  }, { concurrency: 1 });
  workers.push(worker);
  await queueFactory.enqueueWithDefaults(queueNames.payout, "payout.process", {
    ...createJobTrace({ idempotencyKey: `retry-smoke:${Date.now()}`, sourceSystem: "worker" }),
    payout_id: `redis-smoke-payout-${Date.now()}`,
    correlation_id: `redis-smoke-correlation-${Date.now()}`,
    actor: "redis-smoke",
  }, { attempts: 2, backoff: { type: "fixed", delay: 100 } });
  await waitFor("retry job completion", () => attempts === 2, 15000);
});

await run("delayed jobs", async () => {
  let processedAt = 0;
  const started = Date.now();
  const worker = queueFactory.createWorker(queueNames.analytics, async () => {
    processedAt = Date.now();
    return { ok: true };
  }, { concurrency: 1 });
  workers.push(worker);
  await queueFactory.enqueueWithDefaults(queueNames.analytics, "analytics.refresh", {
    ...createJobTrace({ idempotencyKey: `delay-smoke:${Date.now()}`, sourceSystem: "analytics" }),
    type: "STREAM_ANALYTICS_REFRESH",
    artistId: "redis-smoke-artist",
  }, { delay: 750, attempts: 1 });
  await waitFor("delayed job processing", () => processedAt > 0, 15000);
  if (processedAt - started < 500) throw new Error(`Delayed job ran too early: ${processedAt - started}ms`);
});

await run("dead-letter queues", async () => {
  const worker = queueFactory.createWorker(queueNames.fraud, async () => {
    throw new Error("intentional dlq smoke failure");
  }, { concurrency: 1 });
  workers.push(worker);
  await queueFactory.enqueueWithDefaults(queueNames.fraud, "fraud.score", {
    ...createJobTrace({ idempotencyKey: `dlq-smoke:${Date.now()}`, sourceSystem: "fraud" }),
    type: "DISTRIBUTION_ANOMALY_SCORE",
    distributionAnomaly: { trackId: "redis-smoke-track", failuresLastDay: 1 },
  }, { attempts: 1, backoff: { type: "fixed", delay: 50 } });
  await waitFor("dlq insert", async () => {
    const dlq = await queueFactory.inspectDeadLetterQueue(queueNames.fraud, 0, 10);
    return Number(dlq.counts.waiting || 0) + Number(dlq.counts.completed || 0) + Number(dlq.counts.failed || 0) > 0;
  }, 15000);
});

await run("distribution queue dispatcher", async () => {
  await QueueDispatcher.enqueueDistribution({
    distributionJob: {
      id: `redis-smoke-distribution-${Date.now()}`,
      releaseId: "redis-smoke-release",
      trackId: "redis-smoke-track",
      platform: "too_lost",
      status: "PENDING",
      createdAt: new Date(),
    },
  });
  const metrics = await queueFactory.getQueueMetrics(queueNames.distribution);
  if (metrics.queued < 1) throw new Error("Distribution queue did not receive a job");
});

await run("realtime event queue worker", async () => {
  let published = 0;
  const worker = registerRealtimeWorker({
    eventBus: {
      publish: async (event) => {
        published += 1;
        return { ...event, sequence_number: 1 };
      },
    },
  }, { concurrency: 1 });
  workers.push(worker);
  await QueueDispatcher.enqueueRealtime({
    type: "PUBLISH_EVENT",
    event: {
      event_id: `redis-smoke-event-${Date.now()}`,
      event_type: "DASHBOARD_SNAPSHOT_UPDATED",
      entity_type: "artist",
      entity_id: "redis-smoke-artist",
      artist_id: "redis-smoke-artist",
      channels: ["artist:redis-smoke-artist"],
      sequence_key: "redis-smoke",
      payload: {},
      occurred_at: new Date().toISOString(),
    },
  });
  await waitFor("realtime publish", () => published === 1);
});

await run("queue metrics", async () => {
  const runtime = new WorkerRuntime();
  const snapshots = await runtime.collectMetrics();
  if (snapshots.length !== activeQueues.length) throw new Error(`Expected ${activeQueues.length} snapshots, got ${snapshots.length}`);
  const email = snapshots.find((snapshot) => snapshot.queueName === queueNames.email);
  if (!email) throw new Error("Email metrics missing");
});

for (const worker of workers.reverse()) {
  await worker.close().catch(() => undefined);
}
await queueFactory.closeQueues().catch(() => undefined);
await redis.closeRedisConnection().catch(() => undefined);

const output = {
  ok: failures.length === 0,
  redis: {
    status: failures.some((failure) => failure.check === "redis connectivity") ? "failed" : "connected",
    urlScheme: process.env.REDIS_URL?.startsWith("rediss://") ? "rediss" : "other",
    prefix: smokePrefix,
  },
  activeQueues,
  workerStatus: failures.some((failure) => failure.check === "worker registration") ? "failed" : "registered",
  passed,
  failedQueues: failures,
};

console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exit(1);
