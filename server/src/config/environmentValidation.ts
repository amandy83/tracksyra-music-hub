import { getRequiredServerEnvNames, loadRuntimeEnv } from "./envLoader";

export type EnvironmentValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function validateProductionEnvironment(): EnvironmentValidationResult {
  loadRuntimeEnv();
  const env = getEnv();
  const production = env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  requireWhen(production, "REDIS_URL", errors);
  requireWhen(production, "PAYMENT_DATABASE_URL", errors);
  requireWhen(production, "REVELATOR_API_KEY", errors);
  for (const name of getRequiredServerEnvNames()) requireAlways(name, errors);

  const hasResend = Boolean(env.RESEND_API_KEY);
  const hasSmtp = Boolean(env.SMTP_HOST && (env.SMTP_USERNAME || env.SMTP_USER) && (env.SMTP_PASSWORD || env.SMTP_PASS));
  if (production && !hasResend && !hasSmtp) errors.push("RESEND_API_KEY or SMTP_* configuration is required in production.");
  if (!production && !hasResend && !hasSmtp) warnings.push("Email provider is not configured; local fallback may be used.");

  const webhookSecrets = [
    "PAYMENT_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET",
    "PAYPAL_WEBHOOK_SECRET",
    "REVELATOR_WEBHOOK_SECRET",
  ];
  if (production && webhookSecrets.every((name) => !env[name])) {
    errors.push("At least one webhook secret must be configured in production.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function assertProductionEnvironment() {
  const result = validateProductionEnvironment();
  if (!result.ok) throw new Error(`Environment validation failed: ${result.errors.join("; ")}`);
  return result;
}

function requireWhen(condition: boolean, name: string, errors: string[]) {
  if (condition && !getEnv()[name]) errors.push(`${name} is required in production.`);
}

function requireAlways(name: string, errors: string[]) {
  if (!getEnv()[name]) errors.push(`${name} is required.`);
}

function getEnv(): Record<string, string | undefined> {
  return typeof globalThis !== "undefined" && (globalThis as any).process?.env
    ? (globalThis as any).process.env
    : {};
}
