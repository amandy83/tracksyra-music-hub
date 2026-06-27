import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Copy, Link2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { buildSmartLinkSlug, createPreSaveCampaign, getPreSaveLink, loadPreSaveWorkspace, type PreSaveReleaseRow } from "./preSaveCampaignData";

export default function PreSaveCampaignCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [releases, setReleases] = useState<PreSaveReleaseRow[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [status, setStatus] = useState("draft");
  const [launchDate, setLaunchDate] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadPreSaveWorkspace(user.id);
    setReleases(workspace.releases);
    setReleaseId((current) => current || workspace.releases[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const selectedRelease = useMemo(() => releases.find((release) => release.id === releaseId) || null, [releases, releaseId]);
  const previewSlug = useMemo(() => {
    if (!campaignName || !selectedRelease) return "";
    return buildSmartLinkSlug(campaignName, selectedRelease.title);
  }, [campaignName, selectedRelease]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedRelease || !campaignName.trim()) {
      toast.error("Select a release and provide a campaign name.");
      return;
    }

    setSaving(true);
    const result = await createPreSaveCampaign({
      userId: user.id,
      releaseId: selectedRelease.id,
      campaignName: campaignName.trim(),
      status,
      launchDate: launchDate || null,
      notes: notes.trim() || null,
      destinationUrl: destinationUrl.trim() || null,
      releaseTitle: selectedRelease.title,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    const slug = result.data?.smart_link_slug;
    toast.success("Pre-save campaign created.");
    if (slug) {
      navigate(`/pre-save/${slug}`);
      return;
    }
    navigate("/dashboard/pre-save/campaigns");
  };

  return (
    <DashboardShell
      title="Create Pre-Save Campaign"
      eyebrow="Campaign creation form"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save")}>Dashboard</Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save/campaigns")}>Campaigns</Button>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard className="p-5">
          <SectionHeader
            title="Campaign creation form"
            description="Create a pre-save campaign, set its status, and generate a smart link."
          />
          {loading ? (
            <SkeletonCard className="min-h-[520px]" />
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="campaignName">Campaign name</Label>
                <Input id="campaignName" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Album launch pre-save" required />
              </div>

              <div className="grid gap-2">
                <Label>Release</Label>
                <Select value={releaseId} onValueChange={setReleaseId}>
                  <SelectTrigger className="rounded-xl bg-white/80">
                    <SelectValue placeholder="Select release" />
                  </SelectTrigger>
                  <SelectContent>
                    {releases.map((release) => (
                      <SelectItem key={release.id} value={release.id}>
                        {release.title} - {release.primary_artist}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="rounded-xl bg-white/80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="launchDate">Launch date</Label>
                  <Input id="launchDate" type="date" value={launchDate} onChange={(event) => setLaunchDate(event.target.value)} />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="destinationUrl">Destination URL</Label>
                <Input id="destinationUrl" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} placeholder="https://open.spotify.com/album/..." />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Rollout notes, creative direction, or partner info." className="min-h-[140px]" />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="hero" className="rounded-xl" disabled={saving || !selectedRelease}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Create campaign
                </Button>
                <Button type="button" variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save")}>Cancel</Button>
              </div>
            </form>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <SectionHeader title="Smart link preview" description="The generated link is used for click and save tracking." />
            {selectedRelease ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/80 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/20">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Ready to share</p>
                  <h3 className="mt-2 text-2xl font-black tracking-tight">{campaignName || "Campaign name preview"}</h3>
                  <p className="mt-2 text-sm text-white/75">{selectedRelease.title} by {selectedRelease.primary_artist}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge className="bg-white/15 text-white hover:bg-white/15">{status}</Badge>
                    <Badge className="bg-white/15 text-white hover:bg-white/15">{selectedRelease.genre || "Genre"}</Badge>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/80 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated URL</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-slate-500" />
                    <p className="break-all text-sm font-medium text-slate-950">{previewSlug ? getPreSaveLink(previewSlug) : "Enter a campaign name to generate a link."}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl bg-white/75"
                      disabled={!previewSlug}
                      onClick={async () => {
                        if (!previewSlug) return;
                        await navigator.clipboard.writeText(getPreSaveLink(previewSlug));
                        toast.success("Link copied.");
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy link
                    </Button>
                    <Button variant="ghost" className="rounded-xl" onClick={() => navigate("/dashboard/pre-save/campaigns")}>
                      <CalendarDays className="mr-2 h-4 w-4" /> View campaigns
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <SkeletonCard className="min-h-[220px]" />
            )}
          </GlassCard>
        </div>
      </div>
    </DashboardShell>
  );
}
