import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, Bot, CalendarDays, CheckCircle2, Clock3, Flame, Layers3, RefreshCw, ShieldCheck, Sparkles, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { useNavigate } from "react-router-dom";
import { loadDspAnalyticsWorkspace } from "./dspAnalyticsData";
import { loadAiDspAssistantWorkspace } from "./dspAiAssistantData";

type ReleaseRow = {
  id: string;
  title: string;
  primary_artist: string;
  release_type: string | null;
  release_date: string | null;
  genre: string | null;
  language: string | null;
  status: string;
  cover_art_url: string | null;
};

type DspReleaseReadinessRow = {
  id: string;
  release_id: string;
  overall_score: number;
  metadata_score: number;
  artwork_score: number;
  rights_score: number;
  content_score: number;
  status: string;
  summary: string | null;
  platform_coverage: string[] | null;
  last_scored_at: string | null;
  created_at: string;
  updated_at: string;
};

type DspMarketingTaskRow = {
  id: string;
  release_id: string;
  title: string;
  description: string | null;
  channel: string;
  due_date: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PreSaveHubStats = {
  activeCampaigns: number;
  totalClicks: number;
  totalSaves: number;
  conversionRate: number;
};

type CampaignCenterHubStats = {
  activeCampaigns: number;
  totalCampaigns: number;
  totalReach: number;
  totalEngagement: number;
};

type DspAnalyticsHubStats = {
  streams: number;
  saves: number;
  playlistAdds: number;
  followers: number;
  reach: number;
  engagement: number;
};

type AiAssistantHubStats = {
  totalRecommendations: number;
  highConfidenceRecommendations: number;
  topConfidenceScore: number;
  sourcesUsed: number;
};

const client = supabase as any;

export default function DspMarketingHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [readinessRows, setReadinessRows] = useState<DspReleaseReadinessRow[]>([]);
  const [tasks, setTasks] = useState<DspMarketingTaskRow[]>([]);
  const [preSaveStats, setPreSaveStats] = useState<PreSaveHubStats>({
    activeCampaigns: 0,
    totalClicks: 0,
    totalSaves: 0,
    conversionRate: 0,
  });
  const [campaignCenterStats, setCampaignCenterStats] = useState<CampaignCenterHubStats>({
    activeCampaigns: 0,
    totalCampaigns: 0,
    totalReach: 0,
    totalEngagement: 0,
  });
  const [analyticsStats, setAnalyticsStats] = useState<DspAnalyticsHubStats>({
    streams: 0,
    saves: 0,
    playlistAdds: 0,
    followers: 0,
    reach: 0,
    engagement: 0,
  });
  const [assistantStats, setAssistantStats] = useState<AiAssistantHubStats>({
    totalRecommendations: 0,
    highConfidenceRecommendations: 0,
    topConfidenceScore: 0,
    sourcesUsed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>("");

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [releaseResult, readinessResult, taskResult] = await Promise.all([
      client.from("releases").select("id,title,primary_artist,release_type,release_date,genre,language,status,cover_art_url").order("updated_at", { ascending: false }).limit(8),
      client.from("dsp_release_readiness").select("*").order("overall_score", { ascending: false }).order("updated_at", { ascending: false }),
      client.from("dsp_marketing_tasks").select("*").order("due_date", { ascending: true }).order("priority", { ascending: false }),
    ]);

    if (releaseResult.error) toast.error(releaseResult.error.message);
    if (readinessResult.error) toast.error(readinessResult.error.message);
    if (taskResult.error) toast.error(taskResult.error.message);

    const releaseRows = (releaseResult.data || []) as ReleaseRow[];
    const readiness = (readinessResult.data || []) as DspReleaseReadinessRow[];
    const marketingTasks = (taskResult.data || []) as DspMarketingTaskRow[];
    const analyticsWorkspace = await loadDspAnalyticsWorkspace(user.id);
    const assistantWorkspace = await loadAiDspAssistantWorkspace(user.id, analyticsWorkspace);

    setReleases(releaseRows);
    setReadinessRows(readiness);
    setTasks(marketingTasks);
    setPreSaveStats({
      activeCampaigns: analyticsWorkspace.preSaveWorkspace.campaigns.filter((campaign) => campaign.status === "active").length,
      totalClicks: analyticsWorkspace.preSaveWorkspace.stats.totalClicks,
      totalSaves: analyticsWorkspace.preSaveWorkspace.stats.totalSaves,
      conversionRate: analyticsWorkspace.preSaveWorkspace.stats.conversionRate,
    });
    setCampaignCenterStats({
      activeCampaigns: analyticsWorkspace.campaignWorkspace.stats.activeCampaigns,
      totalCampaigns: analyticsWorkspace.campaignWorkspace.stats.totalCampaigns,
      totalReach: analyticsWorkspace.campaignWorkspace.stats.totalReach,
      totalEngagement: analyticsWorkspace.campaignWorkspace.stats.totalEngagement,
    });
    setAnalyticsStats({
      streams: analyticsWorkspace.stats.streams,
      saves: analyticsWorkspace.stats.saves,
      playlistAdds: analyticsWorkspace.stats.playlistAdds,
      followers: analyticsWorkspace.stats.followers,
      reach: analyticsWorkspace.stats.reach,
      engagement: analyticsWorkspace.stats.engagement,
    });
    setAssistantStats({
      totalRecommendations: assistantWorkspace.stats.totalRecommendations,
      highConfidenceRecommendations: assistantWorkspace.stats.highConfidenceRecommendations,
      topConfidenceScore: assistantWorkspace.stats.topConfidenceScore,
      sourcesUsed: assistantWorkspace.stats.sourcesUsed,
    });
    setSelectedReleaseId((current) => current || readiness[0]?.release_id || releaseRows[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const releaseMap = useMemo(() => new Map(releases.map((release) => [release.id, release])), [releases]);
  const selectedRelease = useMemo(
    () => readinessRows.find((row) => row.release_id === selectedReleaseId) || readinessRows[0] || null,
    [readinessRows, selectedReleaseId]
  );
  const selectedCatalogRelease = selectedRelease ? releaseMap.get(selectedRelease.release_id) || null : null;

  const analytics = useMemo(() => {
    const releaseCount = releases.length;
    const readyCount = readinessRows.filter((row) => row.status === "ready").length;
    const blockedCount = readinessRows.filter((row) => row.status === "blocked").length;
    const averageScore = readinessRows.length
      ? Math.round(readinessRows.reduce((sum, row) => sum + Number(row.overall_score || 0), 0) / readinessRows.length)
      : selectedRelease
        ? Math.round(Number(selectedRelease.overall_score || 0))
        : 0;
    const dueSoon = tasks.filter((task) => {
      if (task.status === "done") return false;
      const days = Math.ceil((new Date(task.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days <= 7;
    }).length;
    const completedRate = tasks.length
      ? Math.round((tasks.filter((task) => task.status === "done").length / tasks.length) * 100)
      : 0;
    return { releaseCount, readyCount, blockedCount, averageScore, dueSoon, completedRate };
  }, [readinessRows, selectedRelease, tasks, releases.length]);

  const calendarGroups = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    return sorted.reduce<Array<{ date: string; items: DspMarketingTaskRow[] }>>((acc, task) => {
      const date = new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const last = acc[acc.length - 1];
      if (last && last.date === date) {
        last.items.push(task);
      } else {
        acc.push({ date, items: [task] });
      }
      return acc;
    }, []);
  }, [tasks]);

  const readinessScore = selectedRelease ? Number(selectedRelease.overall_score || 0) : 0;
  const readinessStatus = selectedRelease?.status || "draft";
  const readinessBadgeTone = readinessStatus === "ready"
    ? "bg-emerald-50 text-emerald-700"
    : readinessStatus === "blocked"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";

  return (
    <DashboardShell
      title="DSP Marketing Dashboard"
      eyebrow="Phase 8.1 DSP Marketing Foundation"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/playlist-pitching")}>
            <Sparkles className="mr-2 h-4 w-4" /> Playlist Pitching
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <ReleaseReadinessCard
            loading={loading}
            selectedRelease={selectedRelease}
            catalogRelease={selectedCatalogRelease}
            readinessScore={readinessScore}
            readinessBadgeTone={readinessBadgeTone}
            readinessStatus={readinessStatus}
            onSelectRelease={setSelectedReleaseId}
            releaseRows={readinessRows}
            catalogRows={releases}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            {loading ? (
              <>
                <SkeletonCard className="h-full min-h-[150px]" />
                <SkeletonCard className="h-full min-h-[150px]" />
              </>
            ) : (
              <>
                <GlassCard className="p-5">
                  <SectionHeader title="DSP Analytics Overview" description="Foundation metrics for release readiness and marketing execution." />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <KpiCard icon={Target} label="Ready Releases" value={analytics.readyCount} delta={analytics.readyCount || analytics.releaseCount ? 8 : 0} comparison={`${analytics.releaseCount} tracked releases`} accent="green" />
                    <KpiCard icon={TrendingUp} label="Average Score" value={`${analytics.averageScore}%`} delta={analytics.averageScore ? 6 : 0} comparison="readiness across catalog" accent="blue" />
                    <KpiCard icon={Clock3} label="Tasks Due Soon" value={analytics.dueSoon} delta={analytics.dueSoon ? -12 : 0} comparison="next 7 days" accent="amber" />
                    <KpiCard icon={CheckCircle2} label="Task Completion" value={`${analytics.completedRate}%`} delta={analytics.completedRate ? 4 : 0} comparison="marketing execution" accent="teal" />
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <SectionHeader title="Marketing System Snapshot" description="DSP foundation plus deterministic assistant. No campaign manager or advanced analytics surfaces." />
                  <div className="space-y-3">
                    <MiniStat label="Tracked releases" value={analytics.releaseCount} />
                    <MiniStat label="Ready score ceiling" value={readinessScore} suffix="%" />
                    <MiniStat label="Blocked releases" value={analytics.blockedCount} />
                    <MiniStat label="Active tasks" value={tasks.length} />
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <SectionHeader
                    title="Pre-Save Campaigns"
                    description="Open the pre-save builder to manage campaign status, smart links, clicks, and saves."
                    action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save")}>Open</Button>}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <MiniStat label="Active Campaigns" value={preSaveStats.activeCampaigns} />
                    <MiniStat label="Total Clicks" value={preSaveStats.totalClicks} />
                    <MiniStat label="Total Saves" value={preSaveStats.totalSaves} />
                    <MiniStat label="Conversion Rate" value={preSaveStats.conversionRate} suffix="%" />
                  </div>
                  <Button variant="hero" className="mt-4 w-full rounded-xl" onClick={() => navigate("/dashboard/pre-save")}>
                    <Sparkles className="mr-2 h-4 w-4" /> View Pre-Save Campaigns
                  </Button>
                </GlassCard>

                <GlassCard className="p-5">
                  <SectionHeader
                    title="Campaign Center"
                    description="Open the campaign center dashboard for campaign creation, editing, and metrics."
                    action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center")}>Open</Button>}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <MiniStat label="Active Campaigns" value={campaignCenterStats.activeCampaigns} />
                    <MiniStat label="Total Campaigns" value={campaignCenterStats.totalCampaigns} />
                    <MiniStat label="Total Reach" value={campaignCenterStats.totalReach} />
                    <MiniStat label="Total Engagement" value={campaignCenterStats.totalEngagement} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="hero" className="flex-1 rounded-xl" onClick={() => navigate("/dashboard/campaign-center")}>
                      <Layers3 className="mr-2 h-4 w-4" /> Open Campaign Center
                    </Button>
                    <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center/campaigns")}>
                      <BarChart3 className="mr-2 h-4 w-4" /> List
                    </Button>
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <SectionHeader
                    title="DSP Analytics"
                    description="Open streams, audience, and playlist performance analytics."
                    action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics")}>Open</Button>}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <MiniStat label="Streams" value={analyticsStats.streams} />
                    <MiniStat label="Saves" value={analyticsStats.saves} />
                    <MiniStat label="Playlist Adds" value={analyticsStats.playlistAdds} />
                    <MiniStat label="Reach" value={analyticsStats.reach} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="hero" className="flex-1 rounded-xl" onClick={() => navigate("/dashboard/dsp-analytics")}>
                      <BarChart3 className="mr-2 h-4 w-4" /> Open DSP Analytics
                    </Button>
                    <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics/streams")}>
                      Streams
                    </Button>
                  </div>
                </GlassCard>

                <GlassCard className="p-5">
                  <SectionHeader
                    title="AI DSP Assistant"
                    description="Deterministic recommendation engine using existing analytics and marketing signals."
                    action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-ai-assistant")}>Open</Button>}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <MiniStat label="Recommendations" value={assistantStats.totalRecommendations} />
                    <MiniStat label="High Confidence" value={assistantStats.highConfidenceRecommendations} />
                    <MiniStat label="Top Confidence" value={assistantStats.topConfidenceScore} suffix="%" />
                    <MiniStat label="Sources Used" value={assistantStats.sourcesUsed} />
                  </div>
                  <Button variant="hero" className="mt-4 w-full rounded-xl" onClick={() => navigate("/dashboard/dsp-ai-assistant/recommendations")}>
                    <Bot className="mr-2 h-4 w-4" /> View Recommendations
                  </Button>
                </GlassCard>
              </>
            )}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Marketing Calendar" description="Release-specific rollout checklist and due dates." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : calendarGroups.length === 0 ? (
              <EmptyCalendar />
            ) : (
              <div className="space-y-5">
                {calendarGroups.map((group) => (
                  <div key={group.date} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-950/20">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-950">{group.date}</p>
                        <p className="text-xs text-slate-500">{group.items.length} marketing task{group.items.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="space-y-3 pl-11">
                      {group.items.map((task) => (
                        <TaskRow key={task.id} task={task} releaseTitle={releaseMap.get(task.release_id)?.title || "Release"} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Marketing Calendar Details" description="The selected release and its readiness breakdown." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : selectedRelease ? (
              <div className="space-y-5">
                <div className="grid gap-5 md:grid-cols-[160px_1fr]">
                  <ScoreRing score={readinessScore} tone={readinessStatus} />
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={readinessBadgeTone}>{formatStatus(readinessStatus)}</Badge>
                      <Badge variant="outline" className="capitalize">{selectedCatalogRelease?.release_type || "Release"}</Badge>
                      <Badge variant="outline">{selectedCatalogRelease?.genre || "Genre"}</Badge>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-slate-950">{selectedCatalogRelease?.title || "Release readiness"}</h3>
                      <p className="mt-1 text-sm text-slate-500">{selectedRelease.summary || "DSP launch readiness signals for the selected release."}</p>
                    </div>
                    <div className="space-y-2">
                      <ScoreBar label="Metadata" value={selectedRelease.metadata_score} />
                      <ScoreBar label="Artwork" value={selectedRelease.artwork_score} />
                      <ScoreBar label="Rights" value={selectedRelease.rights_score} />
                      <ScoreBar label="Content" value={selectedRelease.content_score} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/70 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">DSP Coverage</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(selectedRelease.platform_coverage || []).length ? (
                      selectedRelease.platform_coverage?.map((platform) => (
                        <Badge key={platform} variant="secondary" className="rounded-full px-3 py-1 capitalize">{platform.replace(/_/g, " ")}</Badge>
                      ))
                    ) : (
                      <Badge variant="secondary" className="rounded-full px-3 py-1">Coverage not configured</Badge>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <MiniStat label="Last scored" value={selectedRelease.last_scored_at ? new Date(selectedRelease.last_scored_at).toLocaleString() : "Not scored"} />
                  <MiniStat label="Updated" value={new Date(selectedRelease.updated_at).toLocaleString()} />
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Flame className="h-4 w-4 text-pink-600" />
                    Readiness Notes
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRelease.summary || "This release is queued for DSP foundation tracking."}</p>
                </div>
              </div>
            ) : (
              <EmptyCalendar />
            )}
          </GlassCard>
        </section>
      </div>
    </DashboardShell>
  );
}

function ReleaseReadinessCard(props: {
  loading: boolean;
  selectedRelease: DspReleaseReadinessRow | null;
  catalogRelease: ReleaseRow | null;
  readinessScore: number;
  readinessBadgeTone: string;
  readinessStatus: string;
  onSelectRelease: (id: string) => void;
  releaseRows: DspReleaseReadinessRow[];
  catalogRows: ReleaseRow[];
}) {
  return (
    <GlassCard className="p-5">
      <SectionHeader title="Release Readiness Score" description="Foundation signal for DSP launch prep and release packaging." action={<Badge className={props.readinessBadgeTone}>{formatStatus(props.readinessStatus)}</Badge>} />

      {props.loading ? (
        <SkeletonCard className="min-h-[360px]" />
      ) : props.selectedRelease ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[168px_1fr]">
            <ScoreRing score={props.readinessScore} tone={props.readinessStatus} />
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {props.releaseRows.slice(0, 6).map((row) => {
                  const catalog = props.catalogRows.find((item) => item.id === row.release_id);
                  const active = row.id === props.selectedRelease?.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => props.onSelectRelease(row.release_id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "border-white/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-950"}`}
                    >
                      {catalog?.title || "Release"} {Math.round(Number(row.overall_score || 0))}%
                    </button>
                  );
                })}
                {!props.releaseRows.length && props.catalogRows.slice(0, 4).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => props.onSelectRelease(row.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${props.catalogRelease?.id === row.id ? "border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15" : "border-white/80 bg-white/80 text-slate-600 hover:border-slate-300 hover:text-slate-950"}`}
                  >
                    {row.title}
                  </button>
                ))}
              </div>

              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-950">{props.catalogRelease?.title || "No release selected"}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {props.catalogRelease?.primary_artist || "Artist"} {props.catalogRelease?.genre ? `- ${props.catalogRelease.genre}` : ""}{props.catalogRelease?.language ? ` - ${props.catalogRelease.language}` : ""}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ScoreChip label="Metadata" value={props.selectedRelease.metadata_score} icon={CheckCircle2} />
                <ScoreChip label="Artwork" value={props.selectedRelease.artwork_score} icon={Sparkles} />
                <ScoreChip label="Rights" value={props.selectedRelease.rights_score} icon={ShieldCheck} />
                <ScoreChip label="Content" value={props.selectedRelease.content_score} icon={Target} />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/70 bg-white/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Packaging Progress</p>
                <p className="text-sm text-slate-500">DSP launch readiness across metadata, artwork, rights, and content.</p>
              </div>
              <p className="text-sm font-bold text-slate-950">{Math.round(props.readinessScore)}%</p>
            </div>
            <Progress value={props.readinessScore} className="h-3" />
          </div>
        </div>
      ) : (
        <EmptyCalendar />
      )}
    </GlassCard>
  );
}

function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const hue = tone === "ready" ? "from-emerald-500 to-cyan-500" : tone === "blocked" ? "from-red-500 to-orange-500" : "from-amber-500 to-fuchsia-500";
  return (
    <div className="relative mx-auto grid h-40 w-40 place-items-center">
      <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${hue} opacity-95 shadow-2xl shadow-slate-950/15`} />
      <div className="absolute inset-[10px] rounded-full border border-white/60 bg-white/92 shadow-inner" />
      <div className="relative text-center">
        <p className="text-4xl font-black tracking-tight text-slate-950">{Math.round(score)}%</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Readiness</p>
      </div>
    </div>
  );
}

function ScoreChip({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{Math.round(Number(value || 0))}%</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const score = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        <span>{label}</span>
        <span>{Math.round(score)}%</span>
      </div>
      <Progress value={score} className="h-2.5" />
    </div>
  );
}

function MiniStat({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">
        {value}
        {suffix || ""}
      </p>
    </div>
  );
}

function TaskRow({ task, releaseTitle }: { task: DspMarketingTaskRow; releaseTitle: string }) {
  const due = new Date(task.due_date);
  const overdue = due.getTime() < Date.now() && task.status !== "done";
  return (
    <div className="rounded-2xl border border-white/80 bg-white/82 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-950">{task.title}</h3>
            <Badge variant={task.status === "done" ? "default" : "secondary"} className="capitalize">{task.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">{releaseTitle} - {task.channel.replace(/_/g, " ")}</p>
          {task.description && <p className="mt-2 text-sm leading-6 text-slate-600">{task.description}</p>}
        </div>
        <div className="text-right">
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${overdue ? "text-red-600" : "text-slate-500"}`}>{due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
          <p className="mt-1 text-xs text-slate-500">{task.priority || "normal"} priority</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {task.assignee ? <Badge variant="outline">Owner: {task.assignee}</Badge> : <Badge variant="outline">Unassigned</Badge>}
        {overdue ? <Badge className="bg-red-50 text-red-700 hover:bg-red-50"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Overdue</Badge> : <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50"><Clock3 className="mr-1 h-3.5 w-3.5" />On track</Badge>}
      </div>
    </div>
  );
}

function EmptyCalendar() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <CalendarDays className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">No DSP foundation data yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        Create `dsp_release_readiness` and `dsp_marketing_tasks` rows to populate the readiness score, marketing calendar, and DSP analytics cards.
      </p>
    </div>
  );
}

function formatStatus(value: string) {
  return value ? value.replace(/_/g, " ") : "draft";
}
