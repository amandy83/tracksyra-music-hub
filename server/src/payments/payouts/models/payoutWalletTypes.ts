export type PayoutState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REJECTED";

export type PayoutWallet = {
  id: string;
  user_id: string;
  currency: "USD";
  pending_balance: string;
  available_balance: string;
  locked_balance: string;
  created_at: string;
  updated_at: string;
};

export type PayoutRequest = {
  id: string;
  user_id: string;
  amount: string;
  currency: "USD";
  state: PayoutState;
  idempotency_key: string;
  governance_approval_id?: string | null;
  risk_decision_id?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type PayoutTransactionType = "ROYALTY_CREDIT" | "PAYOUT_LOCK" | "PAYOUT_RELEASE" | "PAYOUT_DEBIT";

export type PayoutTransaction = {
  id: string;
  wallet_id: string;
  user_id: string;
  payout_request_id?: string | null;
  royalty_record_id?: string | null;
  transaction_type: PayoutTransactionType;
  amount: string;
  currency: "USD";
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
