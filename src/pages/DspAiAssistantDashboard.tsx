import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, BrainCircuit, RefreshCw, Sparkles, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { loadAiDspAssistantWorkspace, type AiDspAssistantWorkspace, type AiDspRecommendationRow } from "./dspAiAssistantData";

export default function DspAiAssistantDashboard() {
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

  const stats = workspace?.stats || {
    totalRecommendations: 0,
    highConfidenceRecommendations: 0,
    sourcesUsed: 0,
    topConfidenceScore: 0,
    recommendationTypes: 0,
  };

  const featured = useMemo(() => {
    const list = workspace?.recommendations || [];
    return workspace ? [
      topByType(list, "best_release_day"),
      topByType(list, "best_release_time"),
      topByType(list, "recommended_campaign_type"),
      topByType(list, "recommended_countries"),
      topByType(list, "recommended_curators"),
      topByType(list, "similar_artists"),
    ].filter(Boolean) as AiDspRecommendationRow[] : [];
  }, [workspace]);

  return (
    <DashboardShell
      title="AI DSP Assistant"
      eyebrow="Phase 8.5 AI DSP Assistant"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-marketing")}>
            DSP Marketing
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/dsp-ai-assistant/recommendations")}>
            <ArrowRight className="mr-2 h-4 w-4" /> Recommendations
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Recommendations" value={stats.totalRecommendations} delta={stats.totalRecommendations ? 12 : 0} comparison="deterministic outputs" icon={Sparkles} accent="pink" />
          <KpiCard label="High Confidence" value={stats.highConfidenceRecommendations} delta={stats.highConfidenceRecommendations ? 10 : 0} comparison="80% and above" icon={Target} accent="green" />
          <KpiCard label="Sources Used" value={stats.sourcesUsed} delta={stats.sourcesUsed ? 8 : 0} comparison="analytics inputs" icon={BrainCircuit} accent="blue" />
          <KpiCard label="Top Confidence" value={`${stats.topConfidenceScore}%`} delta={stats.topConfidenceScore ? 14 : 0} comparison="best recommendation" icon={Bot} accent="teal" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <GlassCard className="p-5">
            <SectionHeader
              title="AI DSP Assistant Dashboard"
              description="Deterministic launch recommendations built from Playlist Pitching analytics, DSP Analytics, Campaign Center metrics, and Pre-Save metrics."
              action={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/dsp-ai-assistant/recommendations")}><ArrowRight className="mr-2 h-4 w-4" />Open list</Button>}
            />
            {loading ? (
              <SkeletonCard className="min-h-[360px]" />
            ) : featured.length ? (
              <div className="grid gap-3">
                {featured.map((item) => (
                  <RecommendationPreview key={`${item.recommendation_type}-${item.recommendation}`} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState label="No recommendations available yet" />
            )}
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <SectionHeader title="Recommendation Engine" description="No external AI APIs. Scores are derived from existing analytics signals only." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MiniStat label="Best release day" value={topByType(workspace?.recommendations || [], "best_release_day")?.recommendation || "—"} />
                <MiniStat label="Best release time" value={topByType(workspace?.recommendations || [], "best_release_time")?.recommendation || "—"} />
                <MiniStat label="Recommended campaign type" value={topByType(workspace?.recommendations || [], "recommended_campaign_type")?.recommendation || "—"} />
                <MiniStat label="Top country" value={topByType(workspace?.recommendations || [], "recommended_countries")?.recommendation || "—"} />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <SectionHeader title="Source Coverage" description="Assistant inputs currently connected to the rules engine." />
              <div className="space-y-3">
                <SourceRow label="Playlist pitching" value={`${workspace?.analyticsWorkspace.pitchAnalytics.length || 0} rows`} />
                <SourceRow label="DSP analytics snapshots" value={`${workspace?.analyticsWorkspace.snapshots.length || 0} rows`} />
                <SourceRow label="Campaign center campaigns" value={`${workspace?.analyticsWorkspace.campaignWorkspace.campaigns.length || 0} rows`} />
                <SourceRow label="Pre-save campaigns" value={`${workspace?.analyticsWorkspace.preSaveWorkspace.campaigns.length || 0} rows`} />
              </div>
            </GlassCard>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function RecommendationPreview({ item }: { item: AiDspRecommendationRow }) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">{item.recommendation_type.replace(/_/g, " ")}</Badge>
          <Badge className="bg-slate-950 text-white hover:bg-slate-950">{Math.round(Number(item.confidence_score || 0))}% confidence</Badge>
        </div>
        <div className="text-xs text-slate-500">Recommendation</div>
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-950">{item.recommendation}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p>
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

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-500">{label}</div>;
}

function topByType(recommendations: AiDspRecommendationRow[], type: AiDspRecommendationRow["recommendation_type"]) {
  return recommendations.filter((item) => item.recommendation_type === type).sort((a, b) => Number(b.confidence_score || 0) - Number(a.confidence_score || 0))[0] || null;
}
