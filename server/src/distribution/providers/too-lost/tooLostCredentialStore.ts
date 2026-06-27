import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { loadRuntimeEnv } from "../../../config/envLoader";
import { logger } from "../../../observability/logger";
import { readTooLostConfig } from "./tooLostOAuth";
import type {
  TooLostConnectionStatus,
  TooLostOAuthStateRecord,
  TooLostOAuthToken,
  TooLostProviderHealth,
} from "./tooLostTypes";

type DbClient = SupabaseClient<any, "public", any>;

type TokenEnvelope = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

export type StoredTooLostOAuthState = {
  state: string;
  codeVerifier: string;
  redirectUri?: string | null;
  returnToPath?: string | null;
  scopes: string[];
  expiresAt: string;
};

export type TooLostStoredCredentials = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  tokenType: string | null;
  tokenScopes: string[] | null;
  connectedAccountId: string | null;
  connectedAccountName: string | null;
  connectedAccountEmail: string | null;
  lastRefreshAt: string | null;
  lastValidatedAt: string | null;
  credentialStatus: string | null;
  validationError: string | null;
};

export class TooLostCredentialStore {
  constructor(private client: DbClient = createServiceClient()) {}

  async syncProviderConfiguration(): Promise<void> {
    const config = readTooLostConfig();
    const now = new Date().toISOString();
    const oauthConfigured = Boolean(config.clientId && config.clientSecret && config.redirectUri);
    logger.info("Too Lost provider config resolved", {
      component: "too-lost-credential-store",
      clientIdPresent: Boolean(config.clientId),
      clientSecretPresent: Boolean(config.clientSecret),
      redirectUri: config.redirectUri || null,
      apiUrl: config.apiUrl || null,
      authorizeUrl: config.oauthAuthorizeUrl || null,
      tokenUrl: config.oauthTokenUrl || null,
      webhookSecretPresent: Boolean(config.webhookSecret),
      tokenEncryptionKeyPresent: Boolean(config.tokenEncryptionKey),
      sandboxMode: config.sandboxMode,
      liveApproved: config.liveApproved,
    });
    const { data: existing, error: readError } = await this.client
      .from("distribution_providers")
      .select("api_base_url,is_enabled,sync_status,sandbox_mode,live_approved,oauth_authorize_url,oauth_token_url,oauth_redirect_uri,webhook_endpoint_path,config")
      .eq("provider", "too_lost")
      .maybeSingle();
    if (readError) throw new Error(`Failed to read current Too Lost provider configuration: ${readError.message}`);

    const { error } = await this.client.from("distribution_providers").upsert({
      provider: "too_lost",
      display_name: "Too Lost",
      api_base_url: config.apiUrl || existing?.api_base_url || "https://api.toolost.com",
      is_enabled: oauthConfigured ? true : Boolean(existing?.is_enabled ?? false),
      sync_status: oauthConfigured
        ? config.liveApproved
          ? "connected"
          : "pending_app_approval"
        : String(existing?.sync_status || "credentials_required"),
      sandbox_mode: config.sandboxMode ?? Boolean(existing?.sandbox_mode ?? true),
      live_approved: config.liveApproved ?? Boolean(existing?.live_approved ?? false),
      oauth_authorize_url: config.oauthAuthorizeUrl || existing?.oauth_authorize_url || null,
      oauth_token_url: config.oauthTokenUrl || existing?.oauth_token_url || null,
      oauth_redirect_uri: config.redirectUri || existing?.oauth_redirect_uri || null,
      webhook_endpoint_path: existing?.webhook_endpoint_path || "/api/webhooks/too-lost",
      config: {
        ...(typeof existing?.config === "object" && existing?.config ? existing.config as Record<string, unknown> : {}),
        oauth_redirect_uri: config.redirectUri || existing?.oauth_redirect_uri || null,
        sandbox_mode: config.sandboxMode,
        live_approved: config.liveApproved,
      },
      updated_at: now,
    }, { onConflict: "provider" });
    if (error) throw new Error(`Failed to sync Too Lost provider configuration: ${error.message}`);

    const { error: credentialError } = await this.client.from("distribution_provider_credentials").upsert({
      provider: "too_lost",
      auth_type: "oauth2",
      client_id_set: Boolean(config.clientId),
      client_secret_set: Boolean(config.clientSecret),
      webhook_secret_set: Boolean(config.webhookSecret),
      credential_status: oauthConfigured ? "configured" : "pending_approval",
      updated_at: now,
    }, { onConflict: "provider" });
    if (credentialError) throw new Error(`Failed to sync Too Lost credential configuration: ${credentialError.message}`);
  }

  async initializePendingCredentialRecord(): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client.from("distribution_provider_credentials").upsert({
      provider: "too_lost",
      auth_type: "oauth2",
      client_id_set: Boolean(readTooLostConfig().clientId),
      client_secret_set: Boolean(readTooLostConfig().clientSecret),
      webhook_secret_set: Boolean(readTooLostConfig().webhookSecret),
      credential_status: "pending_approval",
      updated_at: now,
    }, { onConflict: "provider" });
    if (error) throw new Error(`Failed to initialize Too Lost credential record: ${error.message}`);
  }

  async storeOAuthState(input: StoredTooLostOAuthState & { createdBy?: string | null }): Promise<void> {
    const encryptedVerifier = encryptSecret(input.codeVerifier);
    const { error } = await this.client.from("distribution_provider_oauth_states").insert({
      provider: "too_lost",
      state: input.state,
      code_verifier_ref: makeSecretRef("too_lost_oauth_code_verifier", input.codeVerifier),
      code_verifier_encrypted: encryptedVerifier,
      return_to_path: input.returnToPath ?? null,
      redirect_uri: input.redirectUri ?? null,
      scopes: input.scopes,
      status: "created",
      expires_at: input.expiresAt,
      created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(`Failed to store Too Lost OAuth state: ${error.message}`);
  }

  async loadOAuthState(state: string): Promise<TooLostOAuthStateRecord | null> {
    const { data, error } = await this.client
      .from("distribution_provider_oauth_states")
      .select("state,code_verifier_encrypted,return_to_path,redirect_uri,scopes,status,expires_at,completed_at")
      .eq("provider", "too_lost")
      .eq("state", state)
      .maybeSingle();
    if (error) throw new Error(`Failed to read Too Lost OAuth state: ${error.message}`);
    if (!data || data.status !== "created") return null;
    if (data.completed_at) return null;
    if (new Date(data.expires_at).getTime() <= Date.now()) return null;
    return {
      state: data.state,
      codeVerifier: decryptSecret(data.code_verifier_encrypted),
      returnToPath: data.return_to_path ?? null,
      redirectUri: data.redirect_uri ?? null,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
    };
  }

  async markOAuthStateCompleted(state: string): Promise<void> {
    const { error } = await this.client
      .from("distribution_provider_oauth_states")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("provider", "too_lost")
      .eq("state", state);
    if (error) throw new Error(`Failed to complete Too Lost OAuth state: ${error.message}`);
  }

  async storeTokenSet(token: TooLostOAuthToken, input: {
    connectedAccountId?: string | null;
    connectedAccountName?: string | null;
    connectedAccountEmail?: string | null;
  } = {}): Promise<{ accessTokenRef: string; refreshTokenRef: string | null }> {
    const accessTokenRef = makeSecretRef("too_lost_access_token", token.accessToken);
    const refreshTokenRef = token.refreshToken ? makeSecretRef("too_lost_refresh_token", token.refreshToken) : null;
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("distribution_provider_credentials")
      .update({
        access_token_ref: accessTokenRef,
        refresh_token_ref: refreshTokenRef,
        access_token_encrypted: encryptSecret(token.accessToken),
        refresh_token_encrypted: token.refreshToken ? encryptSecret(token.refreshToken) : null,
        token_expires_at: token.expiresAt ?? null,
        token_type: token.tokenType,
        token_scopes: parseScopes(token.scope),
        connected_account_id: input.connectedAccountId ?? null,
        connected_account_name: input.connectedAccountName ?? null,
        connected_account_email: input.connectedAccountEmail ?? null,
        credential_status: "configured",
        last_validated_at: now,
        last_refresh_at: now,
        validation_error: null,
        updated_at: now,
      })
      .eq("provider", "too_lost");
    if (error) throw new Error(`Failed to store Too Lost token references: ${error.message}`);
    return { accessTokenRef, refreshTokenRef };
  }

  async loadTokenSet(): Promise<TooLostStoredCredentials | null> {
    const { data, error } = await this.client
      .from("distribution_provider_credentials")
      .select("access_token_encrypted,refresh_token_encrypted,token_expires_at,token_type,token_scopes,connected_account_id,connected_account_name,connected_account_email,last_refresh_at,last_validated_at,credential_status,validation_error")
      .eq("provider", "too_lost")
      .maybeSingle();
    if (error) throw new Error(`Failed to read Too Lost token references: ${error.message}`);
    if (!data) return null;
    return {
      accessToken: data.access_token_encrypted ? decryptSecret(data.access_token_encrypted) : null,
      refreshToken: data.refresh_token_encrypted ? decryptSecret(data.refresh_token_encrypted) : null,
      tokenExpiresAt: data.token_expires_at ?? null,
      tokenType: data.token_type ?? null,
      tokenScopes: Array.isArray(data.token_scopes) ? data.token_scopes : null,
      connectedAccountId: data.connected_account_id ?? null,
      connectedAccountName: data.connected_account_name ?? null,
      connectedAccountEmail: data.connected_account_email ?? null,
      lastRefreshAt: data.last_refresh_at ?? null,
      lastValidatedAt: data.last_validated_at ?? null,
      credentialStatus: data.credential_status ?? null,
      validationError: data.validation_error ?? null,
    };
  }

  async clearConnection(reason = "Disconnected by operator"): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("distribution_provider_credentials")
      .update({
        access_token_ref: null,
        refresh_token_ref: null,
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expires_at: null,
        token_type: null,
        token_scopes: [],
        connected_account_id: null,
        connected_account_name: null,
        connected_account_email: null,
        credential_status: "revoked",
        validation_error: reason,
        updated_at: now,
      })
      .eq("provider", "too_lost");
    if (error) throw new Error(`Failed to clear Too Lost token references: ${error.message}`);

    const { error: providerError } = await this.client
      .from("distribution_providers")
      .update({
        is_enabled: false,
        sync_status: "disconnected",
        last_sync_at: null,
        updated_at: now,
      })
      .eq("provider", "too_lost");
    if (providerError) throw new Error(`Failed to clear Too Lost provider status: ${providerError.message}`);
  }

  async updateProviderSyncStatus(input: {
    syncStatus: string;
    lastSyncAt?: string | null;
    lastError?: string | null;
    isEnabled?: boolean;
  }): Promise<void> {
    const { error } = await this.client
      .from("distribution_providers")
      .update({
        sync_status: input.syncStatus,
        last_sync_at: input.lastSyncAt ?? null,
        is_enabled: input.isEnabled ?? true,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "too_lost");
    if (error) throw new Error(`Failed to update Too Lost provider sync status: ${error.message}`);

    if (input.lastError) {
      const { error: credentialError } = await this.client
        .from("distribution_provider_credentials")
        .update({
          validation_error: input.lastError,
          updated_at: new Date().toISOString(),
        })
        .eq("provider", "too_lost");
      if (credentialError) throw new Error(`Failed to persist Too Lost sync error: ${credentialError.message}`);
    }
  }

  async recordHealth(health: TooLostProviderHealth): Promise<void> {
    const rows = health.checks.map((check) => ({
      provider: "too_lost",
      check_name: check.name,
      status: check.ok ? "PASS" : health.mode === "sandbox" ? "WARN" : "FAIL",
      response_time_ms: 0,
      request: { mode: health.mode, liveApproved: health.liveApproved },
      response: { status: health.status, message: check.message },
      failure_reason: check.ok ? null : check.message,
    }));
    const { error } = await this.client.from("distribution_provider_health_checks").insert(rows);
    if (error) throw new Error(`Failed to record Too Lost health checks: ${error.message}`);
  }

  async recordSyncLog(input: {
    syncType: string;
    status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
    request?: unknown;
    response?: unknown;
    failureReason?: string | null;
    distributionJobId?: string | null;
    releaseId?: string | null;
    trackId?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("distribution_sync_logs").insert({
      provider: "too_lost",
      release_id: input.releaseId ?? null,
      track_id: input.trackId ?? null,
      distribution_job_id: input.distributionJobId ?? null,
      sync_type: input.syncType,
      status: input.status,
      api_request: input.request ?? {},
      api_response: input.response ?? {},
      failure_reason: input.failureReason ?? null,
    });
    if (error) throw new Error(`Failed to record Too Lost sync log: ${error.message}`);
  }

  async recordSandboxRun(input: {
    runType: "oauth" | "release_submission" | "analytics_sync" | "webhook" | "failure_recovery";
    status?: "PASS" | "WARN" | "FAIL" | "SKIPPED";
    request?: unknown;
    response?: unknown;
    notes?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("distribution_provider_sandbox_runs").insert({
      provider: "too_lost",
      run_type: input.runType,
      status: input.status ?? "PASS",
      request: input.request ?? { mode: "sandbox" },
      response: input.response ?? { message: "Too Lost workflow completed." },
      notes: input.notes ?? null,
    });
    if (error) throw new Error(`Failed to record Too Lost sandbox run: ${error.message}`);
  }

  async getConnectionStatus(): Promise<TooLostConnectionStatus> {
    const credentials = await this.loadTokenSet();
    const { data: provider, error: providerError } = await this.client
      .from("distribution_providers")
      .select("sync_status,last_sync_at,is_enabled,live_approved")
      .eq("provider", "too_lost")
      .maybeSingle();
    if (providerError) throw new Error(`Failed to read Too Lost provider status: ${providerError.message}`);

    const { data: oauthState, error: oauthError } = await this.client
      .from("distribution_provider_oauth_states")
      .select("expires_at,status")
      .eq("provider", "too_lost")
      .eq("status", "created")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (oauthError) throw new Error(`Failed to read Too Lost OAuth state: ${oauthError.message}`);

    const expiresAt = credentials?.tokenExpiresAt ?? null;
    const expiresSoon = expiresAt ? new Date(expiresAt).getTime() - Date.now() <= 5 * 60 * 1000 : false;
    const connected = Boolean(credentials?.accessToken && provider?.is_enabled !== false);
    const canRefresh = Boolean(credentials?.refreshToken);
    const connectionStatus: TooLostConnectionStatus["connectionStatus"] = !credentials?.accessToken
      ? "needs_authorization"
      : expiresAt && new Date(expiresAt).getTime() <= Date.now()
        ? canRefresh ? "expired" : "refresh_failed"
        : expiresSoon && canRefresh
          ? "connected"
          : "connected";

    return {
      connected,
      connectionStatus,
      accountStatus: credentials?.credentialStatus || (connected ? "configured" : "pending_approval"),
      distributionStatus: String(provider?.sync_status || "not configured"),
      connectedAccount: {
        id: credentials?.connectedAccountId ?? null,
        name: credentials?.connectedAccountName ?? null,
        email: credentials?.connectedAccountEmail ?? null,
      },
      lastSyncAt: provider?.last_sync_at ?? null,
      lastRefreshAt: credentials?.lastRefreshAt ?? null,
      tokenExpiresAt: credentials?.tokenExpiresAt ?? null,
      oauthStateExpiresAt: oauthState?.expires_at ?? null,
      readyForLiveRequests: Boolean(credentials?.accessToken && credentials?.refreshToken),
      canRefresh,
      lastError: credentials?.validationError ?? null,
      provider: "too_lost",
    };
  }
}

export function makeCodeVerifierRef(codeVerifier: string): string {
  return makeSecretRef("too_lost_oauth_code_verifier", codeVerifier);
}

function makeSecretRef(prefix: string, secret: string): string {
  const digest = createHash("sha256").update(secret).digest("hex").slice(0, 16);
  return `${prefix}:${digest}`;
}

function encryptSecret(secret: string): TokenEnvelope {
  const key = deriveKey(readTooLostConfig().tokenEncryptionKey);
  if (!key) throw new Error("TOO_LOST_TOKEN_ENCRYPTION_KEY is required for encrypted token storage.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptSecret(value: unknown): string {
  const payload = normalizeEnvelope(value);
  const key = deriveKey(readTooLostConfig().tokenEncryptionKey);
  if (!key) throw new Error("TOO_LOST_TOKEN_ENCRYPTION_KEY is required for encrypted token storage.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function normalizeEnvelope(value: unknown): TokenEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid encrypted token payload.");
  }
  const envelope = value as Partial<TokenEnvelope>;
  if (envelope.v !== 1 || envelope.alg !== "aes-256-gcm" || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    throw new Error("Invalid encrypted token payload.");
  }
  return envelope as TokenEnvelope;
}

function deriveKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest();
}

function parseScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
}

function createServiceClient(): DbClient {
  loadRuntimeEnv();
  const env = (globalThis as any).process?.env as Record<string, string | undefined>;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Too Lost credential storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
