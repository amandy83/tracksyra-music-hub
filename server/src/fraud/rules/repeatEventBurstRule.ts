import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";

export class RepeatEventBurstRule implements FraudRule {
  readonly code = "REPEAT_EVENT_BURST" as const;

  evaluate(features: FraudFeatureVector): FraudRuleResult | null {
    if (!features.device_fingerprint && !features.ip_fingerprint) return null;
    if (features.same_fingerprint_events_last_10m < 25) return null;

    return {
      rule: this.code,
      severity: features.same_fingerprint_events_last_10m >= 75 ? "high" : "medium",
      scoreImpact: features.same_fingerprint_events_last_10m >= 75 ? 32 : 22,
      explanation: "Repeated stream burst detected from the same IP or device pattern",
      metadata: { same_fingerprint_events_last_10m: features.same_fingerprint_events_last_10m },
    };
  }
}
