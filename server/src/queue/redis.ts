import IORedis, { type RedisOptions } from "ioredis";
import { loadRuntimeEnv } from "../config/envLoader";

export type QueueEnvironment = {
  redisUrl?: string;
  queuePrefix: string;
  workerConcurrency: number;
  metricsEnabled: boolean;
  nodeEnv: string;
  redisRequired: boolean;
};

let redisConnection: IORedis | null = null;
let redisAvailable: boolean | null = null;

export function readQueueEnvironment(): QueueEnvironment {
  loadRuntimeEnv();
  const env = getProcessEnv();
  const nodeEnv = env.NODE_ENV || "development";
  const redisUrl = env.REDIS_URL;
  const workerConcurrency = Number(env.WORKER_CONCURRENCY || 5);

  return {
    redisUrl,
    queuePrefix: env.QUEUE_PREFIX || "tracksyra",
    workerConcurrency: Number.isFinite(workerConcurrency) && workerConcurrency > 0 ? workerConcurrency : 5,
    metricsEnabled: env.QUEUE_METRICS_ENABLED !== "false",
    nodeEnv,
    redisRequired: nodeEnv === "production",
  };
}

export function validateQueueEnvironment() {
  const config = readQueueEnvironment();
  if (config.redisRequired && !config.redisUrl) {
    throw new Error("REDIS_URL is required when NODE_ENV=production.");
  }
  return config;
}

export function isRedisQueueEnabled() {
  const config = validateQueueEnvironment();
  return Boolean(config.redisUrl);
}

export function getRedisConnection(): IORedis {
  if (redisConnection) return redisConnection;

  const config = validateQueueEnvironment();
  if (!config.redisUrl) {
    throw new Error("Redis is not configured. Set REDIS_URL to enable BullMQ queues.");
  }

  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5000),
    reconnectOnError: () => true,
  };

  redisConnection = new IORedis(config.redisUrl, options);
  redisConnection.on("ready", () => {
    redisAvailable = true;
  });
  redisConnection.on("error", (error) => {
    redisAvailable = false;
    if (config.nodeEnv !== "test") console.warn("[queue:redis] Redis connection error", error.message);
  });
  redisConnection.on("end", () => {
    redisAvailable = false;
  });

  return redisConnection;
}

export async function checkRedisHealth(): Promise<boolean> {
  if (!isRedisQueueEnabled()) return false;
  try {
    const redis = getRedisConnection();
    if (redis.status === "wait") await redis.connect();
    await redis.ping();
    redisAvailable = true;
    return true;
  } catch (error) {
    redisAvailable = false;
    if (readQueueEnvironment().redisRequired) throw error;
    console.warn("[queue:redis] Redis unavailable; using development queue fallback.");
    return false;
  }
}

export function getRedisAvailability() {
  return redisAvailable === true;
}

export async function closeRedisConnection() {
  if (!redisConnection) return;
  const connection = redisConnection;
  redisConnection = null;
  redisAvailable = null;
  await connection.quit().catch(() => connection.disconnect());
}

function getProcessEnv(): Record<string, string | undefined> {
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env
    : {};
}
