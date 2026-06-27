import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Globe2, Music4, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { loadDspAnalyticsWorkspace, type DspAnalyticsWorkspace } from "./dspAnalyticsData";

const COLORS = ["#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#22c55e", "#ef4444", "#8b5cf6", "#0ea5e9"];

export default function DspAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<DspAnalyticsWorkspace | null>(null);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await loadDspAnalyticsWorkspace(user.id);
    setWorkspace(next);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const stats = workspace?.stats || {
    streams: 0,
    saves: 0,
    playlistAdds: 0,
    followers: 0,
    reach: 0,
    engagement: 0,
    activeCampaigns: 0,
    totalCampaigns: 0,
    totalPreSaveCampaigns: 0,
    totalPlaylistPitches: 0,
  };

  const dailyChart = workspace?.dailySeries || [];
  const playlistInsights = workspace?.pitchAnalytics.slice(0, 4) || [];

  return (
    <DashboardShell
      title="DSP Analytics Dashboard"
      eyebrow="Phase 8.4 DSP Analytics"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-marketing")}>
            DSP Marketing
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/dsp-analytics/streams")}>
            <Sparkles className="mr-2 h-4 w-4" /> Streams Overview
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Streams" value={formatCount(stats.streams)} delta={stats.streams ? 12 : 0} comparison="playlist performance" icon={TrendingUp} accent="pink" />
          <KpiCard label="Saves" value={formatCount(stats.saves)} delta={stats.saves ? 10 : 0} comparison="pre-save + playlist saves" icon={Sparkles} accent="green" />
          <KpiCard label="Playlist Adds" value={formatCount(stats.playlistAdds)} delta={stats.playlistAdds ? 11 : 0} comparison="playlist pitching" icon={Music4} accent="blue" />
          <KpiCard label="Followers" value={formatCount(stats.followers)} delta={stats.followers ? 9 : 0} comparison="audience base" icon={Globe2} accent="teal" />
          <KpiCard label="Reach" value={formatCount(stats.reach)} delta={stats.reach ? 14 : 0} comparison="campaign reach" icon={BarChart3} accent="amber" />
          <KpiCard label="Engagement" value={formatCount(stats.engagement)} delta={stats.engagement ? 13 : 0} comparison="all channels" icon={Sparkles} accent="slate" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <GlassCard className="p-5">
            <SectionHeader
              title="DSP Analytics Dashboard"
              description="Unified view across playlist pitching, campaign center, pre-save, and audience metrics."
              action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics/audience")}><ArrowRight className="mr-2 h-4 w-4" />Audience</Button>}
            />
            {loading ? (
              <SkeletonCard className="min-h-[340px]" />
            ) : (
              <Tabs defaultValue="daily">
                <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
                <TabsContent value="daily" className="mt-5">
                  <AnalyticsChart data={dailyChart} title="Daily Performance" />
                </TabsContent>
                <TabsContent value="weekly" className="mt-5">
                  <AnalyticsChart data={workspace?.weeklySeries || []} title="Weekly Performance" />
                </TabsContent>
                <TabsContent value="monthly" className="mt-5">
                  <AnalyticsChart data={workspace?.monthlySeries || []} title="Monthly Performance" />
                </TabsContent>
              </Tabs>
            )}
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <SectionHeader title="Source Coverage" description="Metrics pulled from existing DSP workflows." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <SourceRow label="Playlist Pitching" value={`${stats.totalPlaylistPitches} pitches`} />
                <SourceRow label="Campaign Center" value={`${stats.totalCampaigns} campaigns`} />
                <SourceRow label="Pre-Save Builder" value={`${stats.totalPreSaveCampaigns} campaigns`} />
                <SourceRow label="Audience Metrics" value={`${workspace?.audienceMetrics.length || 0} rows`} />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <SectionHeader title="Quick Links" description="Jump to the focused analytics pages." />
              <div className="space-y-3">
                <Button variant="hero" className="w-full rounded-xl" onClick={() => navigate("/dashboard/dsp-analytics/streams")}>Streams Overview</Button>
                <Button variant="outline" className="w-full rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics/audience")}>Audience Insights</Button>
                <Button variant="outline" className="w-full rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics/playlist-performance")}>Playlist Performance</Button>
              </div>
            </GlassCard>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Top Countries" description="Audience coverage by country breakdown." />
            {loading ? (
              <SkeletonCard className="min-h-[260px]" />
            ) : workspace?.countryBreakdown.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={workspace.countryBreakdown} dataKey="followers" nameKey="country" innerRadius={50} outerRadius={90} label>
                    {workspace.countryBreakdown.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyHint label="No audience metrics yet" />
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Playlist Performance Highlights" description="Latest playlist pitching analytics." />
            {loading ? (
              <SkeletonCard className="min-h-[260px]" />
            ) : playlistInsights.length ? (
              <div className="space-y-3">
                {playlistInsights.map((pitch) => (
                  <div key={pitch.id} className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-950">{pitch.release_title}</h3>
                          <Badge variant="outline" className="capitalize">{pitch.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{pitch.track_title} • {pitch.territory || "Global"}</p>
                      </div>
                      <div className="text-right text-xs font-medium text-slate-500">
                        <p>{formatCount(pitch.estimated_playlist_reach)}</p>
                        <p>reach</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <MetricMini label="Curators" value={pitch.total_curators_sent} />
                      <MetricMini label="Adds" value={pitch.playlist_added_count} />
                      <MetricMini label="Response" value={`${pitch.curator_response_rate}%`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint label="No playlist pitch analytics yet" />
            )}
          </GlassCard>
        </section>
      </div>
    </DashboardShell>
  );
}

function AnalyticsChart({ data, title }: { data: Array<{ label: string; streams: number; saves: number; playlistAdds: number; followers: number; reach: number; engagement: number }>; title: string }) {
  return data.length ? (
    <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <Badge variant="outline">{data.length} points</Badge>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="streams" stroke="#ec4899" fill="#fce7f3" />
          <Area type="monotone" dataKey="saves" stroke="#14b8a6" fill="#ccfbf1" />
          <Area type="monotone" dataKey="engagement" stroke="#6366f1" fill="#e0e7ff" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  ) : (
    <EmptyHint label="No chart data available yet" />
  );
}

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/80 px-3 py-2 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}
