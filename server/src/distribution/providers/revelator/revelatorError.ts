import type { DistributionPlatformName } from "../../models/distributionTypes";
import type { RevelatorError } from "./revelatorTypes";

export function normalizeRevelatorError(error: unknown, platform: DistributionPlatformName = "revelator"): RevelatorError {
  if (isRevelatorError(error)) return error;

  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : null;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 401 || status === 403) {
    return { errorCode: "AUTH_ERROR", message: "Revelator authentication failed", platform, provider: "revelator", retryable: false };
  }

  if (status === 400 || status === 422) {
    return { errorCode: "VALIDATION_ERROR", message, platform, provider: "revelator", retryable: false };
  }

  if (status === 429) {
    return { errorCode: "RATE_LIMIT_ERROR", message, platform, provider: "revelator", retryable: true };
  }

  return { errorCode: "NETWORK_ERROR", message, platform, provider: "revelator", retryable: true };
}

export function isRevelatorError(error: unknown): error is RevelatorError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "errorCode" in error &&
      "message" in error &&
      "retryable" in error &&
      (error as { provider?: unknown }).provider === "revelator",
  );
}

