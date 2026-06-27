import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { BarChart3, Film, Library, Loader2, Megaphone, Upload } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";
import {
  PROMO_ASSET_TYPES,
  promoAssetLabel,
  readVideoMeta,
  validatePromoVideoMeta,
  type PromoAssetType,
  type PromoVideoMeta,
} from "@/lib/validation/promoAssets";

type PromoAsset = any;
type PromoAssetJob = any;
type PlatformValidation = any;
type Release = { id: string; title: string; primary_artist_name?: string; primary_artist?: string };
type Track = { id: string; release_id: string; title: string; track_number: number };

const client = supabase as any;

export default function PromoAssetsStudio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [assets, setAssets] = useState<PromoAsset[]>([]);
  const [jobsByAsset, setJobsByAsset] = useState<Record<string, PromoAssetJob>>({});
  const [compatibilityByAsset, setCompatibilityByAsset] = useState<Record<string, PlatformValidation[]>>({});
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, { video?: string; thumb?: string }>>({});
  const [analytics, setAnalytics] = useState({ total_assets: 0, approved_assets: 0, pending_assets: 0, rejected_assets: 0, dsp_delivered_assets: 0 });
  const [assetType, setAssetType] = useState<PromoAssetType>("spotify_canvas");
  const [releaseId, setReleaseId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<PromoVideoMeta | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    if (!user) return;
    const [assetResult, releaseResult, trackResult, summaryResult] = await Promise.all([
      client.from("promo_assets").select("*").order("created_at", { ascending: false }),
      client.from("music_releases").select("id,title,primary_artist_name").eq("owner_user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("tracks").select("id,release_id,title,track_number").eq("user_id", user.id).order("track_number"),
      client.rpc("promo_asset_analytics_summary"),
    ]);
    const rows = assetResult.data || [];
    setAssets(rows);
    setReleases(releaseResult.data || []);
    setTracks(trackResult.data || []);
    setAnalytics((summaryResult.data?.[0] || summaryResult.data || {}) as any);
    if (rows.length) {
      const assetIds = rows.map((asset: PromoAsset) => asset.id);
      const [{ data: jobs }, { data: compatibility }] = await Promise.all([
        client
          .from("promo_asset_jobs")
          .select("*")
          .in("promo_asset_id", assetIds)
          .order("created_at", { ascending: false }),
        client
          .from("promo_asset_platform_validation")
          .select("*")
          .in("promo_asset_id", assetIds)
          .order("created_at", { ascending: false }),
      ]);
      setJobsByAsset(indexLatestJobs(jobs || []));
      setCompatibilityByAsset(groupCompatibility(compatibility || []));
    } else {
      setJobsByAsset({});
      setCompatibilityByAsset({});
    }

    const signed: Record<string, { video?: string; thumb?: string }> = {};
    await Promise.all(rows.map(async (asset: PromoAsset) => {
      const [video, thumb] = await Promise.all([
        asset.file_url ? supabase.storage.from("promo-assets").createSignedUrl(asset.file_url, 3600) : Promise.resolve({ data: null }),
        asset.thumbnail_url ? supabase.storage.from("promo-assets").createSignedUrl(asset.thumbnail_url, 3600) : Promise.resolve({ data: null }),
      ]);
      signed[asset.id] = { video: video.data?.signedUrl, thumb: thumb.data?.signedUrl };
    }));
    setSignedUrls(signed);
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel("promo-assets-processing")
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_assets" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_asset_jobs" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_asset_platform_validation" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const releaseMap = useMemo(() => new Map(releases.map((release) => [release.id, release])), [releases]);
  const trackMap = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const filteredTracks = tracks.filter((track) => !releaseId || track.release_id === releaseId);

  const handleFile = async (nextFile: File) => {
    setFile(nextFile);
    setErrors([]);
    setMeta(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(nextFile));
    try {
      const videoMeta = await readVideoMeta(nextFile);
      setMeta(videoMeta);
      setErrors(validatePromoVideoMeta(assetType, nextFile, videoMeta));
      setTitle((value) => value || nextFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " "));
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Video could not be read."]);
    }
  };

  const submit = async () => {
    if (!user || !file || !meta || !title.trim()) return;
    const validationErrors = validatePromoVideoMeta(assetType, file, meta);
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }
    setUploading(true);
    try {
      const timestamp = Date.now();
      const safe = sanitize(file.name);
      const videoPath = `${user.id}/videos/${timestamp}-${safe}`;
      const upload = await supabase.storage.from("promo-assets").upload(videoPath, file, {
        upsert: false,
        contentType: file.type,
      });
      if (upload.error) throw upload.error;

      const { error } = await client.from("promo_assets").insert({
        user_id: user.id,
        release_id: releaseId || null,
        track_id: trackId || null,
        asset_type: assetType,
        title: title.trim(),
        file_url: videoPath,
        file_size: file.size,
        mime_type: file.type,
        validation_status: "processing",
        approval_status: "processing",
        dsp_status: "not_submitted",
        validation_details: {
          client_precheck: "passed",
          duration_seconds: meta.duration_seconds,
          width: meta.width,
          height: meta.height,
          fps: meta.fps,
        },
        provider_name: "internal_upload",
        sync_status: "not_synced",
      });
      if (error) throw error;
      toast.success("Promo asset uploaded and queued for processing.");
      resetForm();
      await load();
    } catch (error: any) {
      toast.error(error.message || "Promo asset upload failed");
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setMeta(null);
    setErrors([]);
    setTitle("");
    setTrackId("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  return (
    <DashboardShell
      title="Promo Assets Studio"
      eyebrow="Media workspace"
      actions={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard")}><Megaphone className="w-4 h-4 mr-2" />Dashboard</Button>}
    >
        <div className="space-y-6">

          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard label="Total Assets" value={analytics.total_assets || 0} delta={10} comparison="asset library" icon={Film} accent="pink" />
            <KpiCard label="Approved" value={analytics.approved_assets || 0} delta={12} comparison="ready to use" icon={Upload} accent="green" />
            <KpiCard label="Pending" value={analytics.pending_assets || 0} delta={analytics.pending_assets ? -2 : 0} comparison="in review" icon={Loader2} accent="amber" />
            <KpiCard label="Rejected" value={analytics.rejected_assets || 0} delta={analytics.rejected_assets ? -5 : 0} comparison="needs fixes" icon={BarChart3} accent="slate" />
            <KpiCard label="DSP Delivered" value={analytics.dsp_delivered_assets || 0} delta={8} comparison="platform synced" icon={Megaphone} accent="blue" />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
            <GlassCard className="p-4 space-y-4">
              <SectionHeader title="Upload Asset" description="Create platform-ready Canvas, Shorts, Reels, TikTok, and motion artwork variants." />
              <div className="grid gap-3">
                <div>
                  <Label>Asset Type</Label>
                  <Select value={assetType} onValueChange={(value: PromoAssetType) => {
                    setAssetType(value);
                    if (file && meta) setErrors(validatePromoVideoMeta(value, file, meta));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROMO_ASSET_TYPES.map((type) => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div>
                  <Label>Attach To Release</Label>
                  <Select value={releaseId || "none"} onValueChange={(value) => { setReleaseId(value === "none" ? "" : value); setTrackId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No release</SelectItem>
                      {releases.map((release) => <SelectItem key={release.id} value={release.id}>{release.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Attach To Track</Label>
                  <Select value={trackId || "none"} onValueChange={(value) => setTrackId(value === "none" ? "" : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No track</SelectItem>
                      {filteredTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.track_number}. {track.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Video File (MP4/MOV, max 100 MB)</Label>
                  <Input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
                </div>
              </div>

              {errors.length > 0 && (
                <Alert variant="destructive"><AlertDescription>{errors.join(" ")}</AlertDescription></Alert>
              )}

              <Button variant="hero" disabled={!file || !meta || errors.length > 0 || uploading || !title.trim()} onClick={submit}>
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : <><Upload className="w-4 h-4 mr-2" />Submit For Review</>}
              </Button>
            </GlassCard>

            <GlassCard className="p-4 space-y-4">
              <SectionHeader title="Preview Player" description="Review crop, duration, file weight, and compatibility before submission." />
              {previewUrl ? (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,320px)_1fr] gap-4">
                  <video controls src={previewUrl} className="w-full aspect-[9/16] max-h-[420px] rounded border bg-black object-contain" />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Info label="Duration" value={meta ? `${meta.duration_seconds}s` : "Reading"} />
                    <Info label="Resolution" value={meta ? `${meta.width}x${meta.height}` : "Reading"} />
                    <Info label="FPS" value={meta?.fps ? `${meta.fps}` : "Measured by browser/server"} />
                    <Info label="File Size" value={file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "None"} />
                  </div>
                </div>
              ) : (
                <div className="min-h-[280px] rounded-2xl border border-dashed border-slate-200 bg-white/50 flex items-center justify-center text-muted-foreground">Select a video to preview.</div>
              )}
            </GlassCard>
          </section>

          <Tabs defaultValue="library">
            <TabsList className="rounded-xl bg-white/70 p-1 backdrop-blur">
              <TabsTrigger value="library">Asset Library</TabsTrigger>
              <TabsTrigger value="compatibility">Compatibility</TabsTrigger>
            </TabsList>
            <TabsContent value="library" className="mt-3">
              <GlassCard className="p-4">
                <SectionHeader title="Asset Library" description="Thumbnail previews, processing state, review status, and delivery metrics." />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thumbnail</TableHead>
                      <TableHead>Asset Type</TableHead>
                      <TableHead>Release</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead>Processing</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Analytics</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          {signedUrls[asset.id]?.thumb ? <img src={signedUrls[asset.id].thumb} alt="" className="w-16 h-20 rounded object-cover border" /> : <div className="w-16 h-20 rounded bg-muted" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{asset.title}</div>
                          <div className="text-xs text-muted-foreground">{promoAssetLabel(asset.asset_type)}</div>
                        </TableCell>
                        <TableCell>{releaseMap.get(asset.release_id)?.title || "None"}</TableCell>
                        <TableCell>{trackMap.get(asset.track_id)?.title || "None"}</TableCell>
                        <TableCell><ProcessingStatus job={jobsByAsset[asset.id]} /></TableCell>
                        <TableCell><StatusBadge status={asset.approval_status} /></TableCell>
                        <TableCell>
                          <div className="text-xs">Views {Number(asset.views || 0).toLocaleString()}</div>
                          <div className="text-xs">Clicks {Number(asset.clicks || 0).toLocaleString()}</div>
                          <div className="text-xs capitalize">DSP {String(asset.dsp_status || "").replace(/_/g, " ")}</div>
                        </TableCell>
                        <TableCell>{new Date(asset.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {assets.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-10"><EmptyState title="No promo assets" description="Upload a video asset to generate platform compatibility results and processing status." actionLabel="Upload asset" onAction={() => null} icon={Library} /></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </GlassCard>
            </TabsContent>
            <TabsContent value="compatibility" className="mt-3">
              <GlassCard className="p-4">
                <SectionHeader title="Platform Compatibility" description="Compatibility scores for Spotify Canvas, Apple Motion, YouTube Shorts, TikTok, and Reels." />
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <div key={asset.id} className="rounded border p-3">
                      <div className="font-medium mb-2">{asset.title}</div>
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                        {platformOrder.map((platform) => (
                          <CompatibilityCell key={platform} result={(compatibilityByAsset[asset.id] || []).find((row) => row.platform === platform)} platform={platform} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {assets.length === 0 && <EmptyState title="No compatibility results" description="Upload a promo asset to see platform-specific pass, warning, and fail checks." actionLabel="Upload asset" onAction={() => null} icon={Film} />}
                </div>
              </GlassCard>
            </TabsContent>
          </Tabs>
        </div>
    </DashboardShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4 rounded-2xl border-white/75 bg-white/78 shadow-xl shadow-slate-950/[0.06] backdrop-blur-2xl"><div className="flex items-center gap-2 text-xs text-muted-foreground"><BarChart3 className="w-3 h-3" />{label}</div><p className="text-2xl font-bold">{value}</p></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = String(status || "draft").replace(/_/g, " ");
  const variant = status === "rejected" ? "destructive" : "outline";
  return <Badge variant={variant} className="capitalize">{normalized}</Badge>;
}

function ProcessingStatus({ job }: { job?: PromoAssetJob }) {
  if (!job) return <span className="text-xs text-muted-foreground">Queued</span>;
  const progress = Number(job.progress || 0);
  const label = job.status === "completed" ? "Completed" : job.status === "failed" ? "Failed" : "Processing";
  return (
    <div className="min-w-[130px] space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="capitalize">{label}</span>
        <span>{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      {job.error_message && <div className="text-xs text-destructive line-clamp-2">{job.error_message}</div>}
    </div>
  );
}

const platformOrder = ["spotify_canvas", "apple_motion_artwork", "youtube_shorts", "tiktok_preview", "instagram_reels"];

function CompatibilityCell({ result, platform }: { result?: PlatformValidation; platform: string }) {
  const status = result?.status || "pending";
  const reasons = [
    ...(result?.validation_details?.reasons || []),
    ...(result?.validation_details?.warnings || []),
  ];
  return (
    <div className="rounded border p-2 min-h-[116px]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">{platformLabel(platform)}</div>
        <CompatibilityBadge status={status} />
      </div>
      <div className="text-xs text-muted-foreground mt-1">Score {result?.score ?? "-"}</div>
      <div className="text-xs mt-2 space-y-1">
        {reasons.length ? reasons.slice(0, 3).map((reason: string) => <div key={reason}>{reason}</div>) : <div className="text-muted-foreground">{result ? "Fully compatible." : "Awaiting optimized video."}</div>}
      </div>
    </div>
  );
}

function CompatibilityBadge({ status }: { status: string }) {
  if (status === "pass") return <Badge className="bg-green-600 hover:bg-green-600">PASS</Badge>;
  if (status === "fail") return <Badge variant="destructive">FAIL</Badge>;
  if (status === "warning") return <Badge className="bg-amber-500 hover:bg-amber-500">WARNING</Badge>;
  return <Badge variant="outline">PENDING</Badge>;
}

function indexLatestJobs(rows: PromoAssetJob[]) {
  return rows.reduce<Record<string, PromoAssetJob>>((acc, row) => {
    if (!acc[row.promo_asset_id]) acc[row.promo_asset_id] = row;
    return acc;
  }, {});
}

function groupCompatibility(rows: PlatformValidation[]) {
  return rows.reduce<Record<string, PlatformValidation[]>>((acc, row) => {
    acc[row.promo_asset_id] = acc[row.promo_asset_id] || [];
    acc[row.promo_asset_id].push(row);
    return acc;
  }, {});
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    spotify_canvas: "Spotify Canvas",
    apple_motion_artwork: "Apple Motion",
    youtube_shorts: "YouTube Shorts",
    tiktok_preview: "TikTok Preview",
    instagram_reels: "Instagram Reels",
  };
  return labels[platform] || platform;
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 140);
}
