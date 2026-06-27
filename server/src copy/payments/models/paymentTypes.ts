import type { PaymentState } from "./paymentEnums";

export type PaymentId = string;
export type PaymentEventId = string; // idempotency key

export type PaymentEntityType = "artist" | "label" | "user";

export type PaymentRecord = {
  payment_id: PaymentId;
  payment_request_event_id: PaymentEventId;
  entity_type: PaymentEntityType;
  entity_id: string;

  amount_inr: string;
  currency: "INR";

  state: PaymentState;
  sandbox_mode: boolean;

  provider: string | null;
  provider_payment_id: string | null;
  correlation_id: string;

  created_at_iso: string;
  updated_at_iso?: string | null;
};

export type InitiatePaymentInput = {
  payment_request_event_id: PaymentEventId;
  entity_type: PaymentEntityType;
  entity_id: string;
  amount_inr: string;
  currency: "INR";
  correlation_id: string;
  actor?: string | null;
  sandbox_mode: boolean;
  metadata?: Record<string, unknown>;
};

export type PaymentWebhookPayload = {
  event_id: string;
  provider: string;
  provider_payment_id: string;
  provider_status: string;
  correlation_id?: string;
  received_at_iso: string;
  raw_payload: Record<string, unknown>;
};

