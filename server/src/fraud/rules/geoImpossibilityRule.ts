import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";

export class GeoImpossibilityRule implements FraudRule {
  readonly code = "GEO_IMPOSSIBILITY" as const;

  evaluate(features: FraudFeatureVector): FraudRuleResult | null {
    if (features.distinct_countries_last_5m < 5) return null;

    return {
      rule: this.code,
      severity: features.distinct_countries_last_5m >= 8 ? "high" : "medium",
      scoreImpact: features.distinct_countries_last_5m >= 8 ? 30 : 20,
      explanation: "Streams arrived from an unrealistic number of countries in a short window",
      metadata: { distinct_countries_last_5m: features.distinct_countries_last_5m },
    };
  }
}
