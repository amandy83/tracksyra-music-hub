import type { FraudScore } from "../../fraud";
import type { NormalizedStreamEvent } from "../../ingestion/streams";
import { BaseRealtimePublisher } from "./basePublisher";

export class FraudEventPublisher extends BaseRealtimePublisher {
  publishFraudFlagged(event: NormalizedStreamEvent, score: FraudScore) {
    return this.publish({
      event_id: this.eventId("FRAUD_FLAGGED", score.fraud_event_id),
      event_type: "FRAUD_FLAGGED",
      entity_type: "track",
      entity_id: event.track_id,
      artist_id: score.featureVector.user_id ?? null,
      track_id: event.track_id,
      platform: String(event.platform),
      sequence_key: `track:${event.track_id}`,
      payload: {
        fraud_event_id: score.fraud_event_id,
        event_id: event.event_id,
        decision: score.decision,
        fraud_score: score.score,
        reasons: score.reasons,
      },
    });
  }
}
