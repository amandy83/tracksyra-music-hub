// Deterministic live client stub for PayPal.
export class PayPalLiveClient {
  async initiatePayment(_payload: Record<string, unknown>) {
    return { provider_payment_id: `paypal_live_${Date.now()}` };
  }
  async verifyPayment(_payload: Record<string, unknown>) {
    return { verified: true };
  }
  async refundPayment(_payload: Record<string, unknown>) {
    return { refunded: true };
  }
}

