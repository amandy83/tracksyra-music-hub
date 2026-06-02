import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";
import { StreamSpikeAnomalyRule } from "./streamSpikeAnomalyRule";
import { GeoImpossibilityRule } from "./geoImpossibilityRule";
import { RepeatEventBurstRule } from "./repeatEventBurstRule";
import { LowRetentionPatternRule } from "./lowRetentionPatternRule";
import { RevenueVsStreamMismatchRule } from "./revenueVsStreamMismatchRule";

export class FraudRuleEngine {
  constructor(private rules: FraudRule[] = defaultFraudRules()) {}

  evaluate(features: FraudFeatureVector): FraudRuleResult[] {
    return this.rules.flatMap((rule) => {
      const result = rule.evaluate(features);
      return result ? [result] : [];
    });
  }
}

export function defaultFraudRules(): FraudRule[] {
  return [
    new StreamSpikeAnomalyRule(),
    new GeoImpossibilityRule(),
    new RepeatEventBurstRule(),
    new LowRetentionPatternRule(),
    new RevenueVsStreamMismatchRule(),
  ];
}
