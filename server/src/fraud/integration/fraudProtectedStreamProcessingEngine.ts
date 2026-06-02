import type { NormalizedStreamEvent, StreamProcessingResult } from "../../ingestion/streams";
import type { StreamProcessingEngine } from "../../ingestion/streams";
import type { FraudDetectionEngine } from "../detectors";
import type { FraudReviewQueue } from "../review/fraudReviewQueue";
import type { FraudAnalyticsService } from "../analytics";

export type FraudProtectedStreamProcessingEngineDeps = {
  fraudDetectionEngine: Pick<FraudDetectionEngine, "analyzeStreamEvent">;
  cleanProcessingEngine: Pick<StreamProcessingEngine, "processEvents">;
  reviewQueue?: Pick<FraudReviewQueue, "enqueueSuspiciousEvent">;
  fraudAnalyticsService?: Pick<FraudAnalyticsService, "persistSnapshot">;
};

export type FraudProtectedStreamProcessingResult = StreamProcessingResult & {
  clean: number;
  suspicious: number;
  blocked: number;
  fraud_event_ids: string[];
};

export class FraudProtectedStreamProcessingEngine {
  constructor(private deps: FraudProtectedStreamProcessingEngineDeps) {}

  async processEvents(input: {
    batchId: string;
    provider: string;
    events: NormalizedStreamEvent[];
  }): Promise<FraudProtectedStreamProcessingResult> {
    const cleanEvents: NormalizedStreamEvent[] = [];
    const fraudEventIds: string[] = [];
    let suspicious = 0;
    let blocked = 0;

    for (const event of input.events) {
      const score = await this.deps.fraudDetectionEngine.analyzeStreamEvent(event);
      fraudEventIds.push(score.fraud_event_id);
      if (score.decision === "CLEAN") {
        cleanEvents.push(event);
      } else if (score.decision === "SUSPICIOUS") {
        suspicious += 1;
        await this.deps.reviewQueue?.enqueueSuspiciousEvent(score.fraud_event_id);
      } else {
        blocked += 1;
      }
    }

    const processed = cleanEvents.length
      ? await this.deps.cleanProcessingEngine.processEvents({
        ...input,
        events: cleanEvents,
      })
      : {
        received: 0,
        inserted: 0,
        duplicates: 0,
        processed_event_ids: [],
        royalty_recalculation_keys: [],
      };

    await this.deps.fraudAnalyticsService?.persistSnapshot();

    return {
      ...processed,
      received: input.events.length,
      clean: cleanEvents.length,
      suspicious,
      blocked,
      fraud_event_ids: fraudEventIds,
    };
  }
}
