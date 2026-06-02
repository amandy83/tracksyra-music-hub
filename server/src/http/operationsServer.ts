import { createServer, type IncomingMessage, type ServerResponse } from "http";
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

  const server = createServer(async (req, res) => {
    const trace = traceFromHeaders(req.headers);
    const ip = getClientIp(req.headers, req.socket.remoteAddress);
    const rate = checkRateLimit(rateLimitRules.api, ip);
    if (!rate.allowed) {
      suspiciousActivityLog({ category: "api", ip, actorUserId: trace.actorUserId, reason: "operations endpoint rate limit" });
      return sendJson(res, 429, { error: "RATE_LIMITED", traceId: trace.traceId });
    }

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (req.method === "OPTIONS") return sendCors(res);
      if (req.method === "GET" && url.pathname === "/healthz") return sendJson(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname === "/readyz") {
        const env = validateProductionEnvironment();
        return sendJson(res, env.ok ? 200 : 503, env);
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        const metrics = await runtime.prometheusMetrics();
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
        return res.end(metrics);
      }
      if (req.method === "POST" && url.pathname === "/queues/pause") {
        await runtime.pauseAll();
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/queues/resume") {
        await runtime.resumeAll();
        return sendJson(res, 200, { ok: true });
      }

      const match = url.pathname.match(/^\/queues\/([^/]+)(?:\/(retry|dlq))?$/);
      if (match) {
        const queueName = match[1];
        if (!queueSet.has(queueName)) return sendJson(res, 404, { error: "UNKNOWN_QUEUE" });
        if (req.method === "GET" && !match[2]) {
          return sendJson(res, 200, await inspectQueue(queueName as any));
        }
        if (req.method === "POST" && match[2] === "retry") {
          const body = await readJson(req);
          await retryQueueJob(queueName as any, String(body.jobId));
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === "GET" && match[2] === "dlq") {
          return sendJson(res, 200, await recovery.inspectDeadLetters(queueName));
        }
      }

      if (req.method === "POST" && url.pathname === "/admin/recovery/email") {
        const body = await readJson(req);
        return sendJson(res, 200, await recovery.replayFailedEmail(String(body.emailQueueId)));
      }
      if (req.method === "POST" && url.pathname === "/admin/recovery/distribution") {
        const body = await readJson(req);
        await recovery.replayDistributionJob(String(body.jobId));
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/admin/recovery/payout") {
        const body = await readJson(req);
        await recovery.replayPayoutJob(String(body.jobId));
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/admin/recovery/webhook") {
        const body = await readJson(req);
        await recovery.replayWebhookFailure(String(body.eventId));
        return sendJson(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
        const body = await readJson(req);
        const result = await (passwordReset ||= new PasswordResetService()).forgotPassword(String(body.email || ""), String(body.redirectTo || "") || undefined);
        return sendJson(res, 202, { ok: true, accepted: result.accepted });
      }
      if (req.method === "POST" && url.pathname === "/api/webhooks/resend") {
        const rawBody = await readRaw(req);
        return sendJson(res, 200, await (resendWebhooks ||= new ResendWebhookService()).handle(rawBody, req.headers));
      }

      return sendJson(res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      logger.error("operations endpoint failed", { component: "operations-server", traceId: trace.traceId, error: serializeError(error) });
      const status = typeof (error as any)?.status === "number" ? (error as any).status : 500;
      return sendJson(res, status, { error: status === 500 ? "INTERNAL_ERROR" : (error as any)?.code || "REQUEST_FAILED", traceId: trace.traceId });
    }
  });

  server.listen(port, () => logger.info("operations server listening", { component: "operations-server", port }));
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

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRaw(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

async function readRaw(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, corsHeaders({ "Content-Type": "application/json" }));
  res.end(JSON.stringify(body));
}

function sendCors(res: ServerResponse) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": readEnv("CORS_ORIGIN") || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, svix-id, svix-timestamp, svix-signature",
    ...extra,
  };
}

function readEnv(name: string) {
  loadRuntimeEnv();
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env[name]
    : undefined;
}
