import { logger } from "../observability/logger";

export type RateLimitRule = {
  windowMs: number;
  max: number;
  name: string;
};

export const rateLimitRules = {
  api: { name: "api", windowMs: 60_000, max: 600 },
  upload: { name: "upload", windowMs: 60_000, max: 30 },
  webhook: { name: "webhook", windowMs: 60_000, max: 300 },
  payout: { name: "payout", windowMs: 60_000, max: 20 },
} satisfies Record<string, RateLimitRule>;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(rule: RateLimitRule, identity: string) {
  const key = `${rule.name}:${identity}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.max - 1, resetAt: now + rule.windowMs };
  }

  bucket.count += 1;
  const allowed = bucket.count <= rule.max;
  if (!allowed) {
    logger.warn("rate limit exceeded", { rule: rule.name, identity, count: bucket.count, max: rule.max });
  }
  return { allowed, remaining: Math.max(rule.max - bucket.count, 0), resetAt: bucket.resetAt };
}

export function suspiciousActivityLog(input: {
  category: "upload" | "webhook" | "payout" | "api";
  ip: string;
  actorUserId?: string | null;
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  logger.warn("suspicious activity", input);
}

export function getClientIp(headers: Record<string, string | string[] | undefined>, socketAddress?: string | null) {
  const forwarded = value(headers["x-forwarded-for"]);
  if (forwarded) return forwarded.split(",")[0].trim();
  return value(headers["x-real-ip"]) || socketAddress || "unknown";
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
