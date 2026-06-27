import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Copy, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard, SectionHeader, SkeletonCard } from "@/components/dashboard/DashboardPrimitives";
import { buildCampaignCenterMetrics, loadCampaignCenterWorkspace, type CampaignMetricRow, type CampaignRow } from "./campaignCenterData";

const statusFilters = ["all", "draft", "active", "paused", "completed"] as const;

export default function CampaignCenterList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [metrics, setMetrics] = useState<CampaignMetricRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statusFilters)[number]>("all");

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const workspace = await loadCampaignCenterWorkspace(user.id);
    setCampaigns(workspace.campaigns);
    setMetrics(workspace.metrics);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const campaignMetrics = useMemo(() => buildCampaignCenterMetrics(campaigns, metrics), [campaigns, metrics]);
  const filtered = useMemo(() => {
    return campaignMetrics.filter(({ campaign }) => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const haystack = `${campaign.campaign_name} ${campaign.campaign_type} ${campaign.notes || ""}`.toLowerCase();
      const matchesSearch = search.trim() ? haystack.includes(search.trim().toLowerCase()) : true;
      return matchesStatus && matchesSearch;
    });
  }, [campaignMetrics, search, statusFilter]);

  const stats = useMemo(() => ({
    totalCampaigns: campaignMetrics.length,
    activeCampaigns: campaignMetrics.filter(({ campaign }) => campaign.status === "active").length,
    totalReach: metrics.reduce((sum, item) => sum + Number(item.total_reach || 0), 0),
    totalEngagement: metrics.reduce((sum, item) => sum + Number(item.total_engagement || 0), 0),
  }), [campaignMetrics, metrics]);

  return (
    <DashboardShell
      title="Campaign List"
      eyebrow="Campaign center"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/campaign-center")}>Dashboard</Button>
          <Button variant="hero" className="rounded-xl" onClick={() => navigate("/dashboard/campaign-center/new")}>
            <Sparkles className="mr-2 h-4 w-4" /> New Campaign
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Active Campaigns" value={stats.activeCampaigns} delta={stats.activeCampaigns ? 8 : 0} comparison="currently running" icon={BarChart3} accent="green" />
          <KpiCard label="Total Campaigns" value={stats.totalCampaigns} delta={stats.totalCampaigns ? 10 : 0} comparison="campaign library" icon={BarChart3} accent="blue" />
          <KpiCard label="Total Reach" value={formatCount(stats.totalReach)} delta={stats.totalReach ? 12 : 0} comparison="aggregated delivery reach" icon={BarChart3} accent="pink" />
          <KpiCard label="Total Engagement" value={formatCount(stats.totalEngagement)} delta={stats.totalEngagement ? 14 : 0} comparison="aggregated engagement" icon={BarChart3} accent="teal" />
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Campaign List Page" description="Browse campaigns, inspect status, and open the detail page for editing or pausing." />
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-xl bg-white/80 pl-9" placeholder="Search campaigns" />
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
            <EmptyList onCreate={() => navigate("/dashboard/campaign-center/new")} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Reach</TableHead>
                  <TableHead className="text-right">Engagement</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ campaign, totalReach, totalEngagement }) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-slate-950">{campaign.campaign_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{campaign.notes || "No notes"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{campaign.campaign_type.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusTone(campaign.status)}>{campaign.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(campaign.budget)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCount(totalReach)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCount(totalEngagement)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="rounded-full bg-white/75" onClick={async () => {
                          await navigator.clipboard.writeText(`${window.location.origin}/dashboard/campaign-center/${campaign.id}`);
                          toast.success("Campaign link copied.");
                        }}>
                          <Copy className="mr-2 h-3.5 w-3.5" /> Copy
                        </Button>
                        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate(`/dashboard/campaign-center/${campaign.id}`)}>
                          Open
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
        <BarChart3 className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">No campaigns found</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Create a campaign to populate the list and metrics.</p>
      <Button variant="hero" className="mt-5 rounded-xl" onClick={onCreate}>
        <Sparkles className="mr-2 h-4 w-4" /> Create campaign
      </Button>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "active") return "bg-emerald-50 text-emerald-700";
  if (status === "paused") return "bg-amber-50 text-amber-700";
  if (status === "completed") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
