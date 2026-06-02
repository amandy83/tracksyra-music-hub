// Stripe adapter stub. Must expose deterministic methods only.

export type PaymentProviderAdapter = {
  initiatePayment: (input: {
    amount_inr: string;
    correlation_id: string;
    sandbox_mode: boolean;
    metadata?: Record<string, unknown>;
  }) => Promise<{ ok: true; provider_payment_id: string } | { ok: false; reason: string }>;

  verifyPayment: (_input: { correlation_id: string; provider_payment_id: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;

  refundPayment: (_input: { correlation_id: string; provider_payment_id: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;

  handleWebhook: (_payload: Record<string, unknown>) => Promise<{ ok: true }>;
};

export function makeStripeAdapter(_opts: { sandbox: boolean }): PaymentProviderAdapter {
  return {
    async initiatePayment(input) {
      void input;
      return { ok: true, provider_payment_id: `stripe_${input.sandbox_mode ? "sandbox" : "live"}_fake_${input.correlation_id}` };
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

