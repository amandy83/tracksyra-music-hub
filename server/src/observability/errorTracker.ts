import { logger, serializeError, type LogContext } from "./logger";
import { loadRuntimeEnv } from "../config/envLoader";

export type CapturedError = {
  error: unknown;
  context?: LogContext;
  tags?: Record<string, string>;
};

export async function captureException(input: CapturedError) {
  const error = serializeError(input.error);
  logger.error("exception captured", { ...input.context, tags: input.tags, error });

  const dsn = readEnv("SENTRY_DSN");
  if (!dsn) return;

  try {
    await fetch(dsn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        platform: "node",
        level: "error",
        exception: error,
        tags: input.tags,
        contexts: { tracksyra: input.context },
      }),
    });
  } catch (sendError) {
    logger.warn("sentry-compatible error capture failed", { error: serializeError(sendError) });
  }
}

export function captureMessage(message: string, context: LogContext = {}) {
  logger.warn(message, context);
}

function readEnv(name: string) {
  loadRuntimeEnv();
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env[name]
    : undefined;
}
