import type { PayoutRequestInput } from "../models/payoutTypes";

export type PayoutValidatorResult = {
  ok: true;
  normalized: PayoutRequestInput;
} | {
  ok: false;
  error: string;
};

export function validatePayoutRequest(input: PayoutRequestInput): PayoutValidatorResult {
  if (!input.entity_type || !["artist", "label"].includes(input.entity_type)) {
    return { ok: false, error: "Invalid entity_type" };
  }
  if (!input.entity_id) return { ok: false, error: "Missing entity_id" };
  if (!input.amount_inr) return { ok: false, error: "Missing amount_inr" };
  if (!input.event_id) return { ok: false, error: "Missing event_id" };
  if (!input.correlation_id) return { ok: false, error: "Missing correlation_id" };

  return { ok: true, normalized: input };
}

