import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { loadDspAnalyticsWorkspace, type DspAnalyticsWorkspace } from "./dspAnalyticsData";

export default function DspAnalyticsPlaylistPerformance() {
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
    setWorkspace(await loadDspAnalyticsWorkspace(user.id));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const performance = workspace?.playlistPerformance || [];
  const topPlacements = useMemo(() => performance.slice(0, 6), [performance]);
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

  const chartData = performance.slice(0, 10).map((row) => ({
    label: row.playlist_name || row.curator_name,
    streams: Number(row.streams_gained || 0),
    saves: Number(row.saves_gained || 0),
    reach: Number(row.estimated_reach || 0),
  }));

  return (
    <DashboardShell
      title="Playlist Performance"
      eyebrow="Phase 8.4 DSP Analytics"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/dsp-analytics/streams")}>
            <Sparkles className="mr-2 h-4 w-4" /> Streams
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Playlist Adds" value={stats.playlistAdds.toLocaleString()} delta={stats.playlistAdds ? 12 : 0} comparison="playlist pitching" icon={BarChart3} accent="pink" />
          <KpiCard label="Streams" value={stats.streams.toLocaleString()} delta={stats.streams ? 14 : 0} comparison="placement lift" icon={TrendingUp} accent="blue" />
          <KpiCard label="Saves" value={stats.saves.toLocaleString()} delta={stats.saves ? 9 : 0} comparison="listener saves" icon={Sparkles} accent="green" />
          <KpiCard label="Reach" value={stats.reach.toLocaleString()} delta={stats.reach ? 11 : 0} comparison="playlist reach" icon={BarChart3} accent="teal" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Playlist Performance Page" description="Playlist pitching analytics combined with performance placements and reach." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : chartData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="streams" stroke="#ec4899" fill="#fce7f3" />
                  <Area type="monotone" dataKey="saves" stroke="#14b8a6" fill="#ccfbf1" />
                  <Area type="monotone" dataKey="reach" stroke="#6366f1" fill="#e0e7ff" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No playlist performance data yet" />
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Pitch Summary" description="Current pitch volume and playlist response context." />
            <div className="grid gap-3">
              <MiniStat label="Total Pitches" value={stats.totalPlaylistPitches.toLocaleString()} />
              <MiniStat label="Campaign Center Campaigns" value={stats.totalCampaigns.toLocaleString()} />
              <MiniStat label="Pre-Save Campaigns" value={stats.totalPreSaveCampaigns.toLocaleString()} />
              <MiniStat label="Followers" value={stats.followers.toLocaleString()} />
            </div>
          </GlassCard>
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Top Placements" description="Highest reach and engagement placements from playlist performance." />
          {loading ? (
            <SkeletonCard className="min-h-[260px]" />
          ) : topPlacements.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {topPlacements.map((row) => (
                <div key={row.placement_id} className="rounded-2xl border border-white/80 bg-white/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-950">{row.playlist_name || row.curator_name}</h3>
                        <Badge variant="outline" className="capitalize">{row.placement_status}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{row.release_title} • {row.track_title}</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{Number(row.effectiveness_score || 0).toFixed(0)}</p>
                      <p>score</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <MiniStat label="Streams" value={row.streams_gained.toLocaleString()} />
                    <MiniStat label="Saves" value={row.saves_gained.toLocaleString()} />
                    <MiniStat label="Reach" value={row.estimated_reach.toLocaleString()} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No placements found" />
          )}
        </GlassCard>
      </div>
    </DashboardShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">{label}</div>;
}
