export const PayoutCompletionReason = "simulated";

export type PayoutState =
  | "REQUESTED"
  | "VALIDATION_PENDING"
  | "ELIGIBILITY_FAILED"
  | "APPROVED"
  | "REJECTED"
  | "QUEUED"
  | "PROCESSING_SIMULATION"
  | "COMPLETED_SIMULATED";

export const PayoutStates: PayoutState[] = [
  "REQUESTED",
  "VALIDATION_PENDING",
  "ELIGIBILITY_FAILED",
  "APPROVED",
  "REJECTED",
  "QUEUED",
  "PROCESSING_SIMULATION",
  "COMPLETED_SIMULATED",
];

