import type { PaymentRecord, PaymentId, PaymentEventId } from "./paymentTypes";
import { PaymentState } from "./paymentEnums";

// Deterministic placeholder model factory.
export function makePaymentRecord(input: {
  payment_id: PaymentId;
  payment_request_event_id: PaymentEventId;
  entity_type: PaymentRecord["entity_type"];
  entity_id: string;
  amount_inr: string;
  currency: "INR";
  sandbox_mode: boolean;
  correlation_id: string;
}): PaymentRecord {
  return {
    payment_id: input.payment_id,
    payment_request_event_id: input.payment_request_event_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    amount_inr: input.amount_inr,
    currency: input.currency,
    state: PaymentState.INITIATED,
    sandbox_mode: input.sandbox_mode,
    provider: null,
    provider_payment_id: null,
    correlation_id: input.correlation_id,
    created_at_iso: new Date().toISOString(),
    updated_at_iso: null,
  };
}

