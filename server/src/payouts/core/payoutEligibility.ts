import type { PayoutEligibilityInput, PayoutEligibilityResult } from "../models/payoutTypes";

const MIN_PAYOUT_INR = "1.00";

function toCents(s: string): number {
  const [whole, frac = ""] = s.split(".");
  const w = Number(whole || "0");
  const f = Number((frac + "00").slice(0, 2));
  return w * 100 + f;
}

export function computeEligibility(input: PayoutEligibilityInput): PayoutEligibilityResult {
  const walletCents = toCents(input.wallet_balance_available_inr);
  const amountCents = toCents(input.amount_inr);
  const minCents = toCents(MIN_PAYOUT_INR);

  if (amountCents < minCents) {
    return { ok: false, reason: `Minimum payout is ${MIN_PAYOUT_INR} INR` };
  }

  if (walletCents < amountCents) {
    return { ok: false, reason: "Insufficient available wallet balance" };
  }

  return { ok: true, reason: null };
}

