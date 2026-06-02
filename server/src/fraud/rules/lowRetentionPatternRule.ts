import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";

export class LowRetentionPatternRule implements FraudRule {
  readonly code = "LOW_RETENTION_PATTERN" as const;

  evaluate(features: FraudFeatureVector): FraudRuleResult | null {
    const currentShortListen = typeof features.listen_duration_seconds === "number" && features.listen_duration_seconds < 15;
    if (!currentShortListen && features.short_duration_events_last_10m < 20) return null;
    if (features.short_duration_events_last_10m < 10 && features.stream_count_increment < 10) return null;

    return {
      rule: this.code,
      severity: features.short_duration_events_last_10m >= 50 ? "high" : "medium",
      scoreImpact: features.short_duration_events_last_10m >= 50 ? 28 : 18,
      explanation: "Repeated low-retention streams detected",
      metadata: {
        listen_duration_seconds: features.listen_duration_seconds ?? null,
        short_duration_events_last_10m: features.short_duration_events_last_10m,
      },
    };
  }
}
