import { memo, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  Disc3,
  DollarSign,
  Film,
  IndianRupee,
  ListMusic,
  Megaphone,
  Music,
  Pencil,
  Plus,
  RadioTower,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UploadReleaseDialog from "@/components/UploadReleaseDialog";
import AdCampaignDialog from "@/components/AdCampaignDialog";
import RoyaltyPayoutDashboard from "@/components/RoyaltyPayoutDashboard";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChartLoading, EmptyState, GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { cn } from "@/lib/utils";
import { buildTooLostAuthorizationUrl, disconnectTooLost, fetchTooLostStatus, syncTooLostNow } from "@/lib/tooLostApi";
import type { TooLostConnectionStatus } from "@/lib/tooLostHub";
import { toast } from "sonner";

type Pitch = any;
type Ad = any;
type RoyaltyRecord = any;
type StreamingStat = any;
type PlatformDelivery = any;
type DistributionJobRow = any;
type ValidationResult = any;
type AppNotification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read_at: string | null;
  created_at: string;
  entity_table?: string | null;
};
type Profile = { artist_name: string | null; avatar_url?: string | null; country?: string | null; genres?: string[] | null };
type MusicRelease = {
  id: string;
  title: string;
  primary_artist_name: string;
  status: string;
  owner_user_id?: string | null;
  cover_url: string | null;
  genre?: string | null;
  type?: string | null;
  release_date?: string | null;
  audio_files?: Array<{ trackId: string; title: string; trackNumber?: number | null }> | null;
  platform_deliveries?: PlatformDelivery[];
  distribution_jobs?: DistributionJobRow[];
  validation_results?: ValidationResult[];
};

const client = supabase as any;
const CHART_COLORS = ["#ec4899", "#14b8a6", "#6366f1", "#f59e0b", "#22c55e"];
const kanbanColumns = [
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "viewed", label: "Viewed" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [releases, setReleases] = useState<MusicRelease[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [royalties, setRoyalties] = useState<RoyaltyRecord[]>([]);
  const [streamingStats, setStreamingStats] = useState<StreamingStat[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [promoAnalytics, setPromoAnalytics] = useState({ total_assets: 0, approved_assets: 0, pending_assets: 0, rejected_assets: 0, dsp_delivered_assets: 0 });
  const [tooLostStatus, setTooLostStatus] = useState<TooLostConnectionStatus | null>(null);
  const [tooLostLoading, setTooLostLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openRelease, setOpenRelease] = useState(false);
  const [openAd, setOpenAd] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);

    const [releaseResult, deliveryResult, jobResult, validationResult, pitchResult, adResult, royaltyResult, streamingResult, profileResult, notificationResult, promoSummaryResult] = await Promise.all([
      client.from("music_releases").select("*").eq("owner_user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("platform_deliveries").select("*").order("created_at", { ascending: false }),
      client.from("distribution_jobs").select("*").order("created_at", { ascending: false }),
      client.from("media_validation_results").select("*").order("created_at", { ascending: false }),
      client.from("playlist_pitch_artist_dashboard").select("*").order("created_at", { ascending: false }),
      supabase.from("ad_campaigns").select("*").order("created_at", { ascending: false }),
      client.from("royalty_records").select("*").order("created_at", { ascending: false }),
      client.from("streaming_stats").select("*").order("stat_date", { ascending: false }),
      client.from("profiles").select("artist_name,avatar_url,country,genres").eq("id", user.id).maybeSingle(),
      client.from("app_notifications").select("*").order("created_at", { ascending: false }).limit(8),
      client.rpc("promo_asset_analytics_summary"),
    ]);

    const deliveriesByRelease = ((deliveryResult.data || []) as PlatformDelivery[]).reduce<Record<string, PlatformDelivery[]>>((acc, delivery) => {
      acc[delivery.release_id] = [...(acc[delivery.release_id] || []), delivery];
      return acc;
    }, {});
    const jobsByRelease = ((jobResult.data || []) as DistributionJobRow[]).reduce<Record<string, DistributionJobRow[]>>((acc, job) => {
      acc[job.release_id] = [...(acc[job.release_id] || []), job];
      return acc;
    }, {});
    const validationByRelease = ((validationResult.data || []) as ValidationResult[]).reduce<Record<string, ValidationResult[]>>((acc, result) => {
      acc[result.release_id] = [...(acc[result.release_id] || []), result];
      return acc;
    }, {});

    setReleases(((releaseResult.data || []) as MusicRelease[]).map((release) => ({
      ...release,
      audio_files: release.audio_files || [],
      platform_deliveries: deliveriesByRelease[release.id] || [],
      distribution_jobs: jobsByRelease[release.id] || [],
      validation_results: validationByRelease[release.id] || [],
    })));
    if (pitchResult.error) {
      const fallback = await supabase.from("playlist_pitches").select("*").order("created_at", { ascending: false });
      setPitches(fallback.data || []);
    } else {
      setPitches(pitchResult.data || []);
    }
    setAds(adResult.data || []);
    setRoyalties(royaltyResult.data || []);
    setStreamingStats(streamingResult.data || []);
    setProfile(profileResult.data as Profile | null);
    setNotifications(notificationResult.data || []);
    setPromoAnalytics((promoSummaryResult.data?.[0] || promoSummaryResult.data || {}) as any);
    setLoading(false);
  };

  useEffect(() => { if (user) void loadAll(); }, [user]);

  useEffect(() => {
    void loadTooLostStatus();
  }, [user?.id]);

  const releaseById = useMemo(() => new Map(releases.map((release) => [release.id, release])), [releases]);
  const releaseByTrackId = useMemo(() => {
    const map = new Map<string, MusicRelease>();
    releases.forEach((release) => release.audio_files?.forEach((track) => map.set(track.trackId, release)));
    return map;
  }, [releases]);

  const releaseOptions = releases.map((release) => ({ id: release.id, title: release.title }));
  const totalRevenue = royalties.reduce((sum, record) => sum + Number(record.total_revenue || 0), 0);
  const totalStreams = streamingStats.reduce((sum, stat) => sum + Number(stat.streams_count || stat.streams || 0), 0);
  const monthlyListeners = streamingStats.reduce((sum, stat) => sum + Number(stat.listeners_count || stat.listeners || stat.unique_listeners || 0), 0);
  const pitchAccepted = pitches.filter((pitch) => pitch.status === "accepted").length;
  const pendingReviews = releases.filter((release) => ["submitted", "processing", "under_review", "validation_pending"].includes(release.status)).length
    + pitches.filter((pitch) => ["submitted", "under_review"].includes(pitch.status)).length
    + Number(promoAnalytics.pending_assets || 0);
  const playlistReach = pitches.reduce((sum, pitch) => sum + Number(pitch.estimated_playlist_reach || 0), 0);
  const followers = Math.max(monthlyListeners * 0.18, releases.length * 125, 0);
  const artistGenres = profile?.genres?.length ? profile.genres : unique(releases.map((release) => release.genre).filter(Boolean) as string[]).slice(0, 3);

  const streamSeries = buildTimeSeries(streamingStats, "streams_count", "streams");
  const revenueSeries = buildRevenueSeries(royalties);
  const releasePerformance = releases.slice(0, 6).map((release) => ({
    name: release.title,
    streams: streamingStats.filter((stat) => stat.release_id === release.id || releaseByTrackId.get(stat.track_id)?.id === release.id).reduce((sum, stat) => sum + Number(stat.streams_count || 0), 0),
    revenue: royalties.filter((record) => record.release_id === release.id).reduce((sum, record) => sum + Number(record.total_revenue || 0), 0),
  }));
  const playlistChart = pitches.slice(0, 6).map((pitch) => ({
    name: pitch.release_title || pitch.target_playlist || "Pitch",
    reach: Number(pitch.estimated_playlist_reach || 0),
    probability: acceptanceProbability(pitch),
  }));
  const contribution = [
    { name: "Releases", value: releases.length },
    { name: "Pitches", value: pitches.length },
    { name: "Promo", value: Number(promoAnalytics.total_assets || 0) },
    { name: "Ads", value: ads.length },
  ].filter((item) => item.value > 0);

  const markNotificationRead = async (id: string) => {
    const { data, error } = await client.rpc("mark_app_notification_read", { p_notification_id: id });
    if (!error) {
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: data?.read_at || new Date().toISOString() } : item));
    }
  };

  async function loadTooLostStatus() {
    setTooLostLoading(true);
    try {
      setTooLostStatus(await fetchTooLostStatus());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Too Lost status");
    } finally {
      setTooLostLoading(false);
    }
  }

  async function handleTooLostConnect() {
    try {
      const result = await buildTooLostAuthorizationUrl("/dashboard");
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start Too Lost OAuth");
    }
  }

  async function handleTooLostDisconnect() {
    try {
      setTooLostStatus(await disconnectTooLost("Disconnected from artist dashboard"));
      toast.success("Too Lost disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Too Lost");
    }
  }

  async function handleTooLostSync() {
    if (!user?.id) {
      toast.error("Missing user context for Too Lost sync");
      return;
    }
    try {
      await syncTooLostNow(user.id);
      await loadAll();
      await loadTooLostStatus();
      toast.success("Too Lost sync started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Too Lost");
    }
  }

  return (
    <DashboardShell
      title="Dashboard"
      eyebrow="TrackSyra Studio"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/playlist-pitching")}>
            <ListMusic className="mr-2 h-4 w-4" /> Pitch
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/promo-assets")}>
            <Film className="mr-2 h-4 w-4" /> Promo
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-marketing")}>
            <Sparkles className="mr-2 h-4 w-4" /> DSP Hub
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => setOpenRelease(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Release
          </Button>
        </>
      )}
    >
      {loading ? (
        <LoadingDashboard />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Total Streams" value={totalStreams.toLocaleString()} delta={12} comparison="vs last month" icon={Activity} accent="pink" />
            <KpiCard label="Monthly Listeners" value={Math.round(monthlyListeners).toLocaleString()} delta={8} comparison="audience growth" icon={Users} accent="teal" />
            <KpiCard label="Active Releases" value={releases.length} delta={releases.length ? 4 : 0} comparison="catalog live" icon={Disc3} accent="blue" />
            <KpiCard label="Revenue" value={`INR ${totalRevenue.toFixed(0)}`} delta={6} comparison="royalty trend" icon={IndianRupee} accent="green" />
            <KpiCard label="Playlist Reach" value={playlistReach.toLocaleString()} delta={pitchAccepted ? 14 : 0} comparison="curator impact" icon={RadioTower} accent="amber" />
            <KpiCard label="Pending Reviews" value={pendingReviews} delta={pendingReviews ? -3 : 0} comparison="needs attention" icon={ShieldCheck} accent="slate" />
          </section>

          <ArtistHero
            artistName={profile?.artist_name || user?.email || "Artist"}
            avatarUrl={profile?.avatar_url}
            genres={artistGenres}
            country={profile?.country || "Global"}
            listeners={monthlyListeners}
            followers={followers}
            streams={totalStreams}
            revenue={totalRevenue}
          />

          <GlassCard className="p-5">
            <SectionHeader
              title="Too Lost Connection"
              description="Connect, refresh, and disconnect the live Too Lost production integration."
              action={
                tooLostStatus?.connected ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleTooLostSync()} disabled={tooLostLoading}>
                      <Activity className="mr-2 h-4 w-4" /> Sync Now
                    </Button>
                    <Button variant="outline" className="rounded-xl bg-white/70" onClick={() => void handleTooLostDisconnect()} disabled={tooLostLoading}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button variant="hero" className="rounded-xl" onClick={() => void handleTooLostConnect()} disabled={tooLostLoading}>
                    <Sparkles className="mr-2 h-4 w-4" /> Connect Too Lost
                  </Button>
                )
              }
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MiniStatus label="Too Lost Connected" value={tooLostStatus?.connected ? "Connected" : "Disconnected"} />
              <MiniStatus label="Account Status" value={tooLostStatus?.accountStatus || "pending_approval"} />
              <MiniStatus label="Distribution Status" value={tooLostStatus?.distributionStatus || "not configured"} />
              <MiniStatus
                label="Connected Account"
                value={tooLostStatus?.connectedAccount?.name || tooLostStatus?.connectedAccount?.email || tooLostStatus?.connectedAccount?.id || "Not linked"}
              />
              <MiniStatus
                label="Last Sync"
                value={tooLostStatus?.lastSyncAt ? new Date(tooLostStatus.lastSyncAt).toLocaleString() : "No sync yet"}
              />
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader
              title="Too Lost DSP Marketing"
              description="Primary provider, release sync, analytics import, and campaign tracking with sandbox-safe activation."
              action={<Button variant="outline" className="rounded-xl bg-white/70" onClick={() => navigate("/dashboard/dsp-marketing")}><Sparkles className="mr-2 h-4 w-4" />Open hub</Button>}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <MiniStatus label="Release sync" value={`${releases.filter((release) => ["approved", "sent_to_stores", "processing", "live"].includes(release.status)).length} ready`} />
              <MiniStatus label="Delivery tracker" value={`${releases.filter((release) => release.distribution_jobs?.some((job) => job.provider === "too_lost")).length} linked`} />
              <MiniStatus label="Analytics import" value={`${streamingStats.length + royalties.length} rows`} />
              <MiniStatus label="Campaign center" value={`${ads.length + pitches.length} active`} />
            </div>
          </GlassCard>

          <RoyaltyPayoutDashboard role="artist" />

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.85fr)]">
            <GlassCard className="p-5">
              <SectionHeader title="Analytics" description="Streaming, revenue, audience, and playlist impact in one workspace." />
              <Tabs defaultValue="streams">
                <TabsList className="h-auto flex-wrap rounded-xl bg-slate-100/80 p-1">
                  <TabsTrigger value="streams">Streams</TabsTrigger>
                  <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  <TabsTrigger value="playlist">Playlist</TabsTrigger>
                  <TabsTrigger value="audience">Audience</TabsTrigger>
                </TabsList>
                <TabsContent value="streams" className="mt-5">
                  <ChartPanel>
                    <AreaChart data={streamSeries}>
                      <defs>
                        <linearGradient id="streamFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#ec4899" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#ec4899" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="streams" stroke="#ec4899" fill="url(#streamFill)" strokeWidth={3} />
                    </AreaChart>
                  </ChartPanel>
                </TabsContent>
                <TabsContent value="revenue" className="mt-5">
                  <ChartPanel>
                    <BarChart data={revenueSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#14b8a6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartPanel>
                </TabsContent>
                <TabsContent value="playlist" className="mt-5">
                  <ChartPanel>
                    <BarChart data={playlistChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" hide />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Bar dataKey="reach" fill="#6366f1" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="probability" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ChartPanel>
                </TabsContent>
                <TabsContent value="audience" className="mt-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                    <ChartPanel>
                      <AreaChart data={streamSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="listeners" stroke="#14b8a6" fill="#ccfbf1" strokeWidth={3} />
                      </AreaChart>
                    </ChartPanel>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie data={contribution.length ? contribution : [{ name: "No data", value: 1 }]} dataKey="value" nameKey="name" innerRadius={58} outerRadius={104}>
                          {(contribution.length ? contribution : [{ name: "No data", value: 1 }]).map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </GlassCard>

            <NotificationCenter notifications={notifications} onRead={markNotificationRead} />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.9fr)]">
            <ReleaseWorkspace
              releases={releases}
              performance={releasePerformance}
              onNew={() => setOpenRelease(true)}
              onAnalytics={() => navigate("/dashboard/playlist-performance")}
              onPitch={() => navigate("/dashboard/playlist-pitching")}
              onPromo={() => navigate("/dashboard/promo-assets")}
            />
            <PlaylistKanban pitches={pitches} onCreate={() => navigate("/dashboard/playlist-pitching")} />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <PromoWorkspace analytics={promoAnalytics} onOpen={() => navigate("/dashboard/promo-assets")} />
            <RevenuePanel royalties={royalties} releaseById={releaseById} />
            <AdminOperations visible={isAdmin} pendingReviews={pendingReviews} releases={releases.length} revenue={totalRevenue} />
          </section>
        </div>
      )}

      <Suspense fallback={null}>
        <UploadReleaseDialog open={openRelease} onOpenChange={setOpenRelease} onSuccess={loadAll} />
        <AdCampaignDialog releases={releaseOptions} open={openAd} onOpenChange={setOpenAd} onSuccess={loadAll} />
      </Suspense>
    </DashboardShell>
  );
};

function LoadingDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}
      </div>
      <GlassCard className="p-5"><ChartLoading /></GlassCard>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SkeletonCard className="min-h-[360px]" />
        <SkeletonCard className="min-h-[360px]" />
      </div>
    </div>
  );
}

const ArtistHero = memo(function ArtistHero(props: {
  artistName: string;
  avatarUrl?: string | null;
  genres: string[];
  country: string;
  listeners: number;
  followers: number;
  streams: number;
  revenue: number;
}) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="relative p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(236,72,153,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(20,184,166,0.16),transparent_24%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-slate-950 shadow-2xl shadow-slate-950/20">
              {props.avatarUrl ? (
                <img src={props.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-white"><Music className="h-10 w-10" /></div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-3xl font-bold tracking-tight text-slate-950">{props.artistName}</h2>
                <Badge className="bg-blue-600 hover:bg-blue-600"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Verified</Badge>
              </div>
              <p className="mt-2 text-sm font-medium text-slate-500">{props.country}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(props.genres.length ? props.genres : ["Independent"]).map((genre) => (
                  <Badge key={genre} variant="outline" className="rounded-full border-white/80 bg-white/70">{genre}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <HeroStat label="Monthly listeners" value={Math.round(props.listeners).toLocaleString()} />
            <HeroStat label="Followers" value={Math.round(props.followers).toLocaleString()} />
            <HeroStat label="Streams" value={props.streams.toLocaleString()} />
            <HeroStat label="Revenue" value={`INR ${props.revenue.toFixed(0)}`} />
          </div>
        </div>
      </div>
    </GlassCard>
  );
});

function HeroStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/70 bg-white/70 p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}

function ChartPanel({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/75 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

const ReleaseWorkspace = memo(function ReleaseWorkspace(props: {
  releases: MusicRelease[];
  performance: Array<{ name: string; streams: number; revenue: number }>;
  onNew: () => void;
  onAnalytics: () => void;
  onPitch: () => void;
  onPromo: () => void;
}) {
  if (!props.releases.length) {
    return <EmptyState title="No releases yet" description="Upload your first release to start distribution, validation, playlist pitching, and revenue tracking." actionLabel="Upload release" onAction={props.onNew} icon={Disc3} />;
  }
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Releases" description="Spotify for Artists-style release cards with delivery status and quick actions." action={<Button variant="outline" className="rounded-xl bg-white/70" onClick={props.onNew}><Plus className="mr-2 h-4 w-4" />Release</Button>} />
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {props.releases.slice(0, 4).map((release) => <PremiumReleaseCard key={release.id} release={release} onAnalytics={props.onAnalytics} onPitch={props.onPitch} onPromo={props.onPromo} />)}
      </div>
      <div className="mt-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">Top performing releases</div>
        <ChartPanel>
          <BarChart data={props.performance}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" hide />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />
            <Bar dataKey="streams" fill="#ec4899" radius={[8, 8, 0, 0]} />
            <Bar dataKey="revenue" fill="#14b8a6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ChartPanel>
      </div>
    </GlassCard>
  );
});

const PremiumReleaseCard = memo(function PremiumReleaseCard({ release, onAnalytics, onPitch, onPromo }: { release: MusicRelease; onAnalytics: () => void; onPitch: () => void; onPromo: () => void }) {
  const tooLostJob = release.distribution_jobs?.find((item) => item.provider === "too_lost" || item.platform === "too_lost") || release.distribution_jobs?.[0];
  const deliveryDone = release.platform_deliveries?.filter((item) => ["DELIVERED", "PUBLISHED", "delivered", "live", "completed"].includes(item.status)).length || 0;
  const totalDelivery = Math.max(release.platform_deliveries?.length || 0, 1);
  const deliveryPercent = Math.round(Number(tooLostJob?.delivery_progress ?? (deliveryDone / totalDelivery) * 100));
  const liveLinks = Object.values(tooLostJob?.live_links || {}).filter(Boolean) as string[];
  const dspStatusCount = Object.keys(tooLostJob?.dsp_status || {}).length;
  return (
    <div className="group rounded-2xl border border-white/80 bg-white/72 p-4 shadow-sm transition hover:bg-white hover:shadow-lg">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          {release.cover_url ? <img src={release.cover_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="grid h-full w-full place-items-center"><Disc3 className="h-9 w-9 text-slate-400" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-slate-950">{release.title}</h3>
            <Badge variant={release.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{release.status?.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{release.primary_artist_name}</p>
          <p className="mt-2 text-xs font-medium text-slate-500">Release date {release.release_date ? new Date(release.release_date).toLocaleDateString() : "TBA"}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <span>Distribution Status: {formatDistributionValue(tooLostJob?.status || release.status)}</span>
            <span>Submission Date: {tooLostJob?.created_at ? new Date(tooLostJob.created_at).toLocaleDateString() : "Pending"}</span>
            <span>DSP Status: {dspStatusCount ? `${dspStatusCount} stores` : "Awaiting sync"}</span>
            <span>Release Health: {formatDistributionValue(tooLostJob?.release_health || "pending")}</span>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <span>Delivery Progress</span><span>{deliveryPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-teal-500" style={{ width: `${deliveryPercent}%` }} />
            </div>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500">Live Links {liveLinks.length ? liveLinks.length : "Pending"}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QuickAction label="Edit" icon={Pencil} onClick={onAnalytics} />
        <QuickAction label="Analytics" icon={BarChart3} onClick={onAnalytics} />
        <QuickAction label="Pitch" icon={ListMusic} onClick={onPitch} />
        <QuickAction label="Promo" icon={Film} onClick={onPromo} />
      </div>
    </div>
  );
});

function QuickAction({ label, icon: Icon, onClick }: { label: string; icon: typeof Pencil; onClick: () => void }) {
  return <Button variant="outline" size="sm" className="rounded-xl bg-white/70" onClick={onClick}><Icon className="mr-1.5 h-3.5 w-3.5" />{label}</Button>;
}

const PlaylistKanban = memo(function PlaylistKanban({ pitches, onCreate }: { pitches: Pitch[]; onCreate: () => void }) {
  if (!pitches.length) return <EmptyState title="No playlist pitches" description="Create a data-backed pitch and track curator movement from draft to acceptance." actionLabel="Create pitch" onAction={onCreate} icon={ListMusic} />;
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Playlist Pitching" description="Kanban-style curator pipeline with probability and response signals." action={<Button variant="outline" className="rounded-xl bg-white/70" onClick={onCreate}>New pitch</Button>} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5 xl:grid-cols-1 2xl:grid-cols-5">
        {kanbanColumns.map((column) => {
          const rows = pitches.filter((pitch) => normalizePitchStatus(pitch.status) === column.key).slice(0, 3);
          return (
            <div key={column.key} className="min-h-[210px] rounded-2xl border border-white/80 bg-slate-50/70 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{column.label}</span>
                <Badge variant="outline" className="bg-white">{rows.length}</Badge>
              </div>
              <div className="space-y-2">
                {rows.map((pitch) => (
                  <div key={pitch.id} className="rounded-xl border bg-white p-3 shadow-sm">
                    <p className="line-clamp-1 text-sm font-semibold">{pitch.release_title || pitch.target_playlist || "Playlist pitch"}</p>
                    <p className="mt-1 text-xs text-slate-500">Score {Number(pitch.priority_score || 0)} - Response {Number(pitch.curator_response_rate || 0)}%</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-amber-400" style={{ width: `${acceptanceProbability(pitch)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">{acceptanceProbability(pitch)}% acceptance probability</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
});

const NotificationCenter = memo(function NotificationCenter({ notifications, onRead }: { notifications: AppNotification[]; onRead: (id: string) => void }) {
  const [filter, setFilter] = useState("unread");
  const visible = notifications.filter((item) => {
    if (filter === "unread") return !item.read_at;
    if (filter === "system") return item.notification_type === "INFO";
    if (filter === "distribution") return item.entity_table?.includes("release") || item.entity_table?.includes("distribution");
    if (filter === "playlist") return item.entity_table?.includes("playlist");
    if (filter === "revenue") return item.entity_table?.includes("royalty") || item.entity_table?.includes("revenue");
    return true;
  });
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Notification Center" description="Unread, system, distribution, playlist, and revenue updates." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["unread", "system", "distribution", "playlist", "revenue", "all"].map((item) => (
          <Button key={item} variant={filter === item ? "default" : "outline"} size="sm" className="rounded-full capitalize" onClick={() => setFilter(item)}>{item}</Button>
        ))}
      </div>
      <div className="space-y-3">
        {visible.length ? visible.map((notification) => (
          <div key={notification.id} className="rounded-2xl border border-white/80 bg-white/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-pink-600" />
                  <p className="text-sm font-bold">{notification.title}</p>
                  {!notification.read_at && <Badge variant="secondary">New</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-500">{notification.message}</p>
              </div>
              {!notification.read_at && <Button size="sm" variant="ghost" onClick={() => onRead(notification.id)}>Read</Button>}
            </div>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No notifications in this filter.</div>
        )}
      </div>
    </GlassCard>
  );
});

function PromoWorkspace({ analytics, onOpen }: { analytics: any; onOpen: () => void }) {
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Promo Assets Studio" description="Canvas, TikTok, Reels, YouTube Shorts, and motion artwork." action={<Button size="sm" variant="outline" className="rounded-xl bg-white/70" onClick={onOpen}>Open</Button>} />
      <div className="grid grid-cols-2 gap-3">
        <MediaTile label="Canvas" value={analytics.approved_assets || 0} status="Ready" />
        <MediaTile label="TikTok" value={analytics.pending_assets || 0} status="Processing" />
        <MediaTile label="Reels" value={analytics.dsp_delivered_assets || 0} status="Delivered" />
        <MediaTile label="Motion Artwork" value={analytics.rejected_assets || 0} status="Review" />
      </div>
    </GlassCard>
  );
}

function MediaTile({ label, value, status }: { label: string; value: number; status: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-3">
      <div className="aspect-video rounded-xl bg-gradient-to-br from-slate-900 via-pink-700 to-teal-500" />
      <p className="mt-3 text-sm font-bold">{label}</p>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500"><span>{status}</span><span>Score {Math.min(100, 82 + value)}</span></div>
    </div>
  );
}

function RevenuePanel({ royalties, releaseById }: { royalties: RoyaltyRecord[]; releaseById: Map<string, MusicRelease> }) {
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Revenue" description="Royalty activity and payout readiness." />
      {royalties.length ? (
        <div className="space-y-3">
          {royalties.slice(0, 5).map((record) => (
            <div key={record.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/70 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{releaseById.get(record.release_id)?.title || "Release"}</p>
                <p className="text-xs text-slate-500">{record.platform} - {Number(record.streams_count || 0).toLocaleString()} streams</p>
              </div>
              <p className="font-bold">INR {Number(record.total_revenue || 0).toFixed(0)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <DollarSign className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold">No revenue yet</p>
          <p className="mt-1 text-xs text-slate-500">Revenue appears after platform reports are processed.</p>
        </div>
      )}
    </GlassCard>
  );
}

function AdminOperations({ visible, pendingReviews, releases, revenue }: { visible: boolean; pendingReviews: number; releases: number; revenue: number }) {
  if (!visible) return (
    <GlassCard className="p-5">
      <SectionHeader title="System" description="Distribution and platform readiness." />
      <div className="space-y-3">
        <StatusWidget label="Platform health" value="Operational" tone="green" />
        <StatusWidget label="Catalog validation" value={`${releases} releases`} tone="blue" />
        <StatusWidget label="Support queue" value="Normal" tone="slate" />
      </div>
    </GlassCard>
  );
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Admin Overview" description="Operations snapshot for review and platform health." />
      <div className="grid grid-cols-2 gap-3">
        <StatusWidget label="Pending reviews" value={pendingReviews} tone="amber" />
        <StatusWidget label="Failed deliveries" value={0} tone="green" />
        <StatusWidget label="Revenue today" value={`INR ${revenue.toFixed(0)}`} tone="blue" />
        <StatusWidget label="New artists" value={0} tone="slate" />
      </div>
    </GlassCard>
  );
}

function StatusWidget({ label, value, tone }: { label: string; value: string | number; tone: "green" | "blue" | "amber" | "slate" }) {
  const tones = { green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-700" };
  return <div className={cn("rounded-2xl p-3", tones[tone])}><p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>;
}

function buildTimeSeries(rows: StreamingStat[], streamKey: string, fallbackKey: string) {
  const map = rows.reduce<Record<string, { date: string; streams: number; listeners: number }>>((acc, row) => {
    const date = String(row.stat_date || row.created_at || new Date().toISOString()).slice(0, 10);
    acc[date] ||= { date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), streams: 0, listeners: 0 };
    acc[date].streams += Number(row[streamKey] || row[fallbackKey] || 0);
    acc[date].listeners += Number(row.listeners_count || row.listeners || row.unique_listeners || 0);
    return acc;
  }, {});
  const data = Object.values(map).slice(-12);
  return data.length ? data : Array.from({ length: 8 }).map((_, index) => ({ date: `W${index + 1}`, streams: 0, listeners: 0 }));
}

function buildRevenueSeries(rows: RoyaltyRecord[]) {
  const map = rows.reduce<Record<string, { date: string; revenue: number }>>((acc, row) => {
    const date = String(row.royalty_period || row.created_at || new Date().toISOString()).slice(0, 10);
    acc[date] ||= { date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), revenue: 0 };
    acc[date].revenue += Number(row.total_revenue || 0);
    return acc;
  }, {});
  const data = Object.values(map).slice(-12);
  return data.length ? data : Array.from({ length: 8 }).map((_, index) => ({ date: `W${index + 1}`, revenue: 0 }));
}

function normalizePitchStatus(status: string) {
  if (["submitted", "under_review", "sent_to_curators", "approved"].includes(status)) return "submitted";
  if (["responded"].includes(status)) return "viewed";
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  return "draft";
}

function acceptanceProbability(pitch: Pitch) {
  const score = Number(pitch.priority_score || 0);
  const response = Number(pitch.curator_response_rate || 0);
  const accepted = Number(pitch.accepted_count || 0);
  return Math.max(8, Math.min(96, Math.round(score * 0.45 + response * 0.35 + accepted * 8)));
}

function unique(values: string[]) {
  return Array.from(new Set(values)).filter(Boolean);
}

function formatDistributionValue(value: string) {
  return String(value || "pending").replace(/_/g, " ").toLowerCase();
}

export default Dashboard;
