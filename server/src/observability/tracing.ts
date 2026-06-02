import { randomUUID } from "crypto";

export type TraceContext = {
  traceId: string;
  correlationId: string;
  actorUserId: string | null;
};

export function createTraceContext(input: Partial<TraceContext> = {}): TraceContext {
  const traceId = input.traceId || randomUUID();
  return {
    traceId,
    correlationId: input.correlationId || traceId,
    actorUserId: input.actorUserId ?? null,
  };
}

export function traceFromHeaders(headers: Record<string, string | string[] | undefined>): TraceContext {
  const traceId = headerValue(headers["x-trace-id"]) || headerValue(headers["traceparent"]) || randomUUID();
  return {
    traceId,
    correlationId: headerValue(headers["x-correlation-id"]) || traceId,
    actorUserId: headerValue(headers["x-actor-user-id"]) || null,
  };
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
