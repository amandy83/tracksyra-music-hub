import type { Sequelize } from "sequelize";
import type { PayoutId, PayoutState, PayoutRecord } from "../models/payoutTypes";

export type GetPayoutStatusInput = {
  payout_id: PayoutId;
};

export async function getPayoutStatus(deps: { sequelize: Sequelize }, input: GetPayoutStatusInput): Promise<PayoutRecord | null> {
  const rows = await deps.sequelize.query(
    `SELECT * FROM payout_requests WHERE id = :id LIMIT 1`,
    { replacements: { id: input.payout_id }, type: (deps.sequelize as any).QueryTypes?.SELECT ?? undefined } as any,
  );

  const row = (rows as any[])[0];
  return row ?? null;
}

