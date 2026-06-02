import type { StreamProcessingEngine } from "../../ingestion/streams";
import type { FraudReviewDecision } from "../models/fraudTypes";
import type { FraudStore } from "../services/fraudStore";

export type FraudReviewQueueDeps = {
  store: FraudStore;
  processingEngine?: Pick<StreamProcessingEngine, "processEvents">;
};

export class FraudReviewQueue {
  constructor(private deps: FraudReviewQueueDeps) {}

  async enqueueSuspiciousEvent(fraudEventId: string): Promise<void> {
    await this.deps.store.createReview(fraudEventId);
  }

  async decideReview(input: {
    reviewId: string;
    decision: FraudReviewDecision;
    reviewerId: string;
    notes?: string | null;
  }): Promise<void> {
    const reviewEvent = await this.deps.store.getFraudEventByReview(input.reviewId);
    if (!reviewEvent) throw new Error(`Fraud review not found: ${input.reviewId}`);

    await this.deps.store.appendReviewDecision({
      fraudEventId: reviewEvent.fraud_event_id,
      decision: input.decision,
      reviewerId: input.reviewerId,
      notes: input.notes ?? null,
    });

    if (input.decision === "APPROVE") {
      if (!this.deps.processingEngine) throw new Error("Processing engine required to approve and reprocess stream");
      await this.deps.processingEngine.processEvents({
        batchId: `fraud-review-approved:${input.reviewId}`,
        provider: reviewEvent.raw_event.provider,
        events: [reviewEvent.raw_event],
      });
    }

    if (input.decision === "ESCALATE") {
      if (reviewEvent.user_id) {
        await this.deps.store.upsertUserRiskScore({
          userId: reviewEvent.user_id,
          scoreDelta: 20,
          reason: `Manual escalation for fraud review ${input.reviewId}`,
        });
      }
    }
  }
}
