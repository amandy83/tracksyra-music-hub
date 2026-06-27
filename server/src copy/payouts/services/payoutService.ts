import type { Sequelize } from "sequelize";

import type { PayoutId } from "../models/payoutTypes";
import type { PayoutState } from "../models/payoutEnums";
import { validatePayoutTransition } from "../core/payoutStateMachine";

export type PayoutServiceDeps = {
  sequelize: Sequelize;
};

export type TransitionParams = {
  correlation_id: string;
  actor: string | null;
  reason: string | null;
  metadata?: Record<string, unknown>;
};

export class PayoutService {
  constructor(private deps: PayoutServiceDeps) {}

  async transition(payout_id: PayoutId, next: PayoutState, params: TransitionParams): Promise<void> {
    const payout = await this.deps.sequelize.query(
      `SELECT status FROM payout_requests WHERE id = :id LIMIT 1`,
      { replacements: { id: payout_id }, type: (this.deps.sequelize as any).QueryTypes?.SELECT ?? undefined } as any,
    );

    const previous = (payout as any[])[0]?.status as PayoutState | null;

    if (!validatePayoutTransition(previous, next)) {
      throw new Error(`Invalid payout transition ${previous ?? "null"} -> ${next}`);
    }

    const set: Record<string, unknown> = { status: next };

    if (next === "APPROVED") set["approved_at_iso"] = new Date().toISOString();
    if (next === "QUEUED") set["queued_at_iso"] = new Date().toISOString();
    if (next === "COMPLETED_SIMULATED") set["completed_at_iso"] = new Date().toISOString();
    if (params.reason) set["last_error"] = params.reason;

    await this.deps.sequelize.query(
      `UPDATE payout_requests SET status = :status${params.reason ? ", last_error = :reason" : ""}${next === "APPROVED" ? ", approved_at_iso = :approved_at_iso" : ""}${next === "QUEUED" ? ", queued_at_iso = :queued_at_iso" : ""}${next === "COMPLETED_SIMULATED" ? ", completed_at_iso = :completed_at_iso" : ""} WHERE id = :id`,
      {
        replacements: {
          id: payout_id,
          status: next,
          reason: params.reason,
          approved_at_iso: new Date().toISOString(),
          queued_at_iso: new Date().toISOString(),
          completed_at_iso: new Date().toISOString(),
        },
        type: (this.deps.sequelize as any).QueryTypes?.UPDATE ?? undefined,
      } as any,
    );

    // Observability hook: emit structured logs (no external integration)
    // eslint-disable-next-line no-console
    console.log("[payout] transition", {
      payout_id,
      next,
      correlation_id: params.correlation_id,
      actor: params.actor,
      reason: params.reason,
    });
  }
}

