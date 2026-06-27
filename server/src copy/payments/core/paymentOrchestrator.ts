import type { InitiatePaymentInput, PaymentRecord } from "../models/paymentTypes";

import { PaymentEngine } from "./paymentEngine";

export class PaymentOrchestrator {
  constructor(private paymentEngine: PaymentEngine) {}

  async handleInitiate(input: InitiatePaymentInput): Promise<PaymentRecord> {
    const res = await this.paymentEngine.initiate(input);
    if (!res.ok) throw new Error(res.reason);
    return res.payment;
  }
}

