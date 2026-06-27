// Deterministic sandbox client stub for Stripe.
export class StripeSandboxClient {
  async initiatePayment(_payload: Record<string, unknown>) {
    return { provider_payment_id: `stripe_sandbox_${Date.now()}` };
  }

  async verifyPayment(_payload: Record<string, unknown>) {
    return { verified: true };
  }

  async refundPayment(_payload: Record<string, unknown>) {
    return { refunded: true };
  }
}

