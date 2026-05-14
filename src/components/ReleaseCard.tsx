import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, ExternalLink, AlertCircle } from "lucide-react";
import { DSP_PLATFORMS, DELIVERY_STATUS_COLOR, RELEASE_STAGES, type DspKey } from "@/lib/validation/platforms";

type Delivery = { platform: DspKey; status: string; live_url: string | null };
type Release = {
  id: string; title: string; primary_artist: string; status: string;
  cover_art_url: string | null; rejection_reason: string | null;
  platform_deliveries?: Delivery[];
};

export default function ReleaseCard({ release, onResubmit }: { release: Release; onResubmit?: (r: Release) => void }) {
  const currentStageIdx = Math.max(0, RELEASE_STAGES.findIndex((s) => s.key === release.status));
  const isRejected = release.status === "rejected";

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-4 border-b">
        <div className="w-20 h-20 rounded bg-pink-100 flex-shrink-0 overflow-hidden">
          {release.cover_art_url
            ? <img src={release.cover_art_url} alt={release.title} loading="lazy" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8 text-pink-400" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{release.title}</h3>
          <p className="text-sm text-muted-foreground truncate">{release.primary_artist}</p>
          <Badge className="mt-1 capitalize" variant={isRejected ? "destructive" : "secondary"}>
            {release.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {!isRejected && (
        <div className="p-4 border-b">
          <div className="flex items-center justify-between gap-1">
            {RELEASE_STAGES.map((s, i) => (
              <div key={s.key} className="flex-1 flex flex-col items-center text-center">
                <div className={`w-3 h-3 rounded-full ${i <= currentStageIdx ? "bg-pink-600" : "bg-pink-100"}`} />
                <span className={`text-[10px] mt-1 ${i <= currentStageIdx ? "text-pink-700 font-medium" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isRejected && release.rejection_reason && (
        <div className="p-3 bg-red-50 border-b border-red-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">Needs changes</p>
            <p className="text-xs text-red-800">{release.rejection_reason}</p>
          </div>
          {onResubmit && <Button size="sm" variant="outline" onClick={() => onResubmit(release)}>Edit</Button>}
        </div>
      )}

      <div className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Platform delivery</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DSP_PLATFORMS.map((p) => {
            const d = release.platform_deliveries?.find((x) => x.platform === p.key);
            const status = d?.status || "pending";
            return (
              <div key={p.key} className="text-xs flex items-center justify-between gap-1 p-2 rounded border bg-background">
                <span className="truncate">{p.label}</span>
                {d?.live_url
                  ? <a href={d.live_url} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />Open</a>
                  : <Badge variant="outline" className={`capitalize ${DELIVERY_STATUS_COLOR[status]}`}>{status}</Badge>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
