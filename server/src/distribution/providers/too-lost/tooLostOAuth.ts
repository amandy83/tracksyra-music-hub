import { randomBytes, createHash } from "crypto";

import { loadRuntimeEnv } from "../../../config/envLoader";
import type { TooLostConfig, TooLostOAuthToken, TooLostProviderHealth } from "./tooLostTypes";

const DEFAULT_DSP_TARGETS = ["spotify", "apple_music", "youtube_music", "amazon_music", "tiktok"];
export const TOO_LOST_APPROVED_SCOPES = [
  "read:catalog",
  "read:analytics",
  "read:releases",
  "read:profile",
  "read:preferences",
  "write:releases",
  "write:preferences",
  "read:earnings",
  "read:audience",
  "read:sales",
] as const;

export function readTooLostConfig(overrides: Partial<TooLostConfig> = {}): TooLostConfig {
  loadRuntimeEnv();
  const apiUrl = trimTrailingSlash(
    overrides.apiUrl ?? readEnvOneOf(["TOO_LOST_API_BASE_URL", "TOO_LOST_API_URL"]),
  );
  return {
    clientId: overrides.clientId ?? readEnv("TOO_LOST_CLIENT_ID"),
    clientSecret: overrides.clientSecret ?? readEnv("TOO_LOST_CLIENT_SECRET"),
    webhookSecret: overrides.webhookSecret ?? readEnv("TOO_LOST_WEBHOOK_SECRET"),
    apiUrl,
    oauthAuthorizeUrl: overrides.oauthAuthorizeUrl ?? readEnvOneOf(["TOO_LOST_AUTHORIZE_URL", "TOO_LOST_OAUTH_AUTHORIZE_URL"]),
    oauthTokenUrl: overrides.oauthTokenUrl ?? readEnvOneOf(["TOO_LOST_TOKEN_URL", "TOO_LOST_OAUTH_TOKEN_URL"]),
    redirectUri: overrides.redirectUri ?? readEnvOneOf(["TOO_LOST_REDIRECT_URI", "TOO_LOST_OAUTH_REDIRECT_URI"]),
    tokenEncryptionKey: overrides.tokenEncryptionKey ?? readEnv("TOO_LOST_TOKEN_ENCRYPTION_KEY"),
    accountProfileUrl: overrides.accountProfileUrl ?? (readEnv("TOO_LOST_ACCOUNT_PROFILE_URL") || null),
    dspTargets: overrides.dspTargets ?? parseCsv(readEnv("TOO_LOST_DSP_TARGETS")) ?? DEFAULT_DSP_TARGETS,
    sandboxMode: overrides.sandboxMode ?? readBoolean("TOO_LOST_SANDBOX_MODE", true),
    liveApproved: overrides.liveApproved ?? readBoolean("TOO_LOST_INTEGRATION_APPROVED", false),
  };
}

export function createTooLostOAuthAuthorizationUrl(input: {
  config?: TooLostConfig;
  state?: string;
  scopes?: string[];
  codeChallenge?: string;
  returnToPath?: string | null;
} = {}): { url: string; state: string; codeVerifier: string } {
  const config = input.config ?? readTooLostConfig();
  if (!config.clientId) throw new Error("Too Lost OAuth client ID is required.");
  if (!config.redirectUri) throw new Error("Too Lost OAuth redirect URI is required.");
  if (!config.oauthAuthorizeUrl) throw new Error("Too Lost OAuth authorize URL is required.");
  const state = input.state ?? randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = input.codeChallenge ?? createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(config.oauthAuthorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", (input.scopes ?? [...TOO_LOST_APPROVED_SCOPES]).join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.returnToPath) url.searchParams.set("return_to", input.returnToPath);
  return { url: url.toString(), state, codeVerifier };
}

export async function exchangeTooLostOAuthCode(input: {
  code: string;
  codeVerifier: string;
  config?: TooLostConfig;
  httpClient?: typeof fetch;
}): Promise<TooLostOAuthToken> {
  const config = input.config ?? readTooLostConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Too Lost OAuth client credentials are required for live token exchange.");
  }
  if (!config.redirectUri) {
    throw new Error("Too Lost OAuth redirect URI is required for live token exchange.");
  }
  if (!config.oauthTokenUrl) {
    throw new Error("Too Lost OAuth token URL is required for live token exchange.");
  }

  const response = await (input.httpClient ?? fetch)(config.oauthTokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Too Lost OAuth token exchange failed: ${body?.error_description || body?.message || response.statusText}`);
  return {
    accessToken: String(body.access_token),
    refreshToken: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null,
    tokenType: "Bearer",
    scope: body.scope ?? null,
  };
}

export async function refreshTooLostOAuthToken(input: {
  refreshToken: string;
  config?: TooLostConfig;
  httpClient?: typeof fetch;
}): Promise<TooLostOAuthToken> {
  const config = input.config ?? readTooLostConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Too Lost OAuth client credentials are required for token refresh.");
  }
  if (!config.oauthTokenUrl) {
    throw new Error("Too Lost OAuth token URL is required for token refresh.");
  }
  const response = await (input.httpClient ?? fetch)(config.oauthTokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const body = await response.json() as any;
  if (!response.ok) throw new Error(`Too Lost OAuth refresh failed: ${body?.error_description || body?.message || response.statusText}`);
  return {
    accessToken: String(body.access_token),
    refreshToken: body.refresh_token ?? input.refreshToken ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000).toISOString() : null,
    tokenType: "Bearer",
    scope: body.scope ?? null,
  };
}

export function getTooLostProviderHealth(config: TooLostConfig = readTooLostConfig()): TooLostProviderHealth {
  const oauthReady = Boolean(config.clientId && config.clientSecret && config.redirectUri);
  const webhookReady = Boolean(config.webhookSecret);
  const encryptionReady = Boolean(config.tokenEncryptionKey);
  const configured = oauthReady && webhookReady && encryptionReady;
  const status = config.sandboxMode
    ? "sandbox_ready"
    : !config.liveApproved
      ? "credentials_pending"
      : configured
        ? "live_ready"
        : "not_configured";
  return {
    provider: "too_lost",
    mode: config.sandboxMode ? "sandbox" : "live",
    configured,
    oauthReady,
    webhookReady,
    liveApproved: config.liveApproved,
    status,
    checks: [
      { name: "OAuth client ID", ok: Boolean(config.clientId), message: config.clientId ? "configured" : "pending approval" },
      { name: "OAuth client secret", ok: Boolean(config.clientSecret), message: config.clientSecret ? "configured" : "pending approval" },
      { name: "OAuth redirect URI", ok: Boolean(config.redirectUri), message: config.redirectUri || "not configured" },
      { name: "Token encryption key", ok: encryptionReady, message: encryptionReady ? "configured" : "required for encrypted token storage" },
      { name: "Webhook secret", ok: webhookReady, message: webhookReady ? "configured" : "pending approval" },
      { name: "Sandbox mode", ok: config.sandboxMode, message: config.sandboxMode ? "enabled" : "disabled" },
      { name: "Live integration approval", ok: config.liveApproved, message: config.liveApproved ? "approved" : "not approved" },
    ],
  };
}

function readEnv(key: string, fallback = ""): string {
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key] ?? fallback;
}

function readEnvOneOf(keys: string[]): string {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) return value;
  }
  return "";
}

function readBoolean(key: string, fallback: boolean): boolean {
  const value = readEnv(key);
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseCsv(value: string): string[] | null {
  const items = value.split(",").map((part) => part.trim()).filter(Boolean);
  return items.length ? items : null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
