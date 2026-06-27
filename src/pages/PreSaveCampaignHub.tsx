import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Copy, Link2, MousePointerClick, RefreshCw, Rocket, Save, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { buildCampaignMetrics, getPreSaveLink, loadPreSaveWorkspace, type PreSaveCampaignRow, type PreSaveEventRow, type PreSaveReleaseRow } from "./preSaveCampaignData";

export default function PreSaveCampaignHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState<PreSaveReleaseRow[]>([]);
  const [campaigns, setCampaigns] = useState<PreSaveCampaignRow[]>([]);
  const [events, setEvents] = useState<PreSaveEventRow[]>([]);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadPreSaveWorkspace(user.id);
    setReleases(workspace.releases);
    setCampaigns(workspace.campaigns);
    setEvents(workspace.events);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const metrics = useMemo(() => buildCampaignMetrics(campaigns, events), [campaigns, events]);
  const recentCampaigns = metrics.slice(0, 4);
  const topRelease = useMemo(() => {
    const counts = new Map<string, number>();
    campaigns.forEach((campaign) => counts.set(campaign.release_id, (counts.get(campaign.release_id) || 0) + 1));
    const [releaseId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return releases.find((release) => release.id === releaseId) || releases[0] || null;
  }, [campaigns, releases]);

  return (
    <DashboardShell
      title="Pre-Save Builder"
      eyebrow="Phase 8.2 Pre-Save Builder"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard")}>
            Dashboard
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/pre-save/new")}>
            <Sparkles className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Campaigns" value={metrics.length} delta={metrics.length ? 9 : 0} comparison="tracked pre-save campaigns" icon={Link2} accent="pink" />
          <KpiCard label="Total Clicks" value={events.filter((event) => event.event_type === "click").length} delta={events.length ? 11 : 0} comparison="smart link visits" icon={MousePointerClick} accent="blue" />
          <KpiCard label="Total Saves" value={events.filter((event) => event.event_type === "save").length} delta={events.length ? 14 : 0} comparison="pre-save actions" icon={Save} accent="green" />
          <KpiCard label="Conversion Rate" value={`${metrics.length ? Math.round((events.filter((event) => event.event_type === "save").length / Math.max(events.filter((event) => event.event_type === "click").length, 1)) * 100) : 0}%`} delta={events.length ? 6 : 0} comparison="saves vs clicks" icon={TrendingUp} accent="teal" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <GlassCard className="p-5">
            <SectionHeader
              title="Pre-Save Campaign Overview"
              description="Create and monitor smart-link campaigns, status, and event performance."
              action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save/campaigns")}><ArrowRight className="mr-2 h-4 w-4" />View all</Button>}
            />
            {loading ? (
              <SkeletonCard className="min-h-[280px]" />
            ) : recentCampaigns.length === 0 ? (
              <EmptyCampaignState onCreate={() => navigate("/dashboard/pre-save/new")} />
            ) : (
              <div className="space-y-3">
                {recentCampaigns.map(({ campaign, clicks, saves, conversionRate }) => (
                  <div key={campaign.id} className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-950">{campaign.campaign_name}</h3>
                          <Badge className={badgeTone(campaign.status)}>{campaign.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{campaign.destination_url || getPreSaveLink(campaign.smart_link_slug)}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{campaign.launch_date || "Launch date pending"}</span>
                          <span>{campaign.notes || "No notes"}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <MiniMetric label="Clicks" value={clicks} />
                        <MiniMetric label="Saves" value={saves} />
                        <MiniMetric label="Conv." value={`${conversionRate}%`} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" className="rounded-full" onClick={async () => {
                        await navigator.clipboard.writeText(getPreSaveLink(campaign.smart_link_slug));
                        toast.success("Smart link copied.");
                      }}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Copy link
                      </Button>
                      <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate(`/pre-save/${campaign.smart_link_slug}`)}>
                        Open smart link
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <SectionHeader title="Release Queue" description="Connect a release to a new pre-save campaign." />
              {loading ? (
                <SkeletonCard className="min-h-[180px]" />
              ) : topRelease ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
                        <CalendarDays className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{topRelease.title}</p>
                        <p className="text-sm text-slate-500">{topRelease.primary_artist} {topRelease.genre ? `- ${topRelease.genre}` : ""}</p>
                      </div>
                    </div>
                  </div>
                  <Button variant="hero" className="w-full rounded-xl" onClick={() => navigate("/dashboard/pre-save/new")}>
                    <Rocket className="mr-2 h-4 w-4" /> Build a campaign
                  </Button>
                </div>
              ) : (
                <EmptyCampaignState compact onCreate={() => navigate("/dashboard/pre-save/new")} />
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <SectionHeader title="Status Snapshot" description="Quick view of campaign pipeline health." />
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <StatusPill label="Active" value={metrics.filter((item) => item.campaign.status === "active").length} tone="bg-emerald-50 text-emerald-700" />
                <StatusPill label="Scheduled" value={metrics.filter((item) => item.campaign.status === "scheduled").length} tone="bg-amber-50 text-amber-700" />
                <StatusPill label="Draft" value={metrics.filter((item) => item.campaign.status === "draft").length} tone="bg-slate-100 text-slate-700" />
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function EmptyCampaignState({ onCreate, compact = false }: { onCreate: () => void; compact?: boolean }) {
  return (
    <div className={`rounded-3xl border border-dashed border-slate-200 bg-white/60 ${compact ? "p-5" : "p-8"} text-center`}>
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <Link2 className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">No pre-save campaigns yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a campaign to generate a smart link, capture clicks, and track saves.</p>
      <Button variant="hero" className="mt-5 rounded-xl" onClick={onCreate}>
        <Sparkles className="mr-2 h-4 w-4" /> Create campaign
      </Button>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function badgeTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "scheduled") return "bg-amber-50 text-amber-700";
  if (status === "paused") return "bg-slate-100 text-slate-700";
  if (status === "completed") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}
