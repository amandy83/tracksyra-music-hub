import type { SqlExecutor } from "../../../royalties/services/royaltyStore";
import type { PayoutRequest, PayoutWallet } from "../models/payoutWalletTypes";

export type CreditRevenueInput = {
  userId: string;
  amount: string;
  royaltyRecordId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type RequestPayoutInput = {
  userId: string;
  amount: string;
  idempotencyKey: string;
  correlationId: string;
  actor?: string | null;
};

export class PayoutWalletService {
  constructor(private db: SqlExecutor) {}

  async getOrCreateWallet(userId: string): Promise<PayoutWallet> {
    const rows = await this.db.query<PayoutWallet>(
      `INSERT INTO payout_wallets (user_id, currency)
       VALUES (:userId, 'USD')
       ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = payout_wallets.updated_at
       RETURNING id, user_id, currency, pending_balance, available_balance, locked_balance, created_at, updated_at`,
      { userId },
    );
    return rows[0];
  }

  async getWallet(userId: string): Promise<PayoutWallet | null> {
    const rows = await this.db.query<PayoutWallet>(
      `SELECT id, user_id, currency, pending_balance, available_balance, locked_balance, created_at, updated_at
       FROM payout_wallets
       WHERE user_id = :userId AND currency = 'USD'
       LIMIT 1`,
      { userId },
    );
    return rows[0] ?? null;
  }

  async creditRevenue(input: CreditRevenueInput): Promise<PayoutWallet> {
    if (Number(input.amount) < 0) throw new Error("Revenue credit amount cannot be negative");
    const wallet = await this.getOrCreateWallet(input.userId);

    await this.db.query(
      `INSERT INTO payout_transactions (
         wallet_id, user_id, royalty_record_id, transaction_type, amount,
         currency, idempotency_key, metadata
       ) VALUES (
         :walletId, :userId, :royaltyRecordId, 'ROYALTY_CREDIT', :amount,
         'USD', :idempotencyKey, CAST(:metadata AS jsonb)
       )
       ON CONFLICT (idempotency_key) DO NOTHING`,
      {
        walletId: wallet.id,
        userId: input.userId,
        royaltyRecordId: input.royaltyRecordId,
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    );

    await this.db.query(
      `UPDATE payout_wallets w
       SET available_balance = COALESCE((
             SELECT SUM(amount) FROM payout_transactions
             WHERE wallet_id = w.id AND transaction_type IN ('ROYALTY_CREDIT', 'PAYOUT_RELEASE')
           ), 0) - COALESCE((
             SELECT SUM(amount) FROM payout_transactions
             WHERE wallet_id = w.id AND transaction_type = 'PAYOUT_LOCK'
           ), 0),
           updated_at = now()
       WHERE w.id = :walletId`,
      { walletId: wallet.id },
    );

    return (await this.getWallet(input.userId)) ?? wallet;
  }

  async requestPayout(input: RequestPayoutInput): Promise<PayoutRequest> {
    if (Number(input.amount) <= 0) throw new Error("Payout amount must be greater than zero");
    const wallet = await this.getOrCreateWallet(input.userId);
    const rows = await this.db.query<PayoutRequest>(
      `INSERT INTO payout_requests (
         user_id, wallet_id, amount, currency, state, idempotency_key,
         correlation_id, requested_by
       ) VALUES (
         :userId, :walletId, :amount, 'USD', 'PENDING', :idempotencyKey,
         :correlationId, :actor
       )
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = payout_requests.updated_at
       RETURNING id, user_id, amount, currency, state, idempotency_key,
         governance_approval_id, risk_decision_id, failure_reason, created_at, updated_at`,
      {
        userId: input.userId,
        walletId: wallet.id,
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        actor: input.actor ?? null,
      },
    );
    return rows[0];
  }

  async processPayoutRequest(_payoutRequestId: string): Promise<never> {
    throw new Error("Use PayoutEngine.processPayoutRequest so risk and governance checks cannot be bypassed");
  }
}
