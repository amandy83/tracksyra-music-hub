// PayPal adapter stub. No real API calls in scaffolding.
import type { PaymentProviderAdapter } from "../stripe/stripeAdapter";

export function makePayPalAdapter(_opts: { sandbox: boolean }): PaymentProviderAdapter {
  return {
    async initiatePayment(input) {
      return { ok: true, provider_payment_id: `paypal_${input.sandbox_mode ? "sandbox" : "live"}_fake_${input.correlation_id}` };
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

