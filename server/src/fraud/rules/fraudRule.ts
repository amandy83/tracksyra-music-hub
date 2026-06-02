import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";

export type FraudRule = {
  readonly code: FraudRuleResult["rule"];
  evaluate(features: FraudFeatureVector): FraudRuleResult | null;
};

export function clampFraudScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
