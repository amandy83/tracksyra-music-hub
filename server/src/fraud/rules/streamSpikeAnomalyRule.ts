import type { FraudFeatureVector, FraudRuleResult } from "../models/fraudTypes";
import type { FraudRule } from "./fraudRule";

export class StreamSpikeAnomalyRule implements FraudRule {
  readonly code = "STREAM_SPIKE_ANOMALY" as const;

  evaluate(features: FraudFeatureVector): FraudRuleResult | null {
    const previous = features.previous_hour_streams;
    const current = features.stream_count_increment;
    const spikeRatio = previous > 0 ? current / previous : current >= 1000 ? 4 : 0;
    if (spikeRatio <= 3) return null;

    return {
      rule: this.code,
      severity: spikeRatio > 8 ? "high" : "medium",
      scoreImpact: spikeRatio > 8 ? 35 : 24,
      explanation: `Stream increase exceeded 300% within one hour for track ${features.track_id}`,
      metadata: { previous_hour_streams: previous, current_increment: current, spike_ratio: spikeRatio },
    };
  }
}
