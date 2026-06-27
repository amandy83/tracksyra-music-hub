import { validatePayoutTransition } from "./payoutStateMachine";
import { computeEligibility } from "./payoutEligibility";
import { validatePayoutRequest } from "./payoutValidator";

import type { WalletService } from "../../wallet/services/walletService";
import type { WalletBalanceSnapshot } from "../../wallet/models/walletTypes";

import type {
  PayoutId,
  PayoutRequestEventId,
  PayoutRecord,
  PayoutRequestInput,
  PayoutState,
} from "../models/payoutTypes";

import type { PayoutRequestService } from "../services/payoutRequestService";
import type { PayoutService } from "../services/payoutService";

export type PayoutEngineDeps = {
  walletService: WalletService;
  payoutRequestService: PayoutRequestService;
  payoutService: PayoutService;
};

export type SubmitPayoutResult =
  | { ok: true; payout_id: PayoutId; final_status: PayoutState; payout: PayoutRecord }
  | { ok: false; error: string; final_status?: PayoutState };

export class PayoutEngine {
  constructor(private deps: PayoutEngineDeps) {}

  async submitPayout(input: PayoutRequestInput): Promise<SubmitPayoutResult> {
    const validation = validatePayoutRequest(input);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    // Idempotency via event_id: only create once.
    const existing = await this.deps.payoutRequestService.findByEventId(input.event_id);
    if (existing) {
      return { ok: true, payout_id: existing.payout_id, final_status: existing.status, payout: existing };
    }

    const payout = await this.deps.payoutRequestService.createRequested({
      ...input,
      status: "REQUESTED",
    });

    // TRANSITION REQUESTED -> VALIDATION_PENDING
    await this.deps.payoutService.transition(payout.payout_id, "VALIDATION_PENDING", {
      correlation_id: input.correlation_id,
      actor: input.actor ?? null,
      reason: null,
      metadata: input.metadata,
    });

    // Eligibility checks (control-plane only)
    const wallet_balance: WalletBalanceSnapshot = await this.deps.walletService.getWalletBalance({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      currency: "INR",
      correlation_id: input.correlation_id,
    } as any);

    const eligibility = computeEligibility({
      wallet_balance_available_inr: wallet_balance.available_balance,
      amount_inr: input.amount_inr,
      entity_id: input.entity_id,
      entity_type: input.entity_type,
    });

    if (!eligibility.ok) {
      await this.deps.payoutService.transition(payout.payout_id, "ELIGIBILITY_FAILED", {
        correlation_id: input.correlation_id,
        actor: input.actor ?? null,
        reason: eligibility.reason,
        metadata: input.metadata,
      });
      const updated = await this.deps.payoutRequestService.findByEventId(input.event_id);
      if (!updated) throw new Error("Payout disappeared after transition");
      return { ok: true, payout_id: updated.payout_id, final_status: updated.status, payout: updated };
    }

    await this.deps.payoutService.transition(payout.payout_id, "APPROVED", {
      correlation_id: input.correlation_id,
      actor: input.actor ?? null,
      reason: null,
      metadata: input.metadata,
    });

    // queue preparation
    await this.deps.payoutService.transition(payout.payout_id, "QUEUED", {
      correlation_id: input.correlation_id,
      actor: input.actor ?? null,
      reason: null,
      metadata: input.metadata,
    });

    // enqueue job is handled by queue layer in Phase C.
    return {
      ok: true,
      payout_id: payout.payout_id,
      final_status: "QUEUED",
      payout: await this.deps.payoutRequestService.getById(payout.payout_id),
    };
  }

  async simulateProcessing(payout_id: PayoutId, correlation_id: string, actor: string | null): Promise<PayoutRecord> {
    const payout = await this.deps.payoutRequestService.getById(payout_id);
    const previous = payout.status;

    const next1: PayoutState = "PROCESSING_SIMULATION";
    if (!validatePayoutTransition(previous, next1)) throw new Error("Invalid transition in simulation");

    await this.deps.payoutService.transition(payout_id, next1, { correlation_id, actor, reason: null });

    const next2: PayoutState = "COMPLETED_SIMULATED";
    await this.deps.payoutService.transition(payout_id, next2, { correlation_id, actor, reason: null });

    return this.deps.payoutRequestService.getById(payout_id);
  }
}

