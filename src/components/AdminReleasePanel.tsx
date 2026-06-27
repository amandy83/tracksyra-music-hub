import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, ClipboardCheck, XCircle, Eye } from "lucide-react";
import { DSP_PLATFORMS, type DspKey } from "@/lib/validation/platforms";

const DELIVERY_STATUSES = ["pending", "processing", "delivered", "live", "rejected"] as const;
const RELEASE_STATUSES = ["uploaded", "validating", "validation_failed", "validation_passed", "under_review", "approved", "sent_to_stores", "processing", "live", "rejected"] as const;

type Release = any;
type Delivery = { id: string; platform: DspKey; status: string; live_url: string | null };

export default function AdminReleasePanel() {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Record<string, any[]>>({});
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [validations, setValidations] = useState<Record<string, any[]>>({});
  const [duplicates, setDuplicates] = useState<Record<string, any[]>>({});
  const [copyrightFlags, setCopyrightFlags] = useState<Record<string, any[]>>({});
  const [viewing, setViewing] = useState<Release | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    const { data: rels } = await supabase.from("releases").select("*").order("created_at", { ascending: false });
    setReleases(rels || []);
    if (!rels?.length) return;

    const ids = rels.map((release) => release.id);
    const [{ data: trks }, { data: dels }, { data: vals }, { data: dups }, { data: flags }] = await Promise.all([
      supabase.from("tracks").select("*").in("release_id", ids),
      supabase.from("platform_deliveries").select("*").in("release_id", ids),
      (supabase as any).from("media_validation_results").select("*").in("release_id", ids).order("created_at", { ascending: false }),
      (supabase as any).from("release_duplicates").select("*").in("release_id", ids).order("created_at", { ascending: false }),
      (supabase as any).from("copyright_flags").select("*").in("release_id", ids).order("created_at", { ascending: false }),
    ]);

    const tMap: Record<string, any[]> = {};
    (trks || []).forEach((track) => { (tMap[track.release_id] ||= []).push(track); });
    const dMap: Record<string, Delivery[]> = {};
    (dels || []).forEach((delivery: any) => { (dMap[delivery.release_id] ||= []).push(delivery); });
    const vMap: Record<string, any[]> = {};
    (vals || []).forEach((validation: any) => { (vMap[validation.release_id] ||= []).push(validation); });
    const dupMap: Record<string, any[]> = {};
    (dups || []).forEach((duplicate: any) => { (dupMap[duplicate.release_id] ||= []).push(duplicate); });
    const flagMap: Record<string, any[]> = {};
    (flags || []).forEach((flag: any) => { (flagMap[flag.release_id] ||= []).push(flag); });

    for (const id of Object.keys(tMap)) {
      tMap[id] = await Promise.all(tMap[id].map(async (track) => {
        if (track.audio_url && !track.audio_url.startsWith("http")) {
          const { data } = await supabase.storage.from("audio").createSignedUrl(track.audio_url, 3600);
          return { ...track, audio_url: data?.signedUrl || track.audio_url };
        }
        return track;
      }));
    }

    setTracks(tMap);
    setDeliveries(dMap);
    setValidations(vMap);
    setDuplicates(dupMap);
    setCopyrightFlags(flagMap);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-releases")
      .on("postgres_changes", { event: "*", schema: "public", table: "releases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "media_validation_results" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "release_duplicates" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "copyright_flags" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_deliveries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setReleaseStatus = async (id: string, status: string, rejection_reason?: string | null) => {
    const { error } = await supabase.from("releases").update({ status: status as any, rejection_reason: rejection_reason ?? null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Release ${status.replace(/_/g, " ")}`);
    setViewing(null);
    setReason("");
  };

  const updateDelivery = async (id: string, patch: Partial<Delivery>) => {
    const { error } = await supabase.from("platform_deliveries").update({
      ...patch,
      delivered_at: patch.status === "live" || patch.status === "delivered" ? new Date().toISOString() : null,
    } as any).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Delivery updated");
  };

  return (
    <div className="space-y-3">
      {releases.length === 0 && <p className="text-muted-foreground">No releases yet.</p>}
      {releases.map((release) => {
        const firstTrack = tracks[release.id]?.[0];
        return (
          <Card key={release.id} className="p-4">
            <div className="flex flex-wrap gap-3 items-start">
              {release.cover_art_url && <img src={release.cover_art_url} alt="" className="w-20 h-20 rounded object-cover" />}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{release.title}</span>
                  <Badge variant="outline" className="capitalize">{release.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{release.primary_artist}</p>
                {firstTrack && (
                  <p className="text-xs text-muted-foreground">
                    {firstTrack.audio_format?.toUpperCase()} - {firstTrack.bitrate_kbps}kbps - {firstTrack.duration_sec}s - ISRC {firstTrack.isrc || "none"}
                  </p>
                )}
                {firstTrack?.audio_url && <audio controls className="mt-2 h-8" src={firstTrack.audio_url} />}
              </div>
              <div className="min-w-[160px] rounded border p-2 text-xs">
                <p className="text-muted-foreground">Validation score</p>
                <p className="text-lg font-bold">{validationScore(validations[release.id] || [])}%</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(duplicates[release.id] || []).length > 0 && <Badge variant="outline" className="border-amber-300 text-amber-700">Duplicates {(duplicates[release.id] || []).length}</Badge>}
                  {(copyrightFlags[release.id] || []).length > 0 && <Badge variant="outline" className="border-amber-300 text-amber-700">Copyright {(copyrightFlags[release.id] || []).length}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setViewing(release)}><Eye className="w-4 h-4 mr-1" />Review</Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/admin/review-queue")}><ClipboardCheck className="w-4 h-4 mr-1" />Queue</Button>
                {release.status !== "rejected" && (
                  <Button size="sm" variant="destructive" onClick={() => setViewing(release)}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                )}
              </div>
            </div>

            <ValidationAdminSummary validations={validations[release.id] || []} duplicates={duplicates[release.id] || []} flags={copyrightFlags[release.id] || []} />

            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Platform deliveries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {DSP_PLATFORMS.map((platform) => {
                  const delivery = deliveries[release.id]?.find((item) => item.platform === platform.key);
                  if (!delivery) return null;
                  return (
                    <div key={delivery.id} className="flex items-center gap-2 p-2 border rounded text-xs">
                      <span className="w-24 truncate">{platform.label}</span>
                      <Select value={delivery.status} onValueChange={(value) => updateDelivery(delivery.id, { status: value as any })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{DELIVERY_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input
                        defaultValue={delivery.live_url || ""}
                        placeholder="Live URL"
                        className="h-7 text-xs"
                        onBlur={(event) => event.target.value !== (delivery.live_url || "") && updateDelivery(delivery.id, { live_url: event.target.value || null })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}

      <Dialog open={!!viewing} onOpenChange={(value) => { if (!value) { setViewing(null); setReason(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.title}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Set status:</span></div>
              <div className="flex flex-wrap gap-2">
                {RELEASE_STATUSES.filter((status) => status !== "approved").map((status) => (
                  <Button key={status} size="sm" variant={viewing.status === status ? "default" : "outline"} onClick={() => setReleaseStatus(viewing.id, status, status === "rejected" ? reason || null : null)}>
                    {status.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Rejection reason (used if you set status = rejected)</label>
                <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
              <ValidationAdminSummary validations={validations[viewing.id] || []} duplicates={duplicates[viewing.id] || []} flags={copyrightFlags[viewing.id] || []} />
              <p className="text-xs text-muted-foreground">Status changes auto-trigger artist email and timeline entries.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function validationScore(items: any[]) {
  if (!items.length) return 0;
  const latestByType = new Map<string, any>();
  items.forEach((item) => {
    if (!latestByType.has(item.validation_type)) latestByType.set(item.validation_type, item);
  });
  const values = [...latestByType.values()];
  const passed = values.filter((item) => item.status === "passed").length;
  const warnings = values.filter((item) => item.status === "warning").length * 0.5;
  return Math.round(((passed + warnings) / values.length) * 100);
}

function ValidationAdminSummary({ validations, duplicates, flags }: { validations: any[]; duplicates: any[]; flags: any[] }) {
  if (!validations.length && !duplicates.length && !flags.length) return null;
  return (
    <div className="mt-3 rounded border p-3 text-xs">
      <p className="font-medium mb-2">Validation history</p>
      <div className="grid gap-1">
        {validations.slice(0, 8).map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2">
            <span className="capitalize">{item.validation_type.replace(/_/g, " ")}</span>
            <Badge variant={item.status === "failed" ? "destructive" : "outline"} className="capitalize">{item.status}</Badge>
          </div>
        ))}
      </div>
      {duplicates.length > 0 && (
        <div className="mt-3">
          <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-600" />Duplicate warnings</p>
          {duplicates.slice(0, 4).map((item) => <p key={item.id} className="text-muted-foreground">{item.duplicate_type.replace(/_/g, " ")} - {item.severity}</p>)}
        </div>
      )}
      {flags.length > 0 && (
        <div className="mt-3">
          <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-600" />Copyright warnings</p>
          {flags.slice(0, 4).map((item) => <p key={item.id} className="text-muted-foreground">{item.reason || "Copyright metadata requires review."}</p>)}
        </div>
      )}
    </div>
  );
}
