import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Cloud, ExternalLink, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";
import {
  buildTooLostMetrics,
  formatTooLostStatus,
  getTooLostActivationState,
  getTooLostReadinessScore,
  TOO_LOST_ADMIN_CHECKS,
  TOO_LOST_API_BASE_URL,
  TOO_LOST_DSP_TARGETS,
  TOO_LOST_OAUTH_AUTHORIZE_URL,
  TOO_LOST_OAUTH_TOKEN_URL,
  TOO_LOST_PROVIDER_KEY,
  TOO_LOST_WEBHOOK_PATH,
  type TooLostCampaignSignal,
  type TooLostHealthRow,
  type TooLostReadinessRow,
  type TooLostReleaseSignal,
  type TooLostSandboxRow,
  type TooLostConnectionStatus,
} from "@/lib/tooLostHub";
import { buildTooLostAuthorizationUrl, disconnectTooLost, fetchTooLostStatus, syncTooLostNow } from "@/lib/tooLostApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const client = supabase as any;

type WorkspaceMode = "artist" | "admin";

type WorkspaceData = {
  readiness: TooLostReadinessRow | null;
  health: TooLostHealthRow[];
  sandboxRuns: TooLostSandboxRow[];
  releases: TooLostReleaseSignal[];
  campaigns: TooLostCampaignSignal[];
  syncLogs: Array<{ id: string; sync_type: string; status: string; created_at: string; failure_reason: string | null }>;
  deliveryCount: number;
  analyticsRows: number;
  playlistPitches: Array<{ id: string; target_playlist: string; status: string; created_at: string; platform: string }>;
};

const EMPTY_DATA: WorkspaceData = {
  readiness: null,
  health: [],
  sandboxRuns: [],
  releases: [],
  campaigns: [],
  syncLogs: [],
  deliveryCount: 0,
  analyticsRows: 0,
  playlistPitches: [],
};

export default function TooLostProviderWorkspace({ mode }: { mode: WorkspaceMode }) {
  const { user } = useAuth();
  const [data, setData] = useState<WorkspaceData>(EMPTY_DATA);
  const [tooLostStatus, setTooLostStatus] = useState<TooLostConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    const releaseTable = mode === "artist" ? "music_releases" : "music_releases";
    const releaseFilter = mode === "artist" && user ? client.from(releaseTable).select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false }).limit(8) : client.from(releaseTable).select("*").order("created_at", { ascending: false }).limit(8);
    const campaignsFilter = mode === "artist" && user ? client.from("ad_campaigns").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8) : client.from("ad_campaigns").select("*").order("created_at", { ascending: false }).limit(8);
    const pitchesFilter = mode === "artist" && user ? client.from("playlist_pitches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8) : client.from("playlist_pitches").select("*").order("created_at", { ascending: false }).limit(8);
    const analyticsFilter = mode === "artist" && user ? client.from("streaming_stats").select("*").eq("user_id", user.id) : client.from("streaming_stats").select("*");
    const songAnalyticsFilter = mode === "artist" && user ? client.from("song_analytics").select("*").eq("user_id", user.id) : client.from("song_analytics").select("*");
    const deliveryFilter = mode === "artist" && user ? client.from("platform_deliveries").select("*").eq("user_id", user.id) : client.from("platform_deliveries").select("*");
    const syncLogFilter = client.from("distribution_sync_logs").select("id,sync_type,status,created_at,failure_reason").eq("provider", TOO_LOST_PROVIDER_KEY).order("created_at", { ascending: false }).limit(10);
    const healthFilter = client.from("distribution_provider_health_checks").select("id,check_name,status,response_time_ms,failure_reason,checked_at").eq("provider", TOO_LOST_PROVIDER_KEY).order("checked_at", { ascending: false }).limit(10);
    const sandboxFilter = client.from("distribution_provider_sandbox_runs").select("id,run_type,status,notes,created_at").eq("provider", TOO_LOST_PROVIDER_KEY).order("created_at", { ascending: false }).limit(10);

    const [
      readinessResult,
      healthResult,
      sandboxResult,
      releaseResult,
      campaignResult,
      pitchResult,
      deliveryResult,
      syncLogResult,
      streamingResult,
      songAnalyticsResult,
    ] = await Promise.all([
      client.from("too_lost_provider_readiness").select("*").maybeSingle(),
      healthFilter,
      sandboxFilter,
      releaseFilter,
      campaignsFilter,
      pitchesFilter,
      deliveryFilter,
      syncLogFilter,
      analyticsFilter,
      songAnalyticsFilter,
    ]);

    const analyticsRows = [...(streamingResult.data || []), ...(songAnalyticsResult.data || [])].length;

    if (readinessResult.error) toast.error(readinessResult.error.message);
    if (healthResult.error) toast.error(healthResult.error.message);
    if (sandboxResult.error) toast.error(sandboxResult.error.message);

    setData({
      readiness: (readinessResult.data as TooLostReadinessRow | null) || null,
      health: (healthResult.data as TooLostHealthRow[]) || [],
      sandboxRuns: (sandboxResult.data as TooLostSandboxRow[]) || [],
      releases: normalizeReleaseRows(releaseResult.data || []),
      campaigns: normalizeCampaignRows(campaignResult.data || []),
      syncLogs: (syncLogResult.data || []) as WorkspaceData["syncLogs"],
      deliveryCount: (deliveryResult.data || []).filter((item: any) => ["delivered", "live", "DELIVERED", "LIVE", "PUBLISHED"].includes(String(item.status))).length,
      analyticsRows,
      playlistPitches: normalizePitches(pitchResult.data || []),
    });

    setLoading(false);
  };

  const loadTooLostStatus = async () => {
    setConnectionLoading(true);
    try {
      setTooLostStatus(await fetchTooLostStatus());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Too Lost status");
    } finally {
      setConnectionLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [mode, user?.id]);

  useEffect(() => {
    void loadTooLostStatus();
  }, [user?.id]);

  const activation = getTooLostActivationState(data.readiness);
  const readinessScore = getTooLostReadinessScore(data.readiness, data.health, data.sandboxRuns);
  const metrics = buildTooLostMetrics({
    releaseCount: data.releases.length,
    syncQueue: data.syncLogs.filter((item) => ["PENDING", "SUBMITTED", "PROCESSING"].includes(item.status)).length,
    liveDeliveries: data.deliveryCount,
    analyticsRows: data.analyticsRows,
    catalogReady: data.releases.filter((item) => ["approved", "sent_to_stores", "processing", "live"].includes(item.status)).length,
    campaigns: data.campaigns.length,
    readinessScore,
  });

  const lastSync = data.readiness?.updated_at ? new Date(data.readiness.updated_at).toLocaleString() : "No provider sync yet";

  const providerStateLabel = activation.liveApproved ? (activation.active ? "Auto-activates after OAuth approval" : "Awaiting activation") : "Sandbox ready";
  return (
    <div className="space-y-6">
      <GlassCard className="p-5">
        <SectionHeader
          title="Too Lost Production Connection"
          description="Live OAuth, token state, and sync controls for the production Too Lost integration."
          action={
            tooLostStatus?.connected ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleSyncNow()} disabled={connectionLoading}>
                  <Activity className="mr-2 h-4 w-4" /> Sync Now
                </Button>
                <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleDisconnect()} disabled={connectionLoading}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="hero" className="rounded-xl" onClick={() => void handleConnect()} disabled={connectionLoading}>
                <Sparkles className="mr-2 h-4 w-4" /> Connect Too Lost
              </Button>
            )
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StateRow label="Too Lost Connected" value={tooLostStatus?.connected ? "Connected" : "Disconnected"} tone="green" />
          <StateRow label="Account Status" value={tooLostStatus?.accountStatus || "pending_approval"} tone="slate" />
          <StateRow label="Distribution Status" value={tooLostStatus?.distributionStatus || "not configured"} tone="blue" />
          <StateRow
            label="Connected Account"
            value={tooLostStatus?.connectedAccount?.name || tooLostStatus?.connectedAccount?.email || tooLostStatus?.connectedAccount?.id || "Not linked"}
            tone="teal"
          />
          <StateRow
            label="Last Sync"
            value={tooLostStatus?.lastSyncAt ? new Date(tooLostStatus.lastSyncAt).toLocaleString() : "No sync yet"}
            tone="pink"
          />
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="relative p-5 sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(236,72,153,0.18),transparent_24%),radial-gradient(circle_at_85%_15%,rgba(20,184,166,0.18),transparent_22%),linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,247,251,0.92))]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Too Lost DSP Marketing Hub</h2>
                <Badge variant={activation.mode === "sandbox" ? "secondary" : "outline"}>{activation.mode === "sandbox" ? "Sandbox mode" : "Live mode"}</Badge>
                <Badge variant={activation.active ? "default" : "outline"}>{providerStateLabel}</Badge>
              </div>
              <p className="max-w-3xl text-sm text-slate-500">
                Provider-only architecture for release sync, status sync, DSP availability, analytics import, catalog sync, and campaign tracking.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-slate-950 hover:bg-slate-950">Primary DSP provider</Badge>
                <Badge variant="outline" className="bg-white/75">OAuth-ready</Badge>
                <Badge variant="outline" className="bg-white/75">Sandbox-safe</Badge>
                <Badge variant="outline" className="bg-white/75">Webhook aware</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
              <HeroStat label="Readiness score" value={`${readinessScore}%`} />
              <HeroStat label="Active releases" value={data.releases.length} />
              <HeroStat label="Sync logs" value={data.syncLogs.length} />
              <HeroStat label="Campaigns" value={data.campaigns.length} />
            </div>
          </div>
        </div>
      </GlassCard>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Provider Mode" value={activation.mode === "sandbox" ? "Sandbox" : "Live"} delta={activation.liveApproved ? 8 : 0} comparison="auto-switches once approved" icon={Sparkles} accent="pink" />
        <KpiCard label="OAuth Ready" value={activation.oauthReady ? "Ready" : "Pending"} delta={activation.oauthReady ? 6 : -4} comparison="approved credentials" icon={ShieldCheck} accent="teal" />
        <KpiCard label="Sync Status" value={formatTooLostStatus(data.readiness?.sync_status || "not configured")} delta={data.syncLogs.filter((item) => item.status === "PASS").length} comparison="release and analytics sync" icon={Activity} accent="blue" />
        <KpiCard label="API Health" value={data.health.filter((item) => item.status === "PASS").length || 0} delta={data.health.length ? 3 : 0} comparison="provider checks passed" icon={Cloud} accent="green" />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassCard className="p-5">
          <SectionHeader title={mode === "admin" ? "Provider Configuration" : "DSP Marketing Dashboard"} description={mode === "admin" ? "Canonical Too Lost configuration, sandbox gating, and OAuth activation state." : "Artist-facing provider status, delivery progress, and sync readiness."} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {metrics.map((metric) => (
              <MetricTile key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} icon={metric.icon} tone={metric.tone} />
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title={mode === "admin" ? "OAuth and Webhook Status" : "Release Delivery Tracker"} description={mode === "admin" ? "OAuth and webhook state are staged to activate automatically after approval." : "Release readiness, delivery progress, and store activation milestones."} />
          <div className="space-y-3">
            <StateRow label="API base" value={data.readiness?.api_base_url || TOO_LOST_API_BASE_URL} tone="slate" />
            <StateRow label="OAuth authorize" value={data.readiness?.oauth_authorize_url || TOO_LOST_OAUTH_AUTHORIZE_URL} tone="pink" />
            <StateRow label="OAuth token" value={data.readiness?.oauth_token_url || TOO_LOST_OAUTH_TOKEN_URL} tone="teal" />
            <StateRow label="Webhook path" value={data.readiness?.webhook_endpoint_path || TOO_LOST_WEBHOOK_PATH} tone="blue" />
            <StateRow label="Last sync" value={lastSync} tone="green" />
          </div>
        </GlassCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassCard className="p-5 xl:col-span-2">
          <SectionHeader title="Release / Catalog Sync" description="Tracks catalog readiness, provider queueing, and live delivery status." action={<Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
          <div className="space-y-3">
            {data.releases.length ? data.releases.map((release) => {
              const readiness = release.readiness ?? computeReleaseReadiness(release.status);
              return (
                <div key={release.id} className="rounded-2xl border border-white/80 bg-white/75 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{release.title}</p>
                      <p className="truncate text-xs text-slate-500">{release.primary_artist || "Artist"} {release.release_date ? `· ${new Date(release.release_date).toLocaleDateString()}` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{release.status}</Badge>
                        <Badge variant="secondary">Too Lost synced</Badge>
                        <Badge variant="outline">{release.sync || "sync pending"}</Badge>
                        <Badge variant="outline">{release.availability || `${TOO_LOST_DSP_TARGETS.length} DSP targets`}</Badge>
                      </div>
                    </div>
                    <div className="min-w-[220px]">
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        <span>Readiness</span>
                        <span>{readiness}%</span>
                      </div>
                      <Progress value={readiness} />
                    </div>
                  </div>
                </div>
              );
            }) : <EmptyStateRow title="No releases available" detail="Release sync will appear once catalogs are uploaded or approved." />}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title={mode === "admin" ? "Sync Status" : "Campaign Center"} description={mode === "admin" ? "Release and analytics sync logs. Sandbox mode records checks without live API calls." : "DSP campaign signals and paid promotion readiness."} />
          <div className="space-y-3">
            {mode === "admin" ? (
              <>
                {data.syncLogs.length ? data.syncLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-white/80 bg-white/75 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold capitalize">{log.sync_type.replace(/_/g, " ")}</p>
                        <p className="truncate text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                      <Badge variant={log.status === "PASS" ? "default" : log.status === "FAIL" ? "destructive" : "outline"}>{log.status}</Badge>
                    </div>
                    {log.failure_reason && <p className="mt-2 text-xs text-slate-500">{log.failure_reason}</p>}
                  </div>
                )) : <EmptyStateRow title="No sync logs yet" detail="Release, analytics, and webhook sync logs will appear after provider activity." />}
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-950">Sandbox mode support</p>
                  <p className="mt-1">Too Lost records pre-approval checks now and auto-activates live behavior once OAuth credentials are approved.</p>
                </div>
              </>
            ) : (
              <>
                {data.campaigns.length ? data.campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-2xl border border-white/80 bg-white/75 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{campaign.name}</p>
                        <p className="truncate text-xs text-slate-500">{campaign.platform} · {campaign.budget.toLocaleString()} INR</p>
                      </div>
                      <Badge variant="outline">{campaign.status}</Badge>
                    </div>
                  </div>
                )) : <EmptyStateRow title="No campaigns yet" detail="Create campaign records to track DSP pushes and paid rollout readiness." />}
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-950">Playlist pitching center</p>
                  <p className="mt-1">{data.playlistPitches.length} pitches are tied to the artist catalog and can be mirrored into Too Lost-powered campaigns.</p>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassCard className="p-5">
          <SectionHeader title={mode === "admin" ? "API Health" : "Analytics Overview"} description={mode === "admin" ? "Health checks, sandbox runs, and provider readiness gates." : "Imported streaming analytics and DSP signals with no live credential dependency."} />
          <div className="space-y-3">
            {data.health.length ? data.health.slice(0, 5).map((check) => (
              <HealthRow key={check.id} name={check.check_name} status={check.status} detail={check.failure_reason || `${check.response_time_ms ?? 0}ms`} />
            )) : <EmptyStateRow title="No health checks recorded" detail="Health checks populate after provider validation and routine heartbeat jobs." />}
            {mode === "admin" && data.sandboxRuns.length > 0 && (
              <div className="rounded-2xl border border-white/80 bg-white/75 p-3">
                <p className="text-sm font-semibold text-slate-950">Sandbox runs</p>
                <p className="mt-1 text-xs text-slate-500">{data.sandboxRuns.length} sandbox test runs recorded without live API calls.</p>
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Provider Status Dashboard" description="A single view of provider, OAuth, sync, API, and webhook state." action={<Button variant="outline" className="rounded-xl bg-white/70" onClick={refreshProviderLink}><ExternalLink className="mr-2 h-4 w-4" />Open OAuth</Button>} />
          <div className="grid grid-cols-1 gap-3">
            {TOO_LOST_ADMIN_CHECKS.map(({ label, icon: Icon }) => {
              const value = readStatusValue(label, data.readiness, activation);
              return (
                <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{label}</p>
                      <p className="truncate text-xs text-slate-500">{value.detail}</p>
                    </div>
                  </div>
                  <Badge variant={value.ok ? "default" : "outline"}>{value.status}</Badge>
                </div>
              );
            })}
          </div>
          {mode === "admin" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleConnect()}>Open OAuth</Button>
              <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleSyncNow()} disabled={!tooLostStatus?.connected}>Sync now</Button>
              <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleDisconnect()} disabled={!tooLostStatus?.connected}>Disconnect</Button>
            </div>
          )}
        </GlassCard>
      </section>

      {mode === "artist" && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOO_LOST_DSP_TARGETS.map((platform) => (
            <GlassCard key={platform} className="p-5">
              <SectionHeader title={platformToLabel(platform)} description="DSP availability tracking and distribution readiness." />
              <div className="space-y-2">
                <MiniRow label="Availability" value="Tracked" />
                <MiniRow label="Delivery state" value={data.deliveryCount > 0 ? "Live" : "Pending"} />
                <MiniRow label="Campaign linkage" value={data.campaigns.length > 0 ? "Connected" : "Not connected"} />
              </div>
            </GlassCard>
          ))}
        </section>
      )}
    </div>
  );

  async function handleConnect() {
    try {
      const result = await buildTooLostAuthorizationUrl("/dashboard");
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start Too Lost OAuth");
    }
  }

  async function handleDisconnect() {
    try {
      setTooLostStatus(await disconnectTooLost("Disconnected from provider workspace"));
      toast.success("Too Lost disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Too Lost");
    }
  }

  async function handleSyncNow() {
    if (!user?.id) {
      toast.error("Missing user context for Too Lost sync");
      return;
    }
    try {
      await syncTooLostNow(user.id);
      await load();
      await loadTooLostStatus();
      toast.success("Too Lost sync started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Too Lost");
    }
  }

  function recordSandboxRun(runType: "oauth" | "release_submission" | "analytics_sync" | "webhook" | "failure_recovery") {
    void client.from("distribution_provider_sandbox_runs").insert({
      provider: TOO_LOST_PROVIDER_KEY,
      run_type: runType,
      status: "PASS",
      request: { mode: "sandbox", provider: TOO_LOST_PROVIDER_KEY, runType },
      response: { message: "Sandbox-only provider workflow recorded without live API credentials." },
      notes: "No live Too Lost API call performed.",
    }).then(({ error }: any) => {
      if (error) return toast.error(error.message);
      toast.success("Sandbox check recorded");
      void load();
    });
  }

  function refreshProviderLink() {
    const authorize = data.readiness?.oauth_authorize_url || TOO_LOST_OAUTH_AUTHORIZE_URL;
    if (!activation.clientConfigured) {
      toast.info("OAuth link is staged until credentials are approved.");
      return;
    }
    window.open(authorize, "_blank", "noopener,noreferrer");
  }
}

function platformToLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function computeReleaseReadiness(status: string) {
  if (["live", "processing", "sent_to_stores"].includes(status)) return 92;
  if (status === "approved") return 78;
  if (status === "under_review") return 55;
  if (status === "uploaded") return 42;
  return 18;
}

function readStatusValue(label: string, readiness: TooLostReadinessRow | null, activation: ReturnType<typeof getTooLostActivationState>) {
  if (label === "Too Lost Provider Configuration") {
    return { ok: Boolean(readiness?.is_enabled), status: readiness?.is_enabled ? "Ready" : "Pending", detail: readiness?.display_name || "Too Lost provider record" };
  }
  if (label === "OAuth Status") {
    return { ok: activation.oauthReady, status: activation.oauthReady ? "Ready" : "Pending", detail: readiness?.credential_status || "pending_approval" };
  }
  if (label === "Sync Status") {
    return { ok: Boolean(readiness?.sync_status && readiness.sync_status !== "not configured"), status: formatTooLostStatus(readiness?.sync_status || "not configured"), detail: activation.active ? "Auto-activates once approved" : "Sandbox staging only" };
  }
  if (label === "API Health") {
    return { ok: Boolean(readiness?.api_base_url), status: readiness?.api_base_url ? "Healthy" : "Pending", detail: readiness?.api_base_url || TOO_LOST_API_BASE_URL };
  }
  return { ok: Boolean(readiness?.webhook_endpoint_path), status: readiness?.webhook_endpoint_path ? "Ready" : "Pending", detail: readiness?.webhook_endpoint_path || TOO_LOST_WEBHOOK_PATH };
}

function normalizeReleaseRows(rows: any[]): TooLostReleaseSignal[] {
  return rows.map((release) => ({
    id: release.id,
    title: release.title,
    status: String(release.status || "draft"),
    created_at: release.created_at,
    primary_artist: release.primary_artist_name || release.primary_artist || "Artist",
    release_date: release.release_date ?? null,
    delivery: String(release.status || "draft"),
    sync: release.status === "live" ? "live" : "queued",
    availability: "5 DSP targets",
    readiness: computeReleaseReadiness(String(release.status || "draft")),
  }));
}

function normalizeCampaignRows(rows: any[]): TooLostCampaignSignal[] {
  return rows.map((campaign) => ({
    id: campaign.id,
    name: campaign.campaign_name || "Campaign",
    status: String(campaign.status || "draft"),
    platform: campaign.platform || "too_lost",
    budget: Number(campaign.budget_inr || 0),
    start_date: campaign.start_date ?? null,
    end_date: campaign.end_date ?? null,
  }));
}

function normalizePitches(rows: any[]) {
  return rows.map((pitch) => ({
    id: pitch.id,
    target_playlist: pitch.target_playlist || "Playlist pitch",
    status: String(pitch.status || "draft"),
    created_at: pitch.created_at,
    platform: pitch.platform || "spotify",
  }));
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/78 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function MetricTile({ label, value, helper, icon: Icon, tone }: { label: string; value: string | number; helper: string; icon: any; tone: "pink" | "teal" | "amber" | "blue" | "green" | "slate"; }) {
  const tones: Record<string, string> = {
    pink: "from-pink-500 to-rose-500",
    teal: "from-teal-500 to-cyan-500",
    amber: "from-amber-500 to-orange-500",
    blue: "from-blue-500 to-indigo-500",
    green: "from-emerald-500 to-lime-500",
    slate: "from-slate-800 to-slate-600",
  };
  return (
    <div className="rounded-2xl border border-white/80 bg-white/75 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function StateRow({ label, value, tone }: { label: string; value: string; tone: "pink" | "teal" | "amber" | "blue" | "green" | "slate"; }) {
  const bg = {
    pink: "bg-pink-50 text-pink-700",
    teal: "bg-teal-50 text-teal-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
  }[tone];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/80 bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-semibold text-slate-950">{label}</span>
      <span className={cn("truncate rounded-full px-3 py-1 text-xs font-medium", bg)}>{value}</span>
    </div>
  );
}

function HealthRow({ name, status, detail }: { name: string; status: string; detail: string; }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <Badge variant={status === "PASS" ? "default" : status === "FAIL" ? "destructive" : "outline"}>{status}</Badge>
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: string; }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/70 bg-white/75 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function EmptyStateRow({ title, detail }: { title: string; detail: string; }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}
