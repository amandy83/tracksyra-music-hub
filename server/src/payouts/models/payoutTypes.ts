import type { WalletId as WalletIdType } from "../../wallet/models/walletTypes";
import type { PayoutState as PayoutStateType } from "./payoutEnums";

export type PayoutState = PayoutStateType;

export type PayoutId = string;
export type PayoutRequestEventId = string; // idempotency key

export type PayoutEntityType = "artist" | "label";

export type PayoutRequestInput = {
  entity_type: PayoutEntityType;
  entity_id: string;
  amount_inr: string;
  event_id: PayoutRequestEventId;
  correlation_id: string;
  actor?: string | null;
  metadata?: Record<string, unknown>;
  // future: optional override flags
  manual_override?: boolean;
};

export type PayoutRecord = {
  payout_id: PayoutId;
  payout_request_event_id: PayoutRequestEventId;
  user_id: string;

  entity_type: PayoutEntityType;
  entity_id: string;

  amount_inr: string;

  status: PayoutState;
  approved_at_iso?: string | null;
  queued_at_iso?: string | null;
  completed_at_iso?: string | null;

  correlation_id: string;
  last_error?: string | null;

  wallet_id?: WalletIdType | null;

  created_at_iso: string;
};

export type PayoutTransitionContext = {
  payout_id: PayoutId;
  payout_request_event_id: PayoutRequestEventId;
  provider: "internal";
  correlation_id: string;
  actor: string | null;
  metadata?: Record<string, unknown>;
};

export type PayoutEligibilityInput = {
  wallet_balance_available_inr: string;
  amount_inr: string;
  entity_id: string;
  entity_type: PayoutEntityType;
};

export type PayoutEligibilityResult =
  | { ok: true; reason?: null }
  | { ok: false; reason: string };

