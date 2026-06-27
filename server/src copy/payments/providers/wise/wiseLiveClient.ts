// Deterministic live client stub for Wise.
export class WiseLiveClient {
  async initiatePayment(_payload: Record<string, unknown>) {
    return { provider_payment_id: `wise_live_${Date.now()}` };
  }
  async verifyPayment(_payload: Record<string, unknown>) {
    return { verified: true };
  }
  async refundPayment(_payload: Record<string, unknown>) {
    return { refunded: true };
  }
}

