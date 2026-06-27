import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarClock, Layers3, RefreshCw, Rocket, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { buildCampaignCenterMetrics, loadCampaignCenterWorkspace, type CampaignRow, type CampaignMetricRow } from "./campaignCenterData";

export default function CampaignCenterHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetricRow[]>([]);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadCampaignCenterWorkspace(user.id);
    setCampaigns(workspace.campaigns);
    setMetrics(workspace.metrics);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const campaignMetrics = useMemo(() => buildCampaignCenterMetrics(campaigns, metrics), [campaigns, metrics]);
  const recentCampaigns = campaignMetrics.slice(0, 4);
  const stats = useMemo(() => ({
    totalCampaigns: campaignMetrics.length,
    activeCampaigns: campaignMetrics.filter(({ campaign }) => campaign.status === "active").length,
    totalReach: metrics.reduce((sum, item) => sum + Number(item.total_reach || 0), 0),
    totalEngagement: metrics.reduce((sum, item) => sum + Number(item.total_engagement || 0), 0),
  }), [campaignMetrics, metrics]);

  return (
    <DashboardShell
      title="Campaign Center"
      eyebrow="Phase 8.3 Campaign Center"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-marketing")}>
            DSP Marketing
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/campaign-center/new")}>
            <Rocket className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Active Campaigns" value={stats.activeCampaigns} delta={stats.activeCampaigns ? 8 : 0} comparison="currently running" icon={Layers3} accent="green" />
          <KpiCard label="Total Campaigns" value={stats.totalCampaigns} delta={stats.totalCampaigns ? 10 : 0} comparison="all campaign records" icon={BarChart3} accent="blue" />
          <KpiCard label="Total Reach" value={formatCount(stats.totalReach)} delta={stats.totalReach ? 12 : 0} comparison="aggregated delivery reach" icon={TrendingUp} accent="pink" />
          <KpiCard label="Total Engagement" value={formatCount(stats.totalEngagement)} delta={stats.totalEngagement ? 14 : 0} comparison="aggregated engagement" icon={CalendarClock} accent="teal" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <GlassCard className="p-5">
            <SectionHeader
              title="Campaign Center Dashboard"
              description="Create, manage, and review multi-platform campaigns from one dashboard."
              action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center/campaigns")}><ArrowRight className="mr-2 h-4 w-4" />View list</Button>}
            />
            {loading ? (
              <SkeletonCard className="min-h-[260px]" />
            ) : recentCampaigns.length === 0 ? (
              <EmptyCampaignState onCreate={() => navigate("/dashboard/campaign-center/new")} />
            ) : (
              <div className="space-y-3">
                {recentCampaigns.map(({ campaign, totalReach, totalEngagement, engagementRate }) => (
                  <div key={campaign.id} className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-950">{campaign.campaign_name}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(campaign.status)}`}>{campaign.status}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{typeLabel(campaign.campaign_type)} {campaign.notes ? `- ${campaign.notes}` : ""}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <MiniMetric label="Reach" value={formatCount(totalReach)} />
                        <MiniMetric label="Engagement" value={formatCount(totalEngagement)} />
                        <MiniMetric label="Rate" value={`${engagementRate}%`} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="rounded-full bg-white/75" onClick={() => navigate(`/dashboard/campaign-center/${campaign.id}`)}>
                        Open campaign
                      </Button>
                      <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/dashboard/campaign-center/new")}>
                        Duplicate campaign
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <SectionHeader title="Campaign Center Actions" description="Shortcut access to creation, editing, and performance review." />
              <div className="space-y-3">
                <Button variant="hero" className="w-full rounded-xl" onClick={() => navigate("/dashboard/campaign-center/new")}>
                  <Rocket className="mr-2 h-4 w-4" /> Create Campaign
                </Button>
                <Button variant="outline" className="w-full rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center/campaigns")}>
                  <BarChart3 className="mr-2 h-4 w-4" /> Campaign List
                </Button>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <SectionHeader title="Channel Mix" description="Supported campaign types in the center." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MiniStat label="Spotify Campaign" value="Supported" />
                <MiniStat label="YouTube Campaign" value="Supported" />
                <MiniStat label="TikTok Campaign" value="Supported" />
                <MiniStat label="Instagram Campaign" value="Supported" />
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function EmptyCampaignState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <BarChart3 className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">No campaigns yet</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create your first campaign to track reach and engagement across supported channels.</p>
      <Button variant="hero" className="mt-5 rounded-xl" onClick={onCreate}>
        <Rocket className="mr-2 h-4 w-4" /> Create campaign
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function typeLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "paused") return "bg-amber-50 text-amber-700";
  if (status === "completed") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
