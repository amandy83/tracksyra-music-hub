import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { loadAiDspAssistantWorkspace, AI_DSP_RECOMMENDATION_TYPES, type AiDspAssistantWorkspace, type AiDspRecommendationRow } from "./dspAiAssistantData";

export default function DspAiAssistantRecommendations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<AiDspAssistantWorkspace | null>(null);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setWorkspace(await loadAiDspAssistantWorkspace(user.id));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const recommendations = workspace?.recommendations || [];
  const grouped = workspace?.groupedRecommendations || emptyGrouped();

  const stats = useMemo(() => ({
    total: recommendations.length,
    highConfidence: recommendations.filter((item) => Number(item.confidence_score || 0) >= 80).length,
    topConfidence: recommendations.reduce((max, item) => Math.max(max, Number(item.confidence_score || 0)), 0),
  }), [recommendations]);

  return (
    <DashboardShell
      title="Recommendations"
      eyebrow="Phase 8.5 AI DSP Assistant"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-ai-assistant")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Assistant
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Total Recommendations" value={stats.total} />
          <MetricCard label="High Confidence" value={stats.highConfidence} />
          <MetricCard label="Top Confidence" value={`${stats.topConfidence}%`} />
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Deterministic Recommendation List" description="Recommendations are grouped by type and scored from the existing DSP data model." action={<Badge variant="outline">{recommendations.length} items</Badge>} />
          {loading ? (
            <SkeletonCard className="min-h-[360px]" />
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
                <TabsTrigger value="all">All</TabsTrigger>
                {AI_DSP_RECOMMENDATION_TYPES.map((type) => (
                  <TabsTrigger key={type} value={type} className="capitalize">{type.replace(/_/g, " ")}</TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all" className="mt-5">
                <RecommendationGrid items={recommendations} />
              </TabsContent>
              {AI_DSP_RECOMMENDATION_TYPES.map((type) => (
                <TabsContent key={type} value={type} className="mt-5">
                  <RecommendationGrid items={grouped[type]} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Source Notes" description="These outputs are derived only from current Playlist Pitching analytics, DSP Analytics, Campaign Center metrics, and Pre-Save metrics." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SourceRow label="Playlist pitching" value={`${workspace?.analyticsWorkspace.pitchAnalytics.length || 0} rows`} />
            <SourceRow label="DSP analytics" value={`${workspace?.analyticsWorkspace.snapshots.length || 0} snapshots`} />
            <SourceRow label="Campaign center" value={`${workspace?.analyticsWorkspace.campaignWorkspace.campaigns.length || 0} campaigns`} />
            <SourceRow label="Pre-save" value={`${workspace?.analyticsWorkspace.preSaveWorkspace.campaigns.length || 0} campaigns`} />
          </div>
        </GlassCard>
      </div>
    </DashboardShell>
  );
}

function RecommendationGrid({ items }: { items: AiDspRecommendationRow[] }) {
  if (!items.length) {
    return <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">No recommendations in this group yet.</div>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={`${item.recommendation_type}-${item.recommendation}`} className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">{item.recommendation_type.replace(/_/g, " ")}</Badge>
                <Badge className="bg-slate-950 text-white hover:bg-slate-950">{Math.round(Number(item.confidence_score || 0))}% confidence</Badge>
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-950">{item.recommendation}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
            </div>
            <div className="w-full max-w-[180px]">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <span>Confidence</span>
                <span>{Math.round(Number(item.confidence_score || 0))}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-gradient-to-r from-pink-500 to-teal-500" style={{ width: `${Math.max(8, Math.min(100, Number(item.confidence_score || 0)))}%` }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <GlassCard className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
        <Sparkles className="h-4 w-4" />
        Deterministic assistant output
      </div>
    </GlassCard>
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

function emptyGrouped() {
  return AI_DSP_RECOMMENDATION_TYPES.reduce((acc, type) => {
    acc[type] = [];
    return acc;
  }, {} as Record<(typeof AI_DSP_RECOMMENDATION_TYPES)[number], AiDspRecommendationRow[]>);
}
