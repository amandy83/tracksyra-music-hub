import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";

export class RevenueVsStreamMismatchRule implements FraudRule {
  readonly code = "REVENUE_VS_STREAM_MISMATCH" as const;

  evaluate(features: FraudFeatureVector): FraudRuleResult | null {
    if (features.streams_last_day <= 0 || features.revenue_last_day <= 0) return null;
    const revenuePerStream = features.revenue_last_day / features.streams_last_day;
    if (revenuePerStream <= 0.02) return null;

    return {
      rule: this.code,
      severity: revenuePerStream > 0.05 ? "high" : "medium",
      scoreImpact: revenuePerStream > 0.05 ? 30 : 18,
      explanation: "Revenue is high without proportional stream volume",
      metadata: { revenue_last_day: features.revenue_last_day, streams_last_day: features.streams_last_day, revenue_per_stream: revenuePerStream },
    };
  }
}
