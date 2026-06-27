// Phase C: Minimal deterministic wallet types (read-only contracts)
// Governance: This module must remain read-only and replay-safe.

export type EntityType = "artist" | "label" | "release" | "user";

export type WalletId = string;

export type Wallet = {
  wallet_id?: WalletId | null;
  entity_id: string;
  entity_type: EntityType;
  currency: string;

  // Amounts are expressed in the wallet currency.
  available_balance: string; // keep deterministic string contract (payout eligibility expects string)
  pending_balance: string;
  locked_balance: string;

  updated_at: string; // ISO
};

export type WalletBalanceSnapshot = {
  wallet_id?: WalletId | null;
  available_balance: string;
  pending_balance: string;
  locked_balance: string;
  currency: string;
  updated_at: string; // ISO
};

export type BalanceBreakdown = WalletBalanceSnapshot;


