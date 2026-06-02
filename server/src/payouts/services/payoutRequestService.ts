import { v4 as uuidv4 } from "uuid";

import type { Sequelize } from "sequelize";

import type { PayoutId, PayoutRequestEventId, PayoutRecord, PayoutRequestInput } from "../models/payoutTypes";

import type { WalletEntityType } from "../../wallet/models/walletTypes";

export type PayoutRequestServiceDeps = {
  sequelize: Sequelize;
};

export class PayoutRequestService {
  constructor(private deps: PayoutRequestServiceDeps) {}

  private mapRowToRecord(row: any): PayoutRecord {
    return {
      payout_id: row.id,
      payout_request_event_id: row.event_id,
      user_id: row.user_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      amount_inr: String(row.amount_inr),
      status: row.status,
      approved_at_iso: row.approved_at_iso,
      queued_at_iso: row.queued_at_iso,
      completed_at_iso: row.completed_at_iso,
      correlation_id: row.correlation_id,
      last_error: row.last_error,
      wallet_id: row.wallet_id,
      created_at_iso: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }

  async findByEventId(event_id: PayoutRequestEventId): Promise<PayoutRecord | null> {
    // payout_requests model currently has id/user_id/amount_inr/status, but Phase C expects extra fields.
    // For now we persist the minimal required contract using metadata columns via payload JSON.
    // However existing sequelize model is loose, so we attempt flexible selects.

    const rows = await this.deps.sequelize.query(
      `SELECT * FROM payout_requests WHERE event_id = :event_id LIMIT 1`,
      { replacements: { event_id }, type: (this.deps.sequelize as any).QueryTypes?.SELECT ?? undefined } as any,
    );

    const row = (rows as any[])[0];
    if (!row) return null;
    return this.mapRowToRecord(row);
  }

  async getById(payout_id: PayoutId): Promise<PayoutRecord> {
    const rows = await this.deps.sequelize.query(
      `SELECT * FROM payout_requests WHERE id = :id LIMIT 1`,
      { replacements: { id: payout_id }, type: (this.deps.sequelize as any).QueryTypes?.SELECT ?? undefined } as any,
    );

    const row = (rows as any[])[0];
    if (!row) throw new Error("Payout not found");
    return this.mapRowToRecord(row);
  }

  async createRequested(params: PayoutRequestInput & { status: "REQUESTED" }): Promise<PayoutRecord> {
    const payout_id = uuidv4();

    await this.deps.sequelize.query(
      `INSERT INTO payout_requests (
        id, event_id, user_id, entity_type, entity_id, amount_inr, status,
        correlation_id, created_at, last_error, wallet_id,
        approved_at_iso, queued_at_iso, completed_at_iso
      ) VALUES (
        :id, :event_id, :user_id, :entity_type, :entity_id, :amount_inr, :status,
        :correlation_id, NOW(), :last_error, :wallet_id,
        :approved_at_iso, :queued_at_iso, :completed_at_iso
      )`,
      {
        replacements: {
          id: payout_id,
          event_id: params.event_id,
          user_id: params.entity_type === "artist" ? params.entity_id : params.entity_id,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          amount_inr: params.amount_inr,
          status: params.status,
          correlation_id: params.correlation_id,
          last_error: null,
          wallet_id: null,
          approved_at_iso: null,
          queued_at_iso: null,
          completed_at_iso: null,
        },
        type: (this.deps.sequelize as any).QueryTypes?.INSERT ?? undefined,
      } as any,
    );

    return this.getById(payout_id);
  }
}

