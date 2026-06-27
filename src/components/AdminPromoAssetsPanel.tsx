import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { promoAssetLabel } from "@/lib/validation/promoAssets";

type PromoAsset = any;
type ProcessingLog = any;
type CompatibilityMatrixRow = any;
const client = supabase as any;
const tabs = [
  { key: "under_review", label: "Pending Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "live", label: "Live" },
] as const;

export default function AdminPromoAssetsPanel() {
  const [assets, setAssets] = useState<PromoAsset[]>([]);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [compatibilityRows, setCompatibilityRows] = useState<CompatibilityMatrixRow[]>([]);
  const [compatibilityFilter, setCompatibilityFilter] = useState("all");
  const [releases, setReleases] = useState<Record<string, any>>({});
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [signed, setSigned] = useState<Record<string, { video?: string; thumb?: string }>>({});
  const [reviewing, setReviewing] = useState<PromoAsset | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    const [{ data }, { data: logs }, { data: matrix }] = await Promise.all([
      client.from("promo_assets").select("*").order("created_at", { ascending: false }),
      client.from("promo_asset_processing_logs").select("*").order("created_at", { ascending: false }).limit(100),
      client.from("promo_asset_compatibility_matrix").select("*").order("validated_at", { ascending: false, nullsFirst: false }).limit(200),
    ]);
    const rows = data || [];
    setAssets(rows);
    setProcessingLogs(logs || []);
    setCompatibilityRows(matrix || []);
    const releaseIds = [...new Set(rows.map((asset: PromoAsset) => asset.release_id).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map((asset: PromoAsset) => asset.user_id).filter(Boolean))] as string[];
    const [{ data: releaseRows }, { data: profileRows }] = await Promise.all([
      releaseIds.length ? supabase.from("releases").select("id,title,primary_artist").in("id", releaseIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from("profiles").select("id,full_name,artist_name").in("id", userIds) : Promise.resolve({ data: [] }),
    ]);
    setReleases(indexById(releaseRows || []));
    setProfiles(indexById(profileRows || []));

    const nextSigned: Record<string, { video?: string; thumb?: string }> = {};
    await Promise.all(rows.map(async (asset: PromoAsset) => {
      const [video, thumb] = await Promise.all([
        asset.file_url ? supabase.storage.from("promo-assets").createSignedUrl(asset.file_url, 3600) : Promise.resolve({ data: null }),
        asset.thumbnail_url ? supabase.storage.from("promo-assets").createSignedUrl(asset.thumbnail_url, 3600) : Promise.resolve({ data: null }),
      ]);
      nextSigned[asset.id] = { video: video.data?.signedUrl, thumb: thumb.data?.signedUrl };
    }));
    setSigned(nextSigned);
  };

  useEffect(() => {
    load();
    const channel = supabase.channel("admin-promo-assets")
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_assets" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_asset_jobs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_asset_platform_validation" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const counts = useMemo(() => Object.fromEntries(tabs.map((tab) => [tab.key, assets.filter((asset) => normalizedStatus(asset) === tab.key).length])), [assets]);
  const filteredCompatibility = useMemo(() => compatibilityRows.filter((row) => {
    if (compatibilityFilter === "failed") return row.has_failures;
    if (compatibilityFilter === "warning") return row.has_warnings && !row.has_failures;
    if (compatibilityFilter === "approved") return row.approval_status === "approved";
    return true;
  }), [compatibilityRows, compatibilityFilter]);

  const review = async (asset: PromoAsset, action: "approve" | "reject" | "changes_requested") => {
    if ((action === "reject" || action === "changes_requested") && !reason.trim()) {
      toast.error("Reason is required.");
      return;
    }
    const { error } = await client.rpc("review_promo_asset", {
      p_asset_id: asset.id,
      p_action: action,
      p_reason: reason.trim() || "Approved for promo distribution.",
    });
    if (error) return toast.error(error.message);
    toast.success(`Promo asset ${action.replace("_", " ")}`);
    setReviewing(null);
    setReason("");
    load();
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="under_review">
        <TabsList className="flex-wrap h-auto">
          {tabs.map((tab) => <TabsTrigger key={tab.key} value={tab.key}>{tab.label} ({counts[tab.key] || 0})</TabsTrigger>)}
          <TabsTrigger value="compatibility-matrix">Compatibility Matrix</TabsTrigger>
          <TabsTrigger value="processing-logs">Processing Logs ({processingLogs.length})</TabsTrigger>
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {assets.filter((asset) => normalizedStatus(asset) === tab.key).map((asset) => (
                <Card key={asset.id} className="p-4">
                  <div className="grid grid-cols-[110px_1fr] gap-3">
                    {signed[asset.id]?.thumb ? <img src={signed[asset.id].thumb} alt="" className="w-full aspect-[9/16] rounded object-cover border" /> : <div className="aspect-[9/16] rounded bg-muted" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{asset.title}</h3>
                        <Badge variant="outline" className="capitalize">{String(asset.approval_status).replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{promoAssetLabel(asset.asset_type)}</p>
                      <p className="text-xs text-muted-foreground">Artist: {profiles[asset.user_id]?.artist_name || profiles[asset.user_id]?.full_name || asset.user_id}</p>
                      <p className="text-xs text-muted-foreground">Release: {releases[asset.release_id]?.title || "None"}</p>
                      <p className="text-xs text-muted-foreground">
                        Validation: {asset.validation_status} - {asset.width || 0}x{asset.height || 0} - {asset.duration_seconds || 0}s
                      </p>
                      <p className="text-xs text-muted-foreground">DSP: {String(asset.dsp_status || "not_submitted").replace(/_/g, " ")}</p>
                      {signed[asset.id]?.video && <video controls src={signed[asset.id].video} className="mt-2 w-full max-h-44 rounded bg-black" />}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setReviewing(asset)}>Review</Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
              {assets.filter((asset) => normalizedStatus(asset) === tab.key).length === 0 && <p className="text-muted-foreground">No promo assets in this queue.</p>}
            </div>
          </TabsContent>
        ))}
        <TabsContent value="compatibility-matrix" className="mt-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold">Compatibility Matrix</h3>
                <p className="text-sm text-muted-foreground">Platform validation from optimized video metadata.</p>
              </div>
              <Select value={compatibilityFilter} onValueChange={setCompatibilityFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assets</SelectItem>
                  <SelectItem value="failed">Failed assets</SelectItem>
                  <SelectItem value="warning">Warning assets</SelectItem>
                  <SelectItem value="approved">Approved assets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Artist</TableHead>
                  {platformOrder.map((platform) => <TableHead key={platform}>{platformLabel(platform)}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompatibility.map((row) => (
                  <TableRow key={row.promo_asset_id}>
                    <TableCell>
                      <div className="font-medium">{row.asset_title}</div>
                      <div className="text-xs text-muted-foreground capitalize">{String(row.approval_status || "").replace(/_/g, " ")}</div>
                    </TableCell>
                    <TableCell>{row.artist_name || shortId(row.artist_id)}</TableCell>
                    {platformOrder.map((platform) => <TableCell key={platform}><MatrixCell result={row.platform_results?.[platform]} /></TableCell>)}
                  </TableRow>
                ))}
                {filteredCompatibility.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No assets match this compatibility filter.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="processing-logs" className="mt-4">
          <Card className="p-4">
            <div className="mb-3">
              <h3 className="font-semibold">Promo Asset Processing Logs</h3>
              <p className="text-sm text-muted-foreground">Latest FFmpeg processing jobs and failures.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processingLogs.map((log) => (
                  <TableRow key={log.job_id}>
                    <TableCell className="font-mono text-xs">{shortId(log.job_id)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{log.asset_title || shortId(log.promo_asset_id)}</div>
                      <div className="text-xs text-muted-foreground">{log.progress || 0}%</div>
                    </TableCell>
                    <TableCell>{log.artist_name || shortId(log.artist_id)}</TableCell>
                    <TableCell><Badge variant={log.status === "failed" ? "destructive" : "outline"} className="capitalize">{log.status}</Badge></TableCell>
                    <TableCell className="max-w-[320px] text-xs text-muted-foreground">{log.error_message || "None"}</TableCell>
                  </TableRow>
                ))}
                {processingLogs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No processing jobs yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewing} onOpenChange={(open) => { if (!open) { setReviewing(null); setReason(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{reviewing?.title}</DialogTitle></DialogHeader>
          {reviewing && (
            <div className="space-y-3">
              {signed[reviewing.id]?.video && <video controls src={signed[reviewing.id].video} className="w-full max-h-[420px] rounded bg-black" />}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <Info label="Asset Type" value={promoAssetLabel(reviewing.asset_type)} />
                <Info label="Validation Result" value={`${reviewing.validation_status} ${reviewing.validation_details?.errors ? JSON.stringify(reviewing.validation_details.errors) : ""}`} />
                <Info label="Resolution" value={`${reviewing.width || 0}x${reviewing.height || 0}`} />
                <Info label="Duration" value={`${reviewing.duration_seconds || 0}s`} />
              </div>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Reason required for rejection or changes requested." />
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="secondary" onClick={() => review(reviewing, "changes_requested")}><Clock className="w-4 h-4 mr-1" />Request Changes</Button>
                <Button variant="destructive" onClick={() => review(reviewing, "reject")}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => review(reviewing, "approve")}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function normalizedStatus(asset: PromoAsset) {
  if (asset.approval_status === "processing" || asset.approval_status === "draft" || asset.approval_status === "changes_requested") return "under_review";
  return asset.approval_status;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

function indexById(rows: any[]) {
  return rows.reduce<Record<string, any>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

function shortId(value: string | null | undefined) {
  return value ? `${value.slice(0, 8)}...` : "None";
}

const platformOrder = ["spotify_canvas", "apple_motion_artwork", "youtube_shorts", "tiktok_preview", "instagram_reels"];

function MatrixCell({ result }: { result?: any }) {
  if (!result) return <Badge variant="outline">PENDING</Badge>;
  const status = String(result.status || "pending");
  if (status === "pass") return <Badge className="bg-green-600 hover:bg-green-600">PASS</Badge>;
  if (status === "fail") return <Badge variant="destructive" title={reasonTitle(result)}>FAIL</Badge>;
  if (status === "warning") return <Badge className="bg-amber-500 hover:bg-amber-500" title={reasonTitle(result)}>WARNING</Badge>;
  return <Badge variant="outline">PENDING</Badge>;
}

function reasonTitle(result: any) {
  return [...(result.details?.reasons || []), ...(result.details?.warnings || [])].join(" ");
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    spotify_canvas: "Spotify",
    apple_motion_artwork: "Apple",
    youtube_shorts: "YouTube",
    tiktok_preview: "TikTok",
    instagram_reels: "Instagram",
  };
  return labels[platform] || platform;
}
