import { SandboxPayoutProviderAdapter } from "./payoutProviderAdapter";

export class RazorpayPayoutAdapter extends SandboxPayoutProviderAdapter {
  readonly provider = "razorpay" as const;
}

export class StripePayoutAdapter extends SandboxPayoutProviderAdapter {
  readonly provider = "stripe" as const;
}

export class BankTransferPayoutAdapter extends SandboxPayoutProviderAdapter {
  readonly provider = "bank_transfer" as const;
}

export function createPayoutProviderAdapter(provider: "razorpay" | "stripe" | "bank_transfer") {
  if (provider === "razorpay") return new RazorpayPayoutAdapter();
  if (provider === "stripe") return new StripePayoutAdapter();
  return new BankTransferPayoutAdapter();
}
