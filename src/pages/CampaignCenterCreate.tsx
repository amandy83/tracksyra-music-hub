import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Rocket, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, createCampaign, loadCampaignCenterWorkspace, type CampaignRow } from "./campaignCenterData";

export default function CampaignCenterCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignType, setCampaignType] = useState<(typeof CAMPAIGN_TYPES)[number]>("spotify");
  const [budget, setBudget] = useState("25000");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<(typeof CAMPAIGN_STATUSES)[number]>("draft");
  const [notes, setNotes] = useState("");

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadCampaignCenterWorkspace(user.id);
    setCampaigns(workspace.campaigns);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const recentCampaign = useMemo(() => campaigns[0] || null, [campaigns]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const parsedBudget = Number(budget);
    if (!campaignName.trim() || Number.isNaN(parsedBudget) || parsedBudget < 0) {
      toast.error("Provide a campaign name and valid budget.");
      return;
    }

    setSaving(true);
    const result = await createCampaign({
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

    const created = result.data as CampaignRow | null;
    toast.success("Campaign created.");
    navigate(created ? `/dashboard/campaign-center/${created.id}` : "/dashboard/campaign-center/campaigns");
  };

  return (
    <DashboardShell
      title="Create Campaign"
      eyebrow="Campaign creation page"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center")}>Dashboard</Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center/campaigns")}>Campaigns</Button>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <GlassCard className="p-5">
          <SectionHeader title="Campaign creation page" description="Create a Spotify, YouTube, TikTok, or Instagram campaign with budget and scheduling." />
          {loading ? (
            <SkeletonCard className="min-h-[520px]" />
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="campaignName">Campaign Name</Label>
                <Input id="campaignName" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Summer launch campaign" required />
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
                  <Input id="budget" type="number" min="0" step="1" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="25000" required />
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
                  <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Campaign notes, targeting, or creative direction." className="min-h-[108px]" />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="hero" className="rounded-xl" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Create campaign
                </Button>
                <Button type="button" variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center")}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Campaign preview" description="The latest campaign context from your campaign center." />
          {recentCampaign ? (
            <div className="space-y-4">
              <div className="rounded-[2rem] border border-slate-950/10 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Ready to launch</p>
                <h3 className="mt-2 text-3xl font-black tracking-tight">{campaignName || "Campaign name preview"}</h3>
                <p className="mt-2 text-sm text-white/75">{recentCampaign.campaign_name}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm text-slate-600">
                Set a budget, schedule, and channel type before creating the campaign. You can pause or complete it later from the detail page.
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
                <Rocket className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-950">No campaign preview yet</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a campaign to start tracking reach and engagement metrics.</p>
            </div>
          )}
        </GlassCard>
      </div>
    </DashboardShell>
  );
}
