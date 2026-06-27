export type PayoutProviderName = "razorpay" | "stripe" | "bank_transfer";

export type PayoutProviderRequest = {
  payoutRequestId: string;
  userId: string;
  amount: string;
  currency: string;
  destinationReference: string;
  metadata?: Record<string, unknown>;
};

export type PayoutProviderResult = {
  provider: PayoutProviderName;
  providerReference: string;
  status: "queued" | "paid" | "failed";
  receiptUrl?: string | null;
  rawResponse: unknown;
};

export interface PayoutProviderAdapter {
  readonly provider: PayoutProviderName;
  createPayout(input: PayoutProviderRequest): Promise<PayoutProviderResult>;
}

export abstract class SandboxPayoutProviderAdapter implements PayoutProviderAdapter {
  abstract readonly provider: PayoutProviderName;

  async createPayout(input: PayoutProviderRequest): Promise<PayoutProviderResult> {
    const providerReference = `${this.provider}_${input.payoutRequestId}`;
    return {
      provider: this.provider,
      providerReference,
      status: "queued",
      receiptUrl: null,
      rawResponse: {
        mode: "sandbox",
        providerReference,
        message: "Payout adapter prepared; live settlement is controlled by provider credentials and approval.",
      },
    };
  }
}
