import type { PaymentRecord } from "../models/paymentTypes";

export type PaymentProcessorDeps = {
  // Stub: later will wire payment provider adapters.
  // Must support idempotent provider interactions.
  providerAdapterResolver: (provider: string, sandbox_mode: boolean) => any;
};

export class PaymentProcessor {
  constructor(private deps: PaymentProcessorDeps) {}

  async process(_payment: PaymentRecord): Promise<{ ok: true } | { ok: false; reason: string }> {
    // Phase D scaffold: no real provider calls.
    return { ok: true };
  }
}

