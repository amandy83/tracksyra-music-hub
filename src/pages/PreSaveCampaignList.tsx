import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { buildCampaignMetrics, getPreSaveLink, loadPreSaveWorkspace, type PreSaveCampaignRow, type PreSaveEventRow, type PreSaveReleaseRow } from "./preSaveCampaignData";

const statusFilters = ["all", "draft", "scheduled", "active", "paused", "completed"] as const;

export default function PreSaveCampaignList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState<PreSaveReleaseRow[]>([]);
  const [campaigns, setCampaigns] = useState<PreSaveCampaignRow[]>([]);
  const [events, setEvents] = useState<PreSaveEventRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>("all");

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadPreSaveWorkspace(user.id);
    setReleases(workspace.releases);
    setCampaigns(workspace.campaigns);
    setEvents(workspace.events);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const releaseMap = useMemo(() => new Map(releases.map((release) => [release.id, release])), [releases]);
  const metrics = useMemo(() => buildCampaignMetrics(campaigns, events), [campaigns, events]);
  const filtered = useMemo(() => {
    return metrics.filter(({ campaign }) => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const haystack = `${campaign.campaign_name} ${campaign.smart_link_slug} ${campaign.notes || ""} ${releaseMap.get(campaign.release_id)?.title || ""}`.toLowerCase();
      const matchesSearch = search.trim() ? haystack.includes(search.trim().toLowerCase()) : true;
      return matchesStatus && matchesSearch;
    });
  }, [metrics, releaseMap, search, statusFilter]);

  const totalClicks = events.filter((event) => event.event_type === "click").length;
  const totalSaves = events.filter((event) => event.event_type === "save").length;
  const conversionRate = totalClicks > 0 ? Math.round((totalSaves / totalClicks) * 100) : 0;

  return (
    <DashboardShell
      title="Campaign List"
      eyebrow="Pre-Save campaigns"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/pre-save")}>Dashboard</Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/pre-save/new")}>
            <Sparkles className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total Campaigns" value={metrics.length} delta={metrics.length ? 8 : 0} comparison="campaign library" icon={Link2} accent="pink" />
          <KpiCard label="Total Clicks" value={totalClicks} delta={totalClicks ? 11 : 0} comparison="smart link traffic" icon={Search} accent="blue" />
          <KpiCard label="Total Saves" value={totalSaves} delta={totalSaves ? 13 : 0} comparison="listener intent" icon={Sparkles} accent="green" />
          <KpiCard label="Conversion Rate" value={`${conversionRate}%`} delta={conversionRate ? 6 : 0} comparison="saves / clicks" icon={Sparkles} accent="teal" />
        </section>

        <GlassCard className="p-5">
          <SectionHeader
            title="Campaign list page"
            description="Browse every pre-save campaign, check its status, and open the smart link."
          />
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-xl bg-white/80 pl-9" placeholder="Search campaigns or releases" />
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={statusFilter === status ? "hero" : "outline"}
                  className="rounded-full"
                  onClick={() => setStatusFilter(status)}
                >
                  {status === "all" ? "All" : status}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <SkeletonCard className="min-h-[360px]" />
          ) : filtered.length === 0 ? (
            <EmptyList onCreate={() => navigate("/dashboard/pre-save/new")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Saves</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ campaign, clicks, saves, conversionRate }) => {
                  const release = releaseMap.get(campaign.release_id);
                  const smartLink = getPreSaveLink(campaign.smart_link_slug);
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div className="max-w-[280px]">
                          <p className="font-semibold text-slate-950">{campaign.campaign_name}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{smartLink}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-950">{release?.title || "Release"}</p>
                          <p className="text-xs text-slate-500">{release?.primary_artist || "Artist"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={badgeTone(campaign.status)}>{campaign.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{clicks}</TableCell>
                      <TableCell className="text-right font-medium">{saves}</TableCell>
                      <TableCell className="text-right font-medium">{conversionRate}%</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full bg-white/75"
                            onClick={async () => {
                              await navigator.clipboard.writeText(smartLink);
                              toast.success("Smart link copied.");
                            }}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate(`/pre-save/${campaign.smart_link_slug}`)}>
                            Open
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </GlassCard>
      </div>
    </DashboardShell>
  );
}

function EmptyList({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <Link2 className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">No campaigns found</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Start with a new pre-save campaign to populate the list and tracking metrics.</p>
      <Button variant="hero" className="mt-5 rounded-xl" onClick={onCreate}>
        <Sparkles className="mr-2 h-4 w-4" /> Create campaign
      </Button>
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
