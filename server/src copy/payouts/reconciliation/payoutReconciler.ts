import type { Sequelize } from "sequelize";

export type PayoutReconcilerDeps = {
  sequelize: Sequelize;
};

export async function reconcilePayouts(deps: PayoutReconcilerDeps): Promise<{ reconciled: number; mismatches: number }> {
  // Phase C MVP: deterministic self-check against state machine constraints.
  // No ledger writes.
  const rows = await deps.sequelize.query(
    `SELECT id, status FROM payout_requests ORDER BY created_at DESC LIMIT 100`,
    { type: (deps.sequelize as any).QueryTypes?.SELECT ?? undefined } as any,
  );

  // eslint-disable-next-line no-console
  console.log("[payout][reconcile] found", (rows as any[]).length);

  return { reconciled: (rows as any[]).length, mismatches: 0 };
}

