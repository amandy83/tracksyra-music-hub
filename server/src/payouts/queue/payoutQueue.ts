import { enqueueWithDefaults } from "../../queue/queueFactory";
import { createJobTrace, type PayoutJob } from "../../queue/jobTypes";
import { queueNames } from "../../queue/queueNames";
import { checkRateLimit, rateLimitRules, suspiciousActivityLog } from "../../security/rateLimiter";

export async function enqueuePayoutJob(input: {
  payout_id: string;
  correlation_id: string;
  actor?: string | null;
}) {
  const abuse = checkRateLimit(rateLimitRules.payout, input.actor || input.payout_id);
  if (!abuse.allowed) {
    suspiciousActivityLog({
      category: "payout",
      ip: "worker",
      actorUserId: input.actor ?? null,
      reason: "payout queue abuse limit",
      metadata: { payout_id: input.payout_id },
    });
    throw new Error("Payout abuse limit exceeded");
  }
  const trace = createJobTrace({
    idempotencyKey: `payout:${input.payout_id}:${input.correlation_id}`,
    traceId: input.correlation_id,
    correlationId: input.correlation_id,
    actorUserId: input.actor ?? null,
    sourceSystem: "api",
  });
  const job: PayoutJob = { ...trace, ...input };
  return enqueueWithDefaults(queueNames.payout, "payout.process", job);
}
