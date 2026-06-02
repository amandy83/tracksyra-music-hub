import type { NormalizedStreamEvent } from "../../ingestion/streams";
import type { FraudScore } from "../models/fraudTypes";
import { clampFraudScore } from "../rules";
import type { FraudRuleEngine } from "../rules";
import type { FraudFeatureExtractor } from "./featureExtractor";
import type { FraudStore } from "../services/fraudStore";

export type FraudDetectionEngineDeps = {
  featureExtractor: FraudFeatureExtractor;
  ruleEngine: FraudRuleEngine;
  store: FraudStore;
};

export class FraudDetectionEngine {
  constructor(private deps: FraudDetectionEngineDeps) {}

  async analyzeStreamEvent(event: NormalizedStreamEvent): Promise<FraudScore> {
    const featureVector = await this.deps.featureExtractor.extractStreamFeatures(event);
    const reasons = this.deps.ruleEngine.evaluate(featureVector);
    const score = clampFraudScore(reasons.reduce((sum, reason) => sum + reason.scoreImpact, 0));
    const decision = score >= 70 ? "BLOCKED" : score >= 35 ? "SUSPICIOUS" : "CLEAN";

    const fraudEvent = await this.deps.store.appendFraudEvent({
      event,
      userId: featureVector.user_id,
      decision,
      score,
      reasons,
      featureVector,
    });

    return { fraud_event_id: fraudEvent.id, score, decision, reasons, featureVector };
  }

  async analyzeRoyaltySpike(input: {
    trackId: string;
    platform: string;
    revenueLastDay: number;
    streamsLastDay: number;
  }): Promise<Omit<FraudScore, "featureVector" | "fraud_event_id">> {
    const revenuePerStream = input.streamsLastDay > 0 ? input.revenueLastDay / input.streamsLastDay : input.revenueLastDay;
    const score = clampFraudScore(revenuePerStream > 0.05 ? 80 : revenuePerStream > 0.02 ? 45 : 0);
    return {
      score,
      decision: score >= 70 ? "BLOCKED" : score >= 35 ? "SUSPICIOUS" : "CLEAN",
      reasons: score
        ? [{
          rule: "REVENUE_VS_STREAM_MISMATCH",
          severity: score >= 70 ? "high" : "medium",
          scoreImpact: score,
          explanation: "Royalty spike exceeded expected revenue-to-stream ratio",
          metadata: { ...input, revenue_per_stream: revenuePerStream },
        }]
        : [],
    };
  }

  async analyzeDistributionAnomaly(input: {
    trackId: string;
    failuresLastDay: number;
  }): Promise<{ score: number; decision: "CLEAN" | "SUSPICIOUS" | "BLOCKED"; explanation: string | null }> {
    const score = clampFraudScore(input.failuresLastDay >= 10 ? 60 : input.failuresLastDay >= 5 ? 35 : 0);
    return {
      score,
      decision: score >= 70 ? "BLOCKED" : score >= 35 ? "SUSPICIOUS" : "CLEAN",
      explanation: score ? "Distribution failures or rejections exceeded normal thresholds" : null,
    };
  }
}
