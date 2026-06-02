import express, { type NextFunction, type Request, type Response } from "express";
import { inspectDeadLetterQueue, inspectQueue, retryQueueJob } from "../queue/queueFactory";
import { queueNames } from "../queue/queueNames";
import type { WorkerRuntime } from "../workers/runtime/workerRuntime";
import { AdminRecoveryService } from "../admin/recoveryService";
import { PasswordResetService } from "../auth/passwordResetService";
import { validateProductionEnvironment } from "../config/environmentValidation";
import { loadRuntimeEnv, logRuntimeEnv } from "../config/envLoader";
import { getClientIp, checkRateLimit, rateLimitRules, suspiciousActivityLog } from "../security/rateLimiter";
import { logger, serializeError } from "../observability/logger";
import { traceFromHeaders } from "../observability/tracing";
import { ResendWebhookService } from "../webhooks/resendWebhookService";

const queueSet = new Set(Object.values(queueNames).filter((value) => typeof value === "string") as string[]);

export function startOperationsServer(runtime: WorkerRuntime, options: { port?: number; recovery?: AdminRecoveryService } = {}) {
  logRuntimeEnv("operations-server");
  const recovery = options.recovery || lazyRecovery();
  let passwordReset: PasswordResetService | null = null;
  let resendWebhooks: ResendWebhookService | null = null;
  const port = options.port || Number(readEnv("PORT") || readEnv("WORKER_HTTP_PORT") || 3000);
  const app = express();

  app.use(express.raw({ type: "*/*", limit: "2mb" }));
  app.use((req, res, next) => {
    Object.entries(corsHeaders()).forEach(([name, value]) => res.setHeader(name, value));
    if (req.method === "OPTIONS") return res.status(204).end();

    const trace = traceFromHeaders(req.headers);
    const ip = getClientIp(req.headers, req.socket.remoteAddress);
    const rate = checkRateLimit(rateLimitRules.api, ip);
    if (!rate.allowed) {
      suspiciousActivityLog({ category: "api", ip, actorUserId: trace.actorUserId, reason: "operations endpoint rate limit" });
      return res.status(429).json({ error: "RATE_LIMITED", traceId: trace.traceId });
    }
    return next();
  });

  app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/readyz", (_req, res) => {
    const env = validateProductionEnvironment();
    return res.status(env.ok ? 200 : 503).json(env);
  });
  app.get("/metrics", asyncHandler(async (_req, res) => {
    const metrics = await runtime.prometheusMetrics();
    res.type("text/plain; version=0.0.4").send(metrics);
  }));
  app.post("/queues/pause", asyncHandler(async (_req, res) => {
    await runtime.pauseAll();
    res.status(200).json({ ok: true });
  }));
  app.post("/queues/resume", asyncHandler(async (_req, res) => {
    await runtime.resumeAll();
    res.status(200).json({ ok: true });
  }));

  app.all(/^\/queues\/([^/]+)(?:\/(retry|dlq))?$/, asyncHandler(async (req, res) => {
    const queueName = req.params[0];
    const action = req.params[1];
    if (!queueSet.has(queueName)) return res.status(404).json({ error: "UNKNOWN_QUEUE" });
    if (req.method === "GET" && !action) return res.status(200).json(await inspectQueue(queueName as any));
    if (req.method === "POST" && action === "retry") {
      const body = readJson(req);
      await retryQueueJob(queueName as any, String(body.jobId));
      return res.status(200).json({ ok: true });
    }
    if (req.method === "GET" && action === "dlq") return res.status(200).json(await recovery.inspectDeadLetters(queueName));
    return res.status(404).json({ error: "NOT_FOUND" });
  }));

  app.post("/admin/recovery/email", asyncHandler(async (req, res) => {
    const body = readJson(req);
    res.status(200).json(await recovery.replayFailedEmail(String(body.emailQueueId)));
  }));
  app.post("/admin/recovery/distribution", asyncHandler(async (req, res) => {
    const body = readJson(req);
    await recovery.replayDistributionJob(String(body.jobId));
    res.status(200).json({ ok: true });
  }));
  app.post("/admin/recovery/payout", asyncHandler(async (req, res) => {
    const body = readJson(req);
    await recovery.replayPayoutJob(String(body.jobId));
    res.status(200).json({ ok: true });
  }));
  app.post("/admin/recovery/webhook", asyncHandler(async (req, res) => {
    const body = readJson(req);
    await recovery.replayWebhookFailure(String(body.eventId));
    res.status(200).json({ ok: true });
  }));
  app.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const body = readJson(req);
    const result = await (passwordReset ||= new PasswordResetService()).forgotPassword(String(body.email || ""), String(body.redirectTo || "") || undefined);
    res.status(202).json({ ok: true, accepted: result.accepted });
  }));
  app.post("/api/webhooks/resend", asyncHandler(async (req, res) => {
    const rawBody = readRaw(req);
    res.status(200).json(await (resendWebhooks ||= new ResendWebhookService()).handle(rawBody, req.headers));
  }));

  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const trace = traceFromHeaders(req.headers);
    logger.error("operations endpoint failed", { component: "operations-server", traceId: trace.traceId, error: serializeError(error) });
    const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
    res.status(status).json({ error: status === 500 ? "INTERNAL_ERROR" : (error as any)?.code || "REQUEST_FAILED", traceId: trace.traceId });
  });

  const server = app.listen(port, () => logger.info("operations server listening", { component: "operations-server", port, framework: "express" }));
  return {
    server,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function lazyRecovery() {
  let service: AdminRecoveryService | null = null;
  return {
    replayFailedEmail: (id: string) => (service ||= new AdminRecoveryService()).replayFailedEmail(id),
    replayDistributionJob: (id: string) => (service ||= new AdminRecoveryService()).replayDistributionJob(id),
    replayPayoutJob: (id: string) => (service ||= new AdminRecoveryService()).replayPayoutJob(id),
    replayWebhookFailure: (id: string) => (service ||= new AdminRecoveryService()).replayWebhookFailure(id),
    inspectDeadLetters: (queue: string, start?: number, end?: number) => inspectDeadLetterQueue(queue, start, end),
  };
}

function asyncHandler(handler: (req: Request, res: Response) => Promise<void | Response>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req, res)).catch(next);
  };
}

function readJson(req: Request): Record<string, unknown> {
  const raw = readRaw(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function readRaw(req: Request): string {
  return Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": readEnv("CORS_ORIGIN") || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, svix-id, svix-timestamp, svix-signature",
  };
}

function readEnv(name: string) {
  loadRuntimeEnv();
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env[name]
    : undefined;
}
