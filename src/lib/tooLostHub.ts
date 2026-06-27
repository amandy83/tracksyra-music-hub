import type { LucideIcon } from "lucide-react";
import { Activity, BarChart3, CheckCircle2, Cloud, CreditCard, Gauge, Globe2, RadioTower, ShieldCheck, Smartphone, Sparkles, TrendingUp, Users } from "lucide-react";

export const TOO_LOST_PROVIDER_KEY = "too_lost" as const;
export const TOO_LOST_API_BASE_URL = "https://api.toolost.com";
export const TOO_LOST_OAUTH_AUTHORIZE_URL = `${TOO_LOST_API_BASE_URL}/oauth/authorize`;
export const TOO_LOST_OAUTH_TOKEN_URL = `${TOO_LOST_API_BASE_URL}/oauth/token`;
export const TOO_LOST_WEBHOOK_PATH = "/api/webhooks/too-lost";

export const TOO_LOST_DSP_TARGETS = ["spotify", "apple_music", "youtube_music", "amazon_music", "tiktok"] as const;

export type TooLostMode = "sandbox" | "live";

export type TooLostReadinessRow = {
  provider: string;
  display_name: string;
  is_enabled: boolean;
  sync_status: string;
  sandbox_mode: boolean;
  live_approved: boolean;
  api_base_url: string | null;
  oauth_authorize_url: string | null;
  oauth_token_url: string | null;
  oauth_redirect_uri: string | null;
  webhook_endpoint_path: string | null;
  client_id_set: boolean | null;
  client_secret_set: boolean | null;
  webhook_secret_set: boolean | null;
  credential_status: string | null;
  last_validated_at: string | null;
  validation_error: string | null;
  updated_at: string;
};

export type TooLostHealthRow = {
  id: string;
  check_name: string;
  status: string;
  response_time_ms: number | null;
  failure_reason: string | null;
  checked_at: string;
};

export type TooLostSandboxRow = {
  id: string;
  run_type: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export type TooLostConnectionStatus = {
  connected: boolean;
  connectionStatus: string;
  accountStatus: string;
  distributionStatus: string;
  connectedAccount: {
    id: string | null;
    name: string | null;
    email: string | null;
  };
  lastSyncAt: string | null;
  lastRefreshAt: string | null;
  tokenExpiresAt: string | null;
  oauthStateExpiresAt: string | null;
  readyForLiveRequests: boolean;
  canRefresh: boolean;
  lastError: string | null;
  provider: "too_lost";
};

export type TooLostReleaseStatusSnapshot = {
  releaseId: string;
  releaseTitle: string | null;
  releaseStatus: string | null;
  providerStatus: string;
  distributionStatus: string;
  providerReleaseId: string | null;
  trackStatuses: Array<{
    trackId: string;
    title: string | null;
    jobStatus: string | null;
    deliveryStatus: string | null;
    providerTrackId: string | null;
    updatedAt: string | null;
  }>;
};

export type TooLostSyncResult = {
  status: TooLostConnectionStatus;
  syncedAt: string;
  releaseCount: number;
  analytics: {
    imported: boolean;
    reason: string;
    streams: number;
    audience: number;
    earnings: number;
    sales: number;
  } | null;
};

export type TooLostReleaseSignal = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  primary_artist?: string;
  release_date?: string | null;
  delivery?: string;
  sync?: string;
  availability?: string;
  readiness?: number;
};

export type TooLostCampaignSignal = {
  id: string;
  name: string;
  status: string;
  platform: string;
  budget: number;
  start_date: string | null;
  end_date: string | null;
};

export type TooLostMetric = {
  label: string;
  value: string | number;
  helper: string;
  icon: LucideIcon;
  tone: "pink" | "teal" | "amber" | "blue" | "green" | "slate";
};

export const TOO_LOST_ADMIN_CHECKS = [
  { label: "Too Lost Provider Configuration", icon: ShieldCheck },
  { label: "OAuth Status", icon: CheckCircle2 },
  { label: "Sync Status", icon: Activity },
  { label: "API Health", icon: Gauge },
  { label: "Webhook Status", icon: Cloud },
] as const;

export const TOO_LOST_ARTIST_FOCUS = [
  { label: "DSP Marketing Dashboard", icon: Sparkles },
  { label: "Release Delivery Tracker", icon: RadioTower },
  { label: "DSP Readiness Score", icon: TrendingUp },
  { label: "Campaign Center", icon: CreditCard },
  { label: "Playlist Pitching Center", icon: Users },
  { label: "Analytics Overview", icon: BarChart3 },
] as const;

export function getTooLostActivationState(readiness?: Partial<TooLostReadinessRow> | null) {
  const sandboxMode = readiness?.sandbox_mode ?? true;
  const liveApproved = readiness?.live_approved ?? false;
  const clientConfigured = Boolean(readiness?.client_id_set && readiness?.client_secret_set);
  const webhookConfigured = Boolean(readiness?.webhook_secret_set);
  const active = Boolean(readiness?.is_enabled) && clientConfigured && webhookConfigured;
  const mode: TooLostMode = sandboxMode ? "sandbox" : "live";
  const status = active
    ? liveApproved && !sandboxMode
      ? "live_ready"
      : "sandbox_ready"
    : liveApproved
      ? "approval_pending_activation"
      : "pending_approval";

  return {
    mode,
    status,
    liveApproved,
    clientConfigured,
    webhookConfigured,
    active,
    oauthReady: clientConfigured && Boolean(readiness?.oauth_redirect_uri),
    providerReady: clientConfigured && webhookConfigured,
  };
}

export function getTooLostReadinessScore(readiness?: Partial<TooLostReadinessRow> | null, health: TooLostHealthRow[] = [], sandboxRuns: TooLostSandboxRow[] = []) {
  const checks = [
    readiness?.is_enabled,
    readiness?.client_id_set,
    readiness?.client_secret_set,
    readiness?.webhook_secret_set,
    readiness?.oauth_redirect_uri,
    readiness?.api_base_url,
    readiness?.oauth_authorize_url,
    readiness?.oauth_token_url,
  ].filter(Boolean).length;

  const healthPasses = health.filter((item) => item.status === "PASS").length;
  const sandboxPasses = sandboxRuns.filter((item) => item.status === "PASS").length;
  return Math.min(100, Math.max(15, checks * 10 + healthPasses * 4 + sandboxPasses * 5));
}

export function formatTooLostStatus(value: string | null | undefined) {
  return String(value || "pending").replace(/_/g, " ").toLowerCase();
}

export function buildTooLostMetrics(input: {
  releaseCount: number;
  syncQueue: number;
  liveDeliveries: number;
  analyticsRows: number;
  catalogReady: number;
  campaigns: number;
  readinessScore: number;
}): TooLostMetric[] {
  return [
    { label: "Release Sync", value: input.releaseCount, helper: "Tracked releases in Too Lost flow", icon: RadioTower, tone: "pink" },
    { label: "Distribution Sync", value: input.syncQueue, helper: "Queued or in-flight provider jobs", icon: Activity, tone: "teal" },
    { label: "DSP Availability", value: input.liveDeliveries, helper: "Active store deliveries and live links", icon: Globe2, tone: "blue" },
    { label: "Analytics Import", value: input.analyticsRows, helper: "Imported streaming and campaign signals", icon: BarChart3, tone: "green" },
    { label: "Catalog Sync", value: input.catalogReady, helper: "Releases ready for provider sync", icon: CheckCircle2, tone: "amber" },
    { label: "Campaign Tracking", value: input.campaigns, helper: "Campaigns tied to releases and promos", icon: CreditCard, tone: "slate" },
    { label: "DSP Readiness", value: `${input.readinessScore}%`, helper: "Activation score once OAuth is approved", icon: TrendingUp, tone: "pink" },
  ];
}
