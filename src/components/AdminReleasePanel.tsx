import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Eye } from "lucide-react";
import { DSP_PLATFORMS, type DspKey } from "@/lib/validation/platforms";

const DELIVERY_STATUSES = ["pending","processing","delivered","live","rejected"] as const;
const RELEASE_STATUSES = ["uploaded","under_review","approved","sent_to_stores","processing","live","rejected"] as const;

type Release = any;
type Delivery = { id: string; platform: DspKey; status: string; live_url: string | null };

export default function AdminReleasePanel() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Record<string, any[]>>({});
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [viewing, setViewing] = useState<Release | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    const { data: rels } = await supabase.from("releases").select("*").order("created_at", { ascending: false });
    setReleases(rels || []);
    if (!rels?.length) return;
    const ids = rels.map((r) => r.id);
    const [{ data: trks }, { data: dels }] = await Promise.all([
      supabase.from("tracks").select("*").in("release_id", ids),
      supabase.from("platform_deliveries").select("*").in("release_id", ids),
    ]);
    const tMap: Record<string, any[]> = {};
    (trks || []).forEach((t) => { (tMap[t.release_id] ||= []).push(t); });
    const dMap: Record<string, Delivery[]> = {};
    (dels || []).forEach((d: any) => { (dMap[d.release_id] ||= []).push(d); });
    // signed URLs for audio playback
    for (const id of Object.keys(tMap)) {
      tMap[id] = await Promise.all(tMap[id].map(async (t) => {
        if (t.audio_url && !t.audio_url.startsWith("http")) {
          const { data } = await supabase.storage.from("audio").createSignedUrl(t.audio_url, 3600);
          return { ...t, audio_url: data?.signedUrl || t.audio_url };
        }
        return t;
      }));
    }
    setTracks(tMap);
    setDeliveries(dMap);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("admin-releases")
      .on("postgres_changes", { event: "*", schema: "public", table: "releases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_deliveries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setReleaseStatus = async (id: string, status: string, rejection_reason?: string | null) => {
    const { error } = await supabase.from("releases").update({ status, rejection_reason: rejection_reason ?? null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Release ${status.replace(/_/g, " ")}`);
    setViewing(null); setReason("");
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
      {releases.map((r) => {
        const trk = tracks[r.id]?.[0];
        return (
          <Card key={r.id} className="p-4">
            <div className="flex flex-wrap gap-3 items-start">
              {r.cover_art_url && <img src={r.cover_art_url} alt="" className="w-20 h-20 rounded object-cover" />}
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.title}</span>
                  <Badge variant="outline" className="capitalize">{r.status.replace(/_/g, " ")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{r.primary_artist}</p>
                {trk && <p className="text-xs text-muted-foreground">{trk.audio_format?.toUpperCase()} · {trk.bitrate_kbps}kbps · {trk.duration_sec}s · ISRC {trk.isrc || "—"}</p>}
                {trk?.audio_url && <audio controls className="mt-2 h-8" src={trk.audio_url} />}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setViewing(r)}><Eye className="w-4 h-4 mr-1" />Review</Button>
                {r.status !== "approved" && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setReleaseStatus(r.id, "approved")}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                )}
                {r.status !== "rejected" && (
                  <Button size="sm" variant="destructive" onClick={() => { setViewing(r); }}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                )}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Platform deliveries</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {DSP_PLATFORMS.map((p) => {
                  const d = deliveries[r.id]?.find((x) => x.platform === p.key);
                  if (!d) return null;
                  return (
                    <div key={d.id} className="flex items-center gap-2 p-2 border rounded text-xs">
                      <span className="w-24 truncate">{p.label}</span>
                      <Select value={d.status} onValueChange={(v) => updateDelivery(d.id, { status: v as any })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{DELIVERY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input
                        defaultValue={d.live_url || ""}
                        placeholder="Live URL"
                        className="h-7 text-xs"
                        onBlur={(e) => e.target.value !== (d.live_url || "") && updateDelivery(d.id, { live_url: e.target.value || null })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}

      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) { setViewing(null); setReason(""); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{viewing?.title}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Set status:</span></div>
              <div className="flex flex-wrap gap-2">
                {RELEASE_STATUSES.map((s) => (
                  <Button key={s} size="sm" variant={viewing.status === s ? "default" : "outline"} onClick={() => setReleaseStatus(viewing.id, s, s === "rejected" ? reason || null : null)}>
                    {s.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Rejection reason (used if you set status = rejected)</label>
                <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Status changes auto-trigger artist email + timeline entry.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
