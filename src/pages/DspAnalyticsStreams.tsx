import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line, BarChart, Bar } from "recharts";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { loadDspAnalyticsWorkspace, type DspAnalyticsWorkspace } from "./dspAnalyticsData";

export default function DspAnalyticsStreams() {
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

  return (
    <DashboardShell
      title="Streams Overview"
      eyebrow="Phase 8.4 DSP Analytics"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics")}>Dashboard</Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/dsp-analytics/audience")}>
            <Sparkles className="mr-2 h-4 w-4" /> Audience Insights
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Streams" value={stats.streams.toLocaleString()} delta={stats.streams ? 14 : 0} comparison="total stream lift" icon={TrendingUp} accent="pink" />
          <KpiCard label="Saves" value={stats.saves.toLocaleString()} delta={stats.saves ? 11 : 0} comparison="save momentum" icon={Sparkles} accent="green" />
          <KpiCard label="Reach" value={stats.reach.toLocaleString()} delta={stats.reach ? 12 : 0} comparison="cross-channel reach" icon={BarChart3} accent="blue" />
          <KpiCard label="Engagement" value={stats.engagement.toLocaleString()} delta={stats.engagement ? 10 : 0} comparison="listener engagement" icon={TrendingUp} accent="teal" />
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Streams Overview Page" description="Daily, weekly, and monthly performance from analytics snapshots and existing DSP sources." />
          {loading ? (
            <SkeletonCard className="min-h-[420px]" />
          ) : (
            <Tabs defaultValue="daily">
              <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>

              <TabsContent value="daily" className="mt-5">
                <StreamChart title="Daily Streams" data={workspace?.dailySeries || []} mode="area" />
              </TabsContent>
              <TabsContent value="weekly" className="mt-5">
                <StreamChart title="Weekly Streams" data={workspace?.weeklySeries || []} mode="line" />
              </TabsContent>
              <TabsContent value="monthly" className="mt-5">
                <StreamChart title="Monthly Streams" data={workspace?.monthlySeries || []} mode="bar" />
              </TabsContent>
            </Tabs>
          )}
        </GlassCard>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Source Mix" description="Contributions from campaign center and pre-save builder." />
            <div className="space-y-3">
              <SourceRow label="Campaign Center campaigns" value={stats.totalCampaigns} />
              <SourceRow label="Pre-Save campaigns" value={stats.totalPreSaveCampaigns} />
              <SourceRow label="Playlist pitches" value={stats.totalPlaylistPitches} />
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Snapshot Summary" description="Latest analytics totals across all connected sources." />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
              <MiniStat label="Streams" value={stats.streams.toLocaleString()} />
              <MiniStat label="Saves" value={stats.saves.toLocaleString()} />
              <MiniStat label="Playlist Adds" value={stats.playlistAdds.toLocaleString()} />
              <MiniStat label="Followers" value={stats.followers.toLocaleString()} />
            </div>
          </GlassCard>
        </section>
      </div>
    </DashboardShell>
  );
}

function StreamChart({ title, data, mode }: { title: string; data: Array<{ label: string; streams: number; saves: number; playlistAdds: number; followers: number; reach: number; engagement: number }>; mode: "area" | "line" | "bar" }) {
  if (!data.length) {
    return <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">No trend data available yet.</div>;
  }

  return (
    <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <Badge variant="outline">{data.length} points</Badge>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        {mode === "area" ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="streams" stroke="#ec4899" fill="#fce7f3" />
            <Area type="monotone" dataKey="saves" stroke="#14b8a6" fill="#ccfbf1" />
          </AreaChart>
        ) : mode === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="streams" stroke="#ec4899" strokeWidth={2} />
            <Line type="monotone" dataKey="engagement" stroke="#6366f1" strokeWidth={2} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="streams" fill="#ec4899" />
            <Bar dataKey="playlistAdds" fill="#14b8a6" />
            <Bar dataKey="reach" fill="#6366f1" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function SourceRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
