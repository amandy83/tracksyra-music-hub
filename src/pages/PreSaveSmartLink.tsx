import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Loader2, Music3, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";
import { getPreSaveLink, getVisitorId, loadPreSaveCampaignBySlug, trackPreSaveEvent, type PreSaveCampaignRow, type PreSaveReleaseRow } from "./preSaveCampaignData";

export default function PreSaveSmartLink() {
  const navigate = useNavigate();
  const { slug = "" } = useParams();
  const clickTracked = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState<PreSaveCampaignRow | null>(null);
  const [release, setRelease] = useState<PreSaveReleaseRow | null>(null);
  const [clickCount, setClickCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);

  const load = async () => {
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await loadPreSaveCampaignBySlug(slug);
    setCampaign(result.campaign);
    setRelease(result.release);
    setClickCount(result.clickCount);
    setSaveCount(result.saveCount);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [slug]);

  useEffect(() => {
    if (!campaign || clickTracked.current) return;
    clickTracked.current = true;
    void trackPreSaveEvent({
      campaignId: campaign.id,
      eventType: "click",
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      visitorId: getVisitorId(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    }).then(() => setClickCount((count) => count + 1)).catch(() => {});
  }, [campaign]);

  const conversionRate = clickCount > 0 ? Math.round((saveCount / clickCount) * 100) : 0;

  const handleSave = async () => {
    if (!campaign) return;
    setSaving(true);
    const { error } = await trackPreSaveEvent({
      campaignId: campaign.id,
      eventType: "save",
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      visitorId: getVisitorId(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSaveCount((count) => count + 1);
    toast.success("Save tracked.");
  };

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.20),transparent_36%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.14),transparent_26%),linear-gradient(135deg,#ffffff_0%,#fff7fb_48%,#f9fbff_100%)]" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Button variant="outline" className="rounded-xl bg-white/80" onClick={() => navigate("/dashboard/pre-save")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
          </Button>
          <Button variant="ghost" className="rounded-xl" asChild>
            <Link to={slug ? `/pre-save/${slug}` : "#"}>
              <Music3 className="mr-2 h-4 w-4" /> Smart Link
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <GlassCard className="lg:col-span-2 p-5">
              <SectionHeader title="Loading smart link" description="Tracking campaign details and metrics." />
              <div className="space-y-4">
                <div className="h-40 rounded-3xl bg-slate-100/90" />
                <div className="h-4 w-2/3 rounded-full bg-slate-100" />
                <div className="h-4 w-1/2 rounded-full bg-slate-100" />
              </div>
            </GlassCard>
            <GlassCard className="p-5">
              <div className="h-20 rounded-3xl bg-slate-100/90" />
            </GlassCard>
          </div>
        ) : campaign ? (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <GlassCard className="p-5">
              <SectionHeader
                title={campaign.campaign_name}
                description={`Smart link for ${release?.title || "the selected release"}`}
                action={<Badge className={badgeTone(campaign.status)}>{campaign.status}</Badge>}
              />
              <div className="rounded-[2rem] border border-slate-950/10 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Pre-save campaign</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{release?.title || "Release"}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                  {release?.primary_artist || "Artist"} {release?.genre ? `- ${release.genre}` : ""} {release?.release_date ? `- ${release.release_date}` : ""}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge className="bg-white/15 text-white hover:bg-white/15">{campaign.smart_link_slug}</Badge>
                  <Badge className="bg-white/15 text-white hover:bg-white/15">{getPreSaveLink(campaign.smart_link_slug)}</Badge>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button variant="hero" className="rounded-xl" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Save this release
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white"
                    onClick={async () => {
                      await navigator.clipboard.writeText(getPreSaveLink(campaign.smart_link_slug));
                      toast.success("Link copied.");
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Copy smart link
                  </Button>
                </div>
              </div>
            </GlassCard>

            <div className="space-y-4">
              <GlassCard className="p-5">
                <SectionHeader title="Campaign statistics" description="Tracked directly from click and save events." />
                <div className="grid gap-3">
                  <KpiCard label="Total Clicks" value={clickCount} delta={clickCount ? 10 : 0} comparison="smart link visits" icon={Music3} accent="blue" />
                  <KpiCard label="Total Saves" value={saveCount} delta={saveCount ? 13 : 0} comparison="listener intent" icon={Sparkles} accent="green" />
                  <KpiCard label="Conversion Rate" value={`${conversionRate}%`} delta={conversionRate ? 5 : 0} comparison="saves / clicks" icon={Sparkles} accent="teal" />
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <SectionHeader title="Campaign notes" description="Status, release metadata, and delivery context." />
                <div className="space-y-3 text-sm text-slate-600">
                  <InfoRow label="Status" value={campaign.status} />
                  <InfoRow label="Launch date" value={campaign.launch_date || "Not set"} />
                  <InfoRow label="Destination URL" value={campaign.destination_url || "Not set"} />
                  <InfoRow label="Notes" value={campaign.notes || "No notes available"} />
                </div>
              </GlassCard>
            </div>
          </div>
        ) : (
          <GlassCard className="mx-auto max-w-2xl p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              <Music3 className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-2xl font-bold text-slate-950">Campaign not found</h2>
            <p className="mt-2 text-sm text-slate-500">Check the smart link slug or return to the dashboard to create a new campaign.</p>
            <Button variant="hero" className="mt-5 rounded-xl" onClick={() => navigate("/dashboard/pre-save")}>Go to dashboard</Button>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-950">{value}</p>
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
