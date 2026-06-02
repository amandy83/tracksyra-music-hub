import type { PayoutState } from "../models/payoutEnums";

const TRANSITIONS: Record<PayoutState, PayoutState[]> = {
  REQUESTED: ["VALIDATION_PENDING"],
  VALIDATION_PENDING: ["APPROVED", "ELIGIBILITY_FAILED", "REJECTED"],
  ELIGIBILITY_FAILED: [],
  APPROVED: ["QUEUED"],
  REJECTED: [],
  QUEUED: ["PROCESSING_SIMULATION"],
  PROCESSING_SIMULATION: ["COMPLETED_SIMULATED"],
  COMPLETED_SIMULATED: [],
};

export function validatePayoutTransition(previous: PayoutState | null, next: PayoutState): boolean {
  if (!previous) return true; // bootstrap
  return (TRANSITIONS[previous] || []).includes(next);
}

