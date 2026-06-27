import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, PauseCircle, CheckCircle2, ArrowLeft, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, loadCampaignCenterCampaign, updateCampaign, updateCampaignStatus, type CampaignMetricRow, type CampaignRow } from "./campaignCenterData";

export default function CampaignCenterDetail() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaignId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [metric, setMetric] = useState<CampaignMetricRow | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState<(typeof CAMPAIGN_TYPES)[number]>("spotify");
  const [budget, setBudget] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<(typeof CAMPAIGN_STATUSES)[number]>("draft");
  const [notes, setNotes] = useState("");

  const load = async () => {
    if (!user || !campaignId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await loadCampaignCenterCampaign(campaignId, user.id);
    setCampaign(result.campaign);
    setMetric(result.metric);
    if (result.campaign) {
      setCampaignName(result.campaign.campaign_name);
      setCampaignType(result.campaign.campaign_type as (typeof CAMPAIGN_TYPES)[number]);
      setBudget(String(result.campaign.budget));
      setStartDate(result.campaign.start_date || "");
      setEndDate(result.campaign.end_date || "");
      setStatus(result.campaign.status as (typeof CAMPAIGN_STATUSES)[number]);
      setNotes(result.campaign.notes || "");
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [campaignId, user]);

  const stats = useMemo(() => ({
    reach: Number(metric?.total_reach || 0),
    engagement: Number(metric?.total_engagement || 0),
    engagementRate: Number(metric?.total_reach || 0) > 0 ? Math.round((Number(metric?.total_engagement || 0) / Number(metric?.total_reach || 1)) * 100) : 0,
  }), [metric]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !campaign) return;
    const parsedBudget = Number(budget);
    if (!campaignName.trim() || Number.isNaN(parsedBudget) || parsedBudget < 0) {
      toast.error("Provide a campaign name and valid budget.");
      return;
    }

    setSaving(true);
    const result = await updateCampaign({
      campaignId: campaign.id,
      userId: user.id,
      campaignName: campaignName.trim(),
      campaignType,
      budget: parsedBudget,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
      notes: notes.trim() || null,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    toast.success("Campaign updated.");
    await load();
  };

  const pause = async () => {
    if (!user || !campaign) return;
    const { error } = await updateCampaignStatus({ campaignId: campaign.id, userId: user.id, status: "paused" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Campaign paused.");
    await load();
  };

  const complete = async () => {
    if (!user || !campaign) return;
    const { error } = await updateCampaignStatus({ campaignId: campaign.id, userId: user.id, status: "completed" });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Campaign completed.");
    await load();
  };

  return (
    <DashboardShell
      title="Campaign Detail"
      eyebrow="Campaign center"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center/campaigns")}>
            Campaigns
          </Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/campaign-center/new")}>
            <Sparkles className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="p-5">
          <SectionHeader
            title="Campaign detail page"
            description="Edit campaign fields, pause the campaign, or mark it complete."
            action={<Button variant="outline" className="rounded-xl bg-white/75" asChild><Link to="/dashboard/campaign-center"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link></Button>}
          />

          {loading ? (
            <SkeletonCard className="min-h-[520px]" />
          ) : campaign ? (
            <form className="space-y-5" onSubmit={submit}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={statusTone(campaign.status)}>{campaign.status}</Badge>
                <Badge variant="outline" className="capitalize">{campaign.campaign_type.replace(/_/g, " ")}</Badge>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="campaignName">Campaign Name</Label>
                <Input id="campaignName" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required />
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Campaign Type</Label>
                  <Select value={campaignType} onValueChange={(value) => setCampaignType(value as (typeof CAMPAIGN_TYPES)[number])}>
                    <SelectTrigger className="rounded-xl bg-white/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{type.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="budget">Budget</Label>
                  <Input id="budget" type="number" min="0" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} required />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(value) => setStatus(value as (typeof CAMPAIGN_STATUSES)[number])}>
                    <SelectTrigger className="rounded-xl bg-white/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_STATUSES.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-[108px]" />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="hero" className="rounded-xl" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save changes
                </Button>
                <Button type="button" variant="outline" className="rounded-xl bg-white/75" onClick={pause}>
                  <PauseCircle className="mr-2 h-4 w-4" /> Pause Campaign
                </Button>
                <Button type="button" variant="outline" className="rounded-xl bg-white/75" onClick={complete}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Complete Campaign
                </Button>
              </div>
            </form>
          ) : (
            <EmptyState />
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <SectionHeader title="View Metrics" description="Campaign performance metrics for reach and engagement." />
            {loading ? (
              <SkeletonCard className="min-h-[220px]" />
            ) : campaign ? (
              <div className="grid gap-3">
                <KpiCard label="Total Reach" value={stats.reach} delta={stats.reach ? 12 : 0} comparison="aggregated reach" icon={Sparkles} accent="pink" />
                <KpiCard label="Total Engagement" value={stats.engagement} delta={stats.engagement ? 14 : 0} comparison="aggregated engagement" icon={Sparkles} accent="teal" />
                <KpiCard label="Engagement Rate" value={`${stats.engagementRate}%`} delta={stats.engagementRate ? 6 : 0} comparison="engagement / reach" icon={Sparkles} accent="blue" />
              </div>
            ) : (
              <EmptyState />
            )}
          </GlassCard>

          {campaign && (
            <GlassCard className="p-5">
              <SectionHeader title="Campaign summary" description="Current campaign state and schedule." />
              <div className="space-y-3 text-sm text-slate-600">
                <InfoRow label="Campaign Type" value={campaign.campaign_type.replace(/_/g, " ")} />
                <InfoRow label="Budget" value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(campaign.budget)} />
                <InfoRow label="Start Date" value={campaign.start_date || "Not set"} />
                <InfoRow label="End Date" value={campaign.end_date || "Not set"} />
                <InfoRow label="Notes" value={campaign.notes || "No notes"} />
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <h3 className="mt-1 text-lg font-bold text-slate-950">Campaign not found</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Return to the campaign list or create a new campaign.</p>
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

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "paused") return "bg-amber-50 text-amber-700";
  if (status === "completed") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}
