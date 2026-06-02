import { PaymentState } from "../models/paymentEnums";

const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  [PaymentState.INITIATED]: [PaymentState.VALIDATING, PaymentState.FAILED],
  [PaymentState.VALIDATING]: [PaymentState.QUEUED, PaymentState.FAILED],
  [PaymentState.QUEUED]: [PaymentState.PROCESSING_SANDBOX, PaymentState.PROCESSING_LIVE, PaymentState.FAILED],
  [PaymentState.PROCESSING_SANDBOX]: [PaymentState.SUCCESS, PaymentState.FAILED],
  [PaymentState.PROCESSING_LIVE]: [PaymentState.SUCCESS, PaymentState.FAILED],
  [PaymentState.SUCCESS]: [],
  [PaymentState.FAILED]: [PaymentState.REVERSED],
  [PaymentState.REVERSED]: [],
};

export function validatePaymentTransition(previous: PaymentState | null, next: PaymentState): boolean {
  if (!previous) return true;
  return (TRANSITIONS[previous] ?? []).includes(next);
}

