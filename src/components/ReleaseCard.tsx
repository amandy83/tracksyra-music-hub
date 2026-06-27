import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, ExternalLink, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { DSP_PLATFORMS, DELIVERY_STATUS_COLOR, RELEASE_STAGES, type DspKey } from "@/lib/validation/platforms";

type Delivery = { platform: DspKey; status: string; live_url: string | null };
type ValidationResult = {
  id: string;
  validation_type: string;
  status: string;
  details: any;
  track_id?: string | null;
};
export type MusicRelease = {
  id: string; title: string; primary_artist_name: string; status: string;
  owner_user_id?: string | null;
  cover_url: string | null; rejection_reason?: string | null;
  genre?: string | null; type?: string | null;
  audio_files?: Array<{ trackId: string; title: string; trackNumber?: number | null }> | null;
  platform_deliveries?: Delivery[];
  validation_results?: ValidationResult[];
};

export default function ReleaseCard({ release, onResubmit }: { release: MusicRelease; onResubmit?: (r: MusicRelease) => void }) {
  const currentStageIdx = Math.max(0, RELEASE_STAGES.findIndex((s) => s.key === release.status));
  const isRejected = release.status === "rejected" || release.status === "validation_failed";
  const trackCount = release.audio_files?.length || 0;
  const validationSummary = summarizeValidation(release.validation_results || []);

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-4 border-b">
        <div className="w-20 h-20 rounded bg-pink-100 flex-shrink-0 overflow-hidden">
          {release.cover_url
            ? <img src={release.cover_url} alt={release.title} loading="lazy" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8 text-pink-400" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{release.title}</h3>
          <p className="text-sm text-muted-foreground truncate">{release.primary_artist_name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {release.type || "release"}{trackCount ? ` • ${trackCount} track${trackCount === 1 ? "" : "s"}` : ""}
          </p>
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

      {validationSummary.length > 0 && (
        <div className="p-4 border-b">
          <p className="text-xs font-medium text-muted-foreground mb-2">Validation Summary</p>
          <div className="grid gap-2">
            {validationSummary.map((item) => (
              <div key={item.type} className="flex items-start gap-2 rounded border p-2 text-xs">
                {item.status === "failed" ? <XCircle className="w-4 h-4 text-red-600 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />}
                <div className="min-w-0">
                  <p className="font-medium">{item.label}</p>
                  <p className={item.status === "failed" ? "text-red-700" : "text-muted-foreground"}>{item.reason}</p>
                </div>
              </div>
            ))}
          </div>
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

function summarizeValidation(results: ValidationResult[]) {
  const order = ["audio", "artwork", "metadata", "isrc", "copyright"] as const;
  const labels: Record<string, string> = {
    audio: "Audio Validation",
    artwork: "Artwork Validation",
    metadata: "Metadata Validation",
    isrc: "ISRC Validation",
    copyright: "Copyright Validation",
  };

  return order.map((type) => {
    const items = results.filter((result) => result.validation_type === type);
    if (!items.length) return null;
    const failed = items.find((result) => result.status === "failed");
    const warning = items.find((result) => result.status === "warning");
    const selected = failed || warning || items[0];
    return {
      type,
      label: labels[type],
      status: failed ? "failed" : "passed",
      reason: explainValidation(selected),
    };
  }).filter(Boolean) as Array<{ type: string; label: string; status: string; reason: string }>;
}

function explainValidation(result: ValidationResult) {
  const details = result.details || {};
  if (Array.isArray(details.errors) && details.errors.length) return details.errors.join(" ");
  if (Array.isArray(details.warnings) && details.warnings.length) return details.warnings.join(" ");
  if (result.status === "warning") return "Passed with warnings for admin review.";
  if (result.status === "failed") return "Failed validation.";
  return "Passed.";
}
