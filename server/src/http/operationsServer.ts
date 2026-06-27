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
import {
  TooLostCredentialStore,
  TOO_LOST_APPROVED_SCOPES,
  getTooLostProviderHealth,
  readTooLostConfig,
} from "../distribution/providers/too-lost";
import { TooLostIntegrationService } from "../distribution/providers/too-lost/tooLostIntegrationService";
import { TooLostWebhookController } from "../distribution/webhooks";
import { SqlDistributionStore } from "../distribution/services/distributionStore";
import { SequelizeSqlExecutor } from "../distribution/services/sequelizeSqlExecutor";

const queueSet = new Set(Object.values(queueNames).filter((value) => typeof value === "string") as string[]);

export async function startOperationsServer(runtime: WorkerRuntime, options: { port?: number; recovery?: AdminRecoveryService } = {}) {
  logRuntimeEnv("operations-server");
  const recovery = options.recovery || lazyRecovery();
  let passwordReset: PasswordResetService | null = null;
  let resendWebhooks: ResendWebhookService | null = null;
  let tooLostWebhooks: TooLostWebhookController | null = null;
  let tooLostCredentials: TooLostCredentialStore | null = null;
  let tooLostIntegration: TooLostIntegrationService | null = null;
  let tooLostDb: SequelizeSqlExecutor | null = null;
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
  app.get("/api/distribution/too-lost/health", asyncHandler(async (_req, res) => {
    const health = getTooLostProviderHealth(readTooLostConfig());
    await optionalTooLostCredentialStore(() => tooLostCredentials ||= new TooLostCredentialStore(), async (store) => {
      await store.syncProviderConfiguration();
      await store.initializePendingCredentialRecord();
      await store.recordHealth(health);
    });
    res.status(200).json(health);
  }));
  app.get("/api/distribution/too-lost/oauth/authorize", asyncHandler(async (_req, res) => {
    const service = getTooLostIntegrationService();
    const returnToPath = safeReturnToPath(typeof _req.query.returnTo === "string" ? _req.query.returnTo : null) ?? "/dashboard";
    const result = service.buildAuthorizationUrl({ returnToPath });
    await optionalTooLostCredentialStore(() => tooLostCredentials ||= new TooLostCredentialStore(), async (store) => {
      await store.storeOAuthState({
        state: result.state,
        codeVerifier: result.codeVerifier,
        redirectUri: readTooLostConfig().redirectUri,
        returnToPath,
        scopes: [...TOO_LOST_APPROVED_SCOPES],
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
      await store.recordSandboxRun({
        runType: "oauth",
        status: "PASS",
        request: { authorizeUrl: "[REDACTED]" },
        response: { state: result.state, returnToPath },
      });
    });
    res.status(200).json({ url: result.url, state: result.state, codeVerifier: "[SERVER_STORED]" });
  }));
  app.get("/api/distribution/too-lost/oauth/callback", asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    const errorDescription = typeof req.query.error_description === "string" ? req.query.error_description : "";

    if (error) {
      return res.status(400).json({ ok: false, error, error_description: errorDescription || null });
    }
    if (!code || !state) {
      return res.status(400).json({ ok: false, error: "MISSING_CODE_OR_STATE" });
    }

    const service = getTooLostIntegrationService();
    const result = await service.handleOAuthCallback({ code, state });
    const redirectTo = result.redirectTo || "/dashboard";
    if (acceptsHtml(req)) return res.redirect(302, redirectTo);
    res.status(200).json({ ok: true, connection: result.connection, redirectTo });
  }));
  app.get("/api/distribution/too-lost/status", asyncHandler(async (_req, res) => {
    const service = getTooLostIntegrationService();
    res.status(200).json(await service.getStatus());
  }));
  app.post("/api/distribution/too-lost/disconnect", asyncHandler(async (req, res) => {
    const body = readJson(req);
    const service = getTooLostIntegrationService();
    const status = await service.disconnect(typeof body.reason === "string" ? body.reason : "Disconnected by operator");
    res.status(200).json({ ok: true, status });
  }));
  app.post("/api/distribution/too-lost/sync-now", asyncHandler(async (req, res) => {
    const body = readJson(req);
    const service = getTooLostIntegrationService();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const payload = body.payload ?? null;
    const result = await service.syncNow({ userId, payload });
    res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/distribution/too-lost/releases/:releaseId/submit", asyncHandler(async (req, res) => {
    const service = getTooLostIntegrationService();
    const result = await service.submitRelease(req.params.releaseId);
    res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/distribution/too-lost/releases/:releaseId/update", asyncHandler(async (req, res) => {
    const service = getTooLostIntegrationService();
    const result = await service.updateRelease(req.params.releaseId);
    res.status(200).json({ ok: true, ...result });
  }));
  app.get("/api/distribution/too-lost/releases/:releaseId/status", asyncHandler(async (req, res) => {
    const service = getTooLostIntegrationService();
    res.status(200).json({ ok: true, status: await service.fetchReleaseStatus(req.params.releaseId) });
  }));
  app.get("/api/distribution/too-lost/releases/:releaseId/distribution-status", asyncHandler(async (req, res) => {
    const service = getTooLostIntegrationService();
    res.status(200).json({ ok: true, status: await service.fetchDistributionStatus(req.params.releaseId) });
  }));
  app.post("/api/distribution/too-lost/analytics/import", asyncHandler(async (req, res) => {
    const body = readJson(req);
    const service = getTooLostIntegrationService();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const result = await service.importAnalytics({ userId, payload: body.payload ?? body });
    res.status(200).json({ ok: true, ...result });
  }));
  app.post("/api/distribution/too-lost/sandbox/:runType", asyncHandler(async (req, res) => {
    const runType = req.params.runType;
    if (!["oauth", "release_submission", "analytics_sync", "webhook", "failure_recovery"].includes(runType)) {
      return res.status(400).json({ error: "UNKNOWN_SANDBOX_RUN_TYPE" });
    }
    const body = readJson(req);
    await (tooLostCredentials ||= new TooLostCredentialStore()).recordSandboxRun({
      runType: runType as "oauth" | "release_submission" | "analytics_sync" | "webhook" | "failure_recovery",
      status: String(body.status || "PASS") as "PASS" | "WARN" | "FAIL" | "SKIPPED",
      request: body.request ?? { mode: "sandbox" },
      response: body.response ?? { ok: true },
      notes: typeof body.notes === "string" ? body.notes : "No live Too Lost API call performed.",
    });
    res.status(202).json({ ok: true });
  }));
  app.post("/api/webhooks/too-lost", asyncHandler(async (req, res) => {
    tooLostWebhooks ||= createTooLostWebhookController();
    const rawBody = readRaw(req);
    res.status(200).json(await tooLostWebhooks.handle({ body: rawBody, headers: req.headers }));
  }));

  await optionalTooLostCredentialStore(() => tooLostCredentials ||= new TooLostCredentialStore(), async (store) => {
    await store.syncProviderConfiguration();
    await store.initializePendingCredentialRecord();
  });

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

function createTooLostWebhookController() {
  const db = new SequelizeSqlExecutor();
  return new TooLostWebhookController({
    db,
    distributionStore: new SqlDistributionStore(db),
  });
}

function getTooLostIntegrationService() {
  tooLostDb ||= new SequelizeSqlExecutor();
  tooLostCredentials ||= new TooLostCredentialStore();
  tooLostIntegration ||= new TooLostIntegrationService(new SqlDistributionStore(tooLostDb), tooLostDb, {
    credentialStore: tooLostCredentials,
  });
  return tooLostIntegration;
}

async function optionalTooLostCredentialStore(
  getStore: () => TooLostCredentialStore,
  action: (store: TooLostCredentialStore) => Promise<void>,
) {
  try {
    await action(getStore());
  } catch (error) {
    logger.warn("too lost credential store unavailable", {
      component: "operations-server",
      error: serializeError(error),
    });
  }
}

function readJson(req: Request): Record<string, unknown> {
  const raw = readRaw(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function readRaw(req: Request): string {
  return Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
}

function acceptsHtml(req: Request) {
  return String(req.headers.accept || "").includes("text/html");
}

function safeReturnToPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
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
