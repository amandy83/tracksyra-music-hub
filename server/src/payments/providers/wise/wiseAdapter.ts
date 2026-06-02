// Wise adapter stub.
import type { PaymentProviderAdapter } from "../stripe/stripeAdapter";

export function makeWiseAdapter(_opts: { sandbox: boolean }): PaymentProviderAdapter {
  return {
    async initiatePayment(input) {
      return { ok: true, provider_payment_id: `wise_${input.sandbox_mode ? "sandbox" : "live"}_fake_${input.correlation_id}` };
    },
    async verifyPayment() {
      return { ok: true };
    },
    async refundPayment() {
      return { ok: true };
    },
    async handleWebhook() {
      return { ok: true };
    },
  };
}

