import type { PayoutRequest } from "../../payments/payouts";
import { BaseRealtimePublisher } from "./basePublisher";

export class PayoutEventPublisher extends BaseRealtimePublisher {
  publishPayoutRequested(request: PayoutRequest) {
    return this.publishPayoutEvent("PAYOUT_REQUESTED", request);
  }

  publishPayoutCompleted(request: PayoutRequest) {
    return this.publishPayoutEvent("PAYOUT_COMPLETED", request);
  }

  private publishPayoutEvent(eventType: "PAYOUT_REQUESTED" | "PAYOUT_COMPLETED", request: PayoutRequest) {
    return this.publish({
      event_id: this.eventId(eventType, request.id),
      event_type: eventType,
      entity_type: "payout",
      entity_id: request.id,
      artist_id: request.user_id,
      sequence_key: `artist:${request.user_id}`,
      payload: {
        payout_request_id: request.id,
        user_id: request.user_id,
        amount: request.amount,
        currency: request.currency,
        state: request.state,
      },
    });
  }
}
