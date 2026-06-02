import type { PaymentProviderSandboxFlags, PaymentProviderLiveFlags } from "./providerFlags";
import { loadRuntimeEnv } from "../../config/envLoader";

// TypeScript-safe access to env on runtimes where Node types may be absent.
// (We intentionally avoid importing @types/node.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _process: { env?: Record<string, string | undefined> } =
  (globalThis as any)?.process?.env
    ? ({ env: (globalThis as any).process.env } as const)
    : { env: {} };


function env(name: string): string | undefined {
  return _process.env?.[name];
}


export type PaymentConfig = {
  sandbox_enabled: boolean;
  provider_sandbox: PaymentProviderSandboxFlags;
  provider_live: PaymentProviderLiveFlags;
  webhook_secret: string;
};

type EnvBool = boolean;

function envBool(name: string, defaultValue: boolean): EnvBool {
  const raw = env(name);
  if (raw === undefined) return defaultValue;
  return raw.toLowerCase() === "true";
}


function hasNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveProviderFlags(params: {
  sandboxEnabled: boolean;
  requestedLive: PaymentProviderLiveFlags;
}): {
  provider_sandbox: PaymentProviderSandboxFlags;
  provider_live: PaymentProviderLiveFlags;
} {
  const { sandboxEnabled, requestedLive } = params;

  // Sandbox remains enabled by default unless explicitly turned off.
  const provider_sandbox: PaymentProviderSandboxFlags = {
    stripe: sandboxEnabled,
    paypal: sandboxEnabled,
    wise: sandboxEnabled,
  };

  // Live flags are always forced OFF if sandbox is still enabled.
  if (sandboxEnabled) {
    return {
      provider_sandbox,
      provider_live: { stripe: false, paypal: false, wise: false },
    };
  }

  // Live mode guard: only allow provider_live.* when sandbox is OFF.
  // Additionally validate required credentials for each enabled provider.
  const hasStripeCreds =
    hasNonEmpty(env("STRIPE_SECRET_KEY")) &&
    hasNonEmpty(env("STRIPE_WEBHOOK_SECRET"));

  const hasPaypalCreds =
    hasNonEmpty(env("PAYPAL_CLIENT_ID")) &&
    hasNonEmpty(env("PAYPAL_CLIENT_SECRET")) &&
    hasNonEmpty(env("PAYPAL_WEBHOOK_ID"));

  const hasWiseCreds =
    hasNonEmpty(env("WISE_API_KEY")) &&
    hasNonEmpty(env("WISE_PROFILE_ID"));


  const provider_live: PaymentProviderLiveFlags = {
    stripe: Boolean(requestedLive.stripe && hasStripeCreds),
    paypal: Boolean(requestedLive.paypal && hasPaypalCreds),
    wise: Boolean(requestedLive.wise && hasWiseCreds),
  };

  return { provider_sandbox, provider_live };
}

export function getPaymentConfigFromEnv(): PaymentConfig {
  loadRuntimeEnv();
  // Deterministic, governance-safe config resolution.
  // - Sandbox mode defaults to ON.
  // - Live mode is only enabled when sandbox is OFF AND required credentials exist.
  const sandboxEnabled = envBool("PAYMENTS_SANDBOX_ENABLED", true);

  const requestedLive: PaymentProviderLiveFlags = {
    stripe: envBool("PROVIDER_LIVE_STRIPE", false),
    paypal: envBool("PROVIDER_LIVE_PAYPAL", false),
    wise: envBool("PROVIDER_LIVE_WISE", false),
  };

  const { provider_sandbox, provider_live } = resolveProviderFlags({
    sandboxEnabled,
    requestedLive,
  });

  // webhook_secret is a generic fallback; provider-specific secrets should be
  // validated where they are used (e.g. STRIPE_WEBHOOK_SECRET, etc.).
  const webhook_secret = env("PAYMENT_WEBHOOK_SECRET") ?? "dev-secret";


  // Best-effort startup log (no secrets).
  // eslint-disable-next-line no-console
  console.log("[payments] config", {
    sandbox_enabled: sandboxEnabled,
    provider_sandbox,
    provider_live: {
      stripe: provider_live.stripe,
      paypal: provider_live.paypal,
      wise: provider_live.wise,
    },
    webhook_secret_set: hasNonEmpty(webhook_secret),
  });

  return {
    sandbox_enabled: sandboxEnabled,
    provider_sandbox,
    provider_live,
    webhook_secret,
  };
}


