// TODO Phase D: Create webhook route/handler that only updates payment state.
// This is a compile-safe stub used for later integration.

import type { PaymentWebhookPayload } from "../models/paymentTypes";

export async function handlePaymentWebhook(_payload: PaymentWebhookPayload): Promise<{ ok: true }> {
  return { ok: true };
}

