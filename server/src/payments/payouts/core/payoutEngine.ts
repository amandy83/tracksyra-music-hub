import type { SqlExecutor } from "../../../royalties/services/royaltyStore";
import type { PayoutRequest } from "../models/payoutWalletTypes";

export type RiskDecision = {
  ok: boolean;
  decisionId: string;
  reason?: string | null;
};

export type GovernanceDecision = {
  approved: boolean;
  approvalId: string;
  reason?: string | null;
};

export type RiskEngine = {
  assessPayout(input: { userId: string; amount: string; payoutRequestId: string }): Promise<RiskDecision>;
};

export type GovernanceEngine = {
  approvePayout(input: {
    userId: string;
    amount: string;
    payoutRequestId: string;
    riskDecisionId: string;
  }): Promise<GovernanceDecision>;
};

export type PayoutProvider = {
  process(input: {
    payoutRequestId: string;
    userId: string;
    amount: string;
    idempotencyKey: string;
  }): Promise<{ ok: true; providerTransactionId: string } | { ok: false; reason: string }>;
};

export type MonetizationPayoutEngineDeps = {
  db: SqlExecutor;
  riskEngine: RiskEngine;
  governanceEngine: GovernanceEngine;
  payoutProvider: PayoutProvider;
};

export class PayoutEngine {
  constructor(private deps: MonetizationPayoutEngineDeps) {}

  async processPayoutRequest(payoutRequestId: string): Promise<PayoutRequest> {
    const request = await this.getPayoutRequest(payoutRequestId);
    if (request.state === "COMPLETED" || request.state === "REJECTED") return request;
    if (request.state === "FAILED") return request;

    const risk = await this.deps.riskEngine.assessPayout({
      userId: request.user_id,
      amount: request.amount,
      payoutRequestId: request.id,
    });
    if (!risk.ok) {
      return this.reject(request.id, risk.decisionId, null, risk.reason ?? "Risk engine rejected payout");
    }

    const governance = await this.deps.governanceEngine.approvePayout({
      userId: request.user_id,
      amount: request.amount,
      payoutRequestId: request.id,
      riskDecisionId: risk.decisionId,
    });
    if (!governance.approved) {
      return this.reject(request.id, risk.decisionId, governance.approvalId, governance.reason ?? "Governance approval denied");
    }

    await this.markProcessingAndLockFunds(request.id, risk.decisionId, governance.approvalId);

    const providerResult = await this.deps.payoutProvider.process({
      payoutRequestId: request.id,
      userId: request.user_id,
      amount: request.amount,
      idempotencyKey: `payout-provider:${request.id}`,
    });

    if (providerResult.ok === false) {
      await this.releaseLockedFunds(request.id, providerResult.reason);
      return this.getPayoutRequest(request.id);
    }

    await this.completePayout(request.id, providerResult.providerTransactionId);
    return this.getPayoutRequest(request.id);
  }

  private async getPayoutRequest(id: string): Promise<PayoutRequest> {
    const rows = await this.deps.db.query<PayoutRequest>(
      `SELECT id, user_id, amount, currency, state, idempotency_key,
         governance_approval_id, risk_decision_id, failure_reason, created_at, updated_at
       FROM payout_requests
       WHERE id = :id
       LIMIT 1`,
      { id },
    );
    if (!rows[0]) throw new Error(`Payout request not found: ${id}`);
    return rows[0];
  }

  private async reject(
    id: string,
    riskDecisionId: string | null,
    governanceApprovalId: string | null,
    reason: string,
  ): Promise<PayoutRequest> {
    await this.deps.db.query(
      `UPDATE payout_requests
       SET state = 'REJECTED',
           risk_decision_id = :riskDecisionId,
           governance_approval_id = :governanceApprovalId,
           failure_reason = :reason,
           updated_at = now()
       WHERE id = :id AND state IN ('PENDING', 'PROCESSING')`,
      { id, riskDecisionId, governanceApprovalId, reason },
    );
    return this.getPayoutRequest(id);
  }

  private async markProcessingAndLockFunds(
    id: string,
    riskDecisionId: string,
    governanceApprovalId: string,
  ): Promise<void> {
    const request = await this.getPayoutRequest(id);
    const lockKey = `payout-lock:${id}`;
    const alreadyLocked = await this.deps.db.query<{ id: string }>(
      `SELECT id FROM payout_transactions WHERE idempotency_key = :lockKey LIMIT 1`,
      { lockKey },
    );

    await this.deps.db.query(
      `UPDATE payout_requests
       SET state = 'PROCESSING',
           risk_decision_id = :riskDecisionId,
           governance_approval_id = :governanceApprovalId,
           updated_at = now()
       WHERE id = :id AND state = 'PENDING'`,
      { id, riskDecisionId, governanceApprovalId },
    );

    if (alreadyLocked[0]) return;

    const updatedWallet = await this.deps.db.query<{ id: string }>(
      `UPDATE payout_wallets
       SET available_balance = available_balance - CAST(:amount AS numeric),
           locked_balance = locked_balance + CAST(:amount AS numeric),
           updated_at = now()
       WHERE id = (SELECT wallet_id FROM payout_requests WHERE id = :id)
         AND available_balance >= CAST(:amount AS numeric)
       RETURNING id`,
      { id, amount: request.amount },
    );

    if (!updatedWallet[0]) {
      await this.reject(id, riskDecisionId, governanceApprovalId, "Insufficient available balance");
      throw new Error("Insufficient available balance");
    }

    await this.deps.db.query(
      `INSERT INTO payout_transactions (
         wallet_id, user_id, payout_request_id, transaction_type, amount,
         currency, idempotency_key, metadata
       )
       SELECT wallet_id, user_id, id, 'PAYOUT_LOCK', amount, currency, :lockKey, '{}'::jsonb
       FROM payout_requests
       WHERE id = :id
       ON CONFLICT (idempotency_key) DO NOTHING`,
      { id, lockKey },
    );
  }

  private async releaseLockedFunds(id: string, reason: string): Promise<void> {
    const request = await this.getPayoutRequest(id);
    const releaseKey = `payout-release:${id}`;
    const released = await this.deps.db.query<{ id: string }>(
      `SELECT id FROM payout_transactions WHERE idempotency_key = :releaseKey LIMIT 1`,
      { releaseKey },
    );

    if (!released[0]) {
      await this.deps.db.query(
        `UPDATE payout_wallets
         SET available_balance = available_balance + CAST(:amount AS numeric),
             locked_balance = GREATEST(locked_balance - CAST(:amount AS numeric), 0),
             updated_at = now()
         WHERE id = (SELECT wallet_id FROM payout_requests WHERE id = :id)`,
        { id, amount: request.amount },
      );
      await this.deps.db.query(
        `INSERT INTO payout_transactions (
           wallet_id, user_id, payout_request_id, transaction_type, amount,
           currency, idempotency_key, metadata
         )
         SELECT wallet_id, user_id, id, 'PAYOUT_RELEASE', amount, currency, :releaseKey,
           CAST(:metadata AS jsonb)
         FROM payout_requests
         WHERE id = :id
         ON CONFLICT (idempotency_key) DO NOTHING`,
        { id, releaseKey, metadata: JSON.stringify({ reason }) },
      );
    }

    await this.deps.db.query(
      `UPDATE payout_requests
       SET state = 'FAILED', failure_reason = :reason, updated_at = now()
       WHERE id = :id AND state = 'PROCESSING'`,
      { id, reason },
    );
  }

  private async completePayout(id: string, providerTransactionId: string): Promise<void> {
    const request = await this.getPayoutRequest(id);
    const debitKey = `payout-debit:${id}`;
    const debited = await this.deps.db.query<{ id: string }>(
      `SELECT id FROM payout_transactions WHERE idempotency_key = :debitKey LIMIT 1`,
      { debitKey },
    );

    if (!debited[0]) {
      await this.deps.db.query(
        `UPDATE payout_wallets
         SET locked_balance = GREATEST(locked_balance - CAST(:amount AS numeric), 0),
             updated_at = now()
         WHERE id = (SELECT wallet_id FROM payout_requests WHERE id = :id)`,
        { id, amount: request.amount },
      );
      await this.deps.db.query(
        `INSERT INTO payout_transactions (
           wallet_id, user_id, payout_request_id, transaction_type, amount,
           currency, idempotency_key, metadata
         )
         SELECT wallet_id, user_id, id, 'PAYOUT_DEBIT', amount, currency, :debitKey,
           CAST(:metadata AS jsonb)
         FROM payout_requests
         WHERE id = :id
         ON CONFLICT (idempotency_key) DO NOTHING`,
        { id, debitKey, metadata: JSON.stringify({ provider_transaction_id: providerTransactionId }) },
      );
    }

    await this.deps.db.query(
      `UPDATE payout_requests
       SET state = 'COMPLETED', updated_at = now()
       WHERE id = :id AND state = 'PROCESSING'`,
      { id },
    );
  }
}
