import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Globe2, RefreshCw, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, CartesianGrid, XAxis, YAxis, LineChart, Line } from "recharts";
import { loadDspAnalyticsWorkspace, type DspAnalyticsWorkspace } from "./dspAnalyticsData";

const COLORS = ["#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#22c55e", "#ef4444", "#8b5cf6", "#0ea5e9"];

export default function DspAnalyticsAudience() {
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

  const followers = workspace?.stats.followers || 0;
  const reach = workspace?.stats.reach || 0;
  const engagement = workspace?.stats.engagement || 0;

  return (
    <DashboardShell
      title="Audience Insights"
      eyebrow="Phase 8.4 DSP Analytics"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-analytics")}>Dashboard</Button>
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
          <KpiCard label="Followers" value={followers.toLocaleString()} delta={followers ? 10 : 0} comparison="audience base" icon={Users} accent="pink" />
          <KpiCard label="Reach" value={reach.toLocaleString()} delta={reach ? 11 : 0} comparison="audience reach" icon={Globe2} accent="teal" />
          <KpiCard label="Engagement" value={engagement.toLocaleString()} delta={engagement ? 9 : 0} comparison="audience interaction" icon={Sparkles} accent="blue" />
          <KpiCard label="Countries" value={workspace?.countryBreakdown.length || 0} delta={workspace?.countryBreakdown.length ? 7 : 0} comparison="country breakdown" icon={Globe2} accent="green" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Country Breakdown" description="Top countries by followers, reach, and engagement." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : workspace?.countryBreakdown.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={workspace.countryBreakdown} dataKey="followers" nameKey="country" innerRadius={52} outerRadius={100} label>
                    {workspace.countryBreakdown.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No audience metrics yet" />
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Top Cities" description="Cities with the strongest audience concentration." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : workspace?.cityBreakdown.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={workspace.cityBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="city" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="followers" fill="#ec4899" />
                  <Bar dataKey="reach" fill="#14b8a6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No city-level data yet" />
            )}
          </GlassCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <GlassCard className="p-5">
            <SectionHeader title="Growth Trend" description="Audience growth over time from the audience metrics table." />
            {loading ? (
              <SkeletonCard className="min-h-[320px]" />
            ) : workspace?.growthTrend.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={workspace.growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="followers" stroke="#ec4899" strokeWidth={2} />
                  <Line type="monotone" dataKey="reach" stroke="#14b8a6" strokeWidth={2} />
                  <Line type="monotone" dataKey="engagement" stroke="#6366f1" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No growth trend data yet" />
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Audience Summary" description="Snapshot of your most active audience segments." />
            <div className="space-y-3">
              {workspace?.countryBreakdown.slice(0, 5).map((row) => (
                <SummaryRow key={row.country} label={row.country} value={row.followers.toLocaleString()} helper={`Reach ${row.reach.toLocaleString()} • Engagement ${row.engagement.toLocaleString()}`} />
              ))}
            </div>
          </GlassCard>
        </section>
      </div>
    </DashboardShell>
  );
}

function SummaryRow({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <Badge variant="outline">{value}</Badge>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">{label}</div>;
}
