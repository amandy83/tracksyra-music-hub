import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Loader2, Upload, ImageIcon } from "lucide-react";
import { validateAudio, type AudioMeta } from "@/lib/validation/audio";
import { validateCover, type CoverMeta } from "@/lib/validation/cover";
import { releaseMetadataSchema, declarationsSchema } from "@/lib/validation/metadata";
import { DSP_PLATFORMS } from "@/lib/validation/platforms";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; onSuccess?: () => void };

const initialMeta = {
  title: "", primary_artist: "", featured_artists: "", genre: "Pop", language: "English",
  release_date: new Date().toISOString().slice(0, 10), explicit: false, isrc: "", upc: "",
  composer: "", lyrics: "", copyright_owner: "",
};

export default function UploadReleaseDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioMeta, setAudioMeta] = useState<AudioMeta | null>(null);
  const [audioErrors, setAudioErrors] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverMeta, setCoverMeta] = useState<CoverMeta | null>(null);
  const [coverErrors, setCoverErrors] = useState<string[]>([]);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [validating, setValidating] = useState(false);
  const [meta, setMeta] = useState(initialMeta);
  const [metaErrors, setMetaErrors] = useState<Record<string, string>>({});
  const [decl, setDecl] = useState({ copyright_declared: false, ai_content_declared: false, rights_owned: false });
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setStep(1); setAudioFile(null); setAudioMeta(null); setAudioErrors([]);
    setCoverFile(null); setCoverMeta(null); setCoverErrors([]); setCoverPreview("");
    setMeta(initialMeta); setMetaErrors({}); setDecl({ copyright_declared: false, ai_content_declared: false, rights_owned: false });
    setProgress(0);
  };

  const handleAudio = async (f: File) => {
    setAudioFile(f); setAudioMeta(null); setAudioErrors([]); setValidating(true);
    const r = await validateAudio(f);
    if (r.ok) {
      // duplicate check by hash
      const { data: dup } = await supabase.from("tracks").select("id").eq("audio_hash", r.meta.hash).maybeSingle();
      if (dup) { setAudioErrors(["This exact audio file has already been uploaded."]); setValidating(false); return; }
      setAudioMeta(r.meta);
    } else setAudioErrors(r.errors);
    setValidating(false);
  };

  const handleCover = async (f: File) => {
    setCoverFile(f); setCoverMeta(null); setCoverErrors([]); setCoverPreview(""); setValidating(true);
    const r = await validateCover(f);
    if (r.ok) { setCoverMeta(r.meta); setCoverPreview(r.previewUrl); }
    else setCoverErrors(r.errors);
    setValidating(false);
  };

  const validateMetaStep = () => {
    const r = releaseMetadataSchema.safeParse(meta);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setMetaErrors(errs); return false;
    }
    setMetaErrors({}); return true;
  };

  const submit = async () => {
    if (!user || !audioFile || !audioMeta || !coverFile || !coverMeta) return;
    const d = declarationsSchema.safeParse(decl);
    if (!d.success) { toast.error("Please confirm all required declarations."); return; }

    setSubmitting(true);
    try {
      // 1. Upload audio (private bucket, scoped to user)
      const audioPath = `${user.id}/${Date.now()}-${audioFile.name}`;
      const audioUp = await supabase.storage.from("audio").upload(audioPath, audioFile, { upsert: false });
      if (audioUp.error) throw audioUp.error;
      setProgress(50);

      // 2. Upload cover (public bucket)
      const coverPath = `${user.id}/${Date.now()}-${coverFile.name}`;
      const coverUp = await supabase.storage.from("covers").upload(coverPath, coverFile, { upsert: false });
      if (coverUp.error) throw coverUp.error;
      const coverPub = supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
      setProgress(75);

      // 3. Create release
      const { data: rel, error: relErr } = await supabase.from("releases").insert({
        user_id: user.id,
        title: meta.title,
        primary_artist: meta.primary_artist,
        release_date: meta.release_date,
        genre: meta.genre,
        language: meta.language,
        upc: meta.upc || null,
        copyright_owner: meta.copyright_owner,
        copyright_declared: decl.copyright_declared,
        ai_content_declared: decl.ai_content_declared,
        rights_owned: decl.rights_owned,
        cover_art_url: coverPub,
        status: "uploaded",
      }).select().single();
      if (relErr) throw relErr;

      // 4. Create track
      const { error: trkErr } = await supabase.from("tracks").insert({
        release_id: rel.id, user_id: user.id,
        title: meta.title, primary_artist: meta.primary_artist,
        featured_artists: meta.featured_artists || null,
        composer: meta.composer, lyrics: meta.lyrics || null,
        isrc: meta.isrc || null, explicit: meta.explicit,
        audio_url: audioPath, audio_hash: audioMeta.hash,
        bitrate_kbps: audioMeta.bitrate_kbps, sample_rate_hz: audioMeta.sample_rate_hz,
        channels: audioMeta.channels, duration_sec: audioMeta.duration_sec,
        file_size_bytes: audioMeta.file_size_bytes, audio_format: audioMeta.format,
      });
      if (trkErr) throw trkErr;

      // 5. Seed platform_deliveries (one per DSP, status=pending)
      await supabase.from("platform_deliveries").insert(
        DSP_PLATFORMS.map((p) => ({ release_id: rel.id, user_id: user.id, platform: p.key as any, status: "pending" as const }))
      );

      // 6. Upload log
      await supabase.from("upload_logs").insert({
        user_id: user.id, release_id: rel.id, file_name: audioFile.name,
        file_size_bytes: audioFile.size, file_type: audioFile.type, status: "success",
      });

      setProgress(100);
      toast.success("Release uploaded — entering review queue.");
      onSuccess?.(); onOpenChange(false); reset();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
      if (user) await supabase.from("upload_logs").insert({
        user_id: user.id, file_name: audioFile?.name, file_size_bytes: audioFile?.size,
        status: "error", error_message: String(e.message || e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const canStep2 = audioMeta && coverMeta && !audioErrors.length && !coverErrors.length;
  const canStep3 = canStep2;
  const canSubmit = canStep3 && decl.copyright_declared && decl.rights_owned;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Release — Step {step} of 4</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Audio file (WAV, FLAC, or MP3 320 kbps)</Label>
              <Input type="file" accept=".wav,.flac,.mp3,audio/*" onChange={(e) => e.target.files?.[0] && handleAudio(e.target.files[0])} />
              {validating && <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Validating…</p>}
              {audioMeta && (
                <Alert className="mt-2 border-green-200 bg-green-50">
                  <CheckCircle2 className="w-4 h-4 text-green-700" />
                  <AlertDescription className="text-green-900 text-sm">
                    {audioMeta.format.toUpperCase()} · {audioMeta.sample_rate_hz} Hz · {audioMeta.channels === 1 ? "Mono" : "Stereo"} · {audioMeta.bitrate_kbps} kbps · {audioMeta.duration_sec}s
                  </AlertDescription>
                </Alert>
              )}
              {audioErrors.map((e, i) => (
                <Alert key={i} variant="destructive" className="mt-2"><AlertCircle className="w-4 h-4" /><AlertDescription>{e}</AlertDescription></Alert>
              ))}
            </div>
            <div>
              <Label>Cover art (3000×3000 minimum, JPG/PNG, square)</Label>
              <Input type="file" accept="image/jpeg,image/png" onChange={(e) => e.target.files?.[0] && handleCover(e.target.files[0])} />
              {coverPreview && <img src={coverPreview} className="mt-2 w-32 h-32 rounded object-cover border" alt="cover" />}
              {coverMeta && (
                <Alert className="mt-2 border-green-200 bg-green-50">
                  <CheckCircle2 className="w-4 h-4 text-green-700" />
                  <AlertDescription className="text-green-900 text-sm">{coverMeta.width}×{coverMeta.height} · sharpness {coverMeta.blurScore}</AlertDescription>
                </Alert>
              )}
              {coverErrors.map((e, i) => (
                <Alert key={i} variant="destructive" className="mt-2"><AlertCircle className="w-4 h-4" /><AlertDescription>{e}</AlertDescription></Alert>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["title", "Song Title *"],
              ["primary_artist", "Primary Artist *"],
              ["featured_artists", "Featured Artists"],
              ["composer", "Composer *"],
              ["copyright_owner", "Copyright Owner *"],
              ["isrc", "ISRC (e.g. USABC2400001)"],
              ["upc", "UPC (12–13 digits)"],
              ["release_date", "Release Date *"],
            ].map(([k, lbl]) => (
              <div key={k} className={k === "lyrics" ? "sm:col-span-2" : ""}>
                <Label>{lbl}</Label>
                <Input
                  type={k === "release_date" ? "date" : "text"}
                  value={(meta as any)[k]}
                  onChange={(e) => setMeta({ ...meta, [k]: e.target.value })}
                />
                {metaErrors[k] && <p className="text-xs text-destructive mt-1">{metaErrors[k]}</p>}
              </div>
            ))}
            <div>
              <Label>Genre *</Label>
              <Select value={meta.genre} onValueChange={(v) => setMeta({ ...meta, genre: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Pop","Hip-Hop","R&B","Rock","Electronic","Indie","Bollywood","Punjabi","Classical","Jazz","Folk","Other"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language *</Label>
              <Select value={meta.language} onValueChange={(v) => setMeta({ ...meta, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["English","Hindi","Punjabi","Tamil","Telugu","Spanish","Other"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Checkbox id="explicit" checked={meta.explicit} onCheckedChange={(v) => setMeta({ ...meta, explicit: !!v })} />
              <Label htmlFor="explicit">Contains explicit content</Label>
            </div>
            <div className="sm:col-span-2">
              <Label>Lyrics (optional)</Label>
              <Textarea rows={4} value={meta.lyrics} onChange={(e) => setMeta({ ...meta, lyrics: e.target.value })} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <Alert><AlertCircle className="w-4 h-4" /><AlertDescription>You must own or have full rights to all content. False declarations may result in takedowns.</AlertDescription></Alert>
            {[
              ["copyright_declared", "I own or control the copyright to this recording. *"],
              ["rights_owned", "I confirm I have all distribution rights for every territory. *"],
              ["ai_content_declared", "This release contains AI-generated content (check if applicable)"],
            ].map(([k, lbl]) => (
              <div key={k} className="flex items-start gap-2 p-3 border rounded-md">
                <Checkbox id={k} checked={(decl as any)[k]} onCheckedChange={(v) => setDecl({ ...decl, [k]: !!v })} />
                <Label htmlFor={k} className="text-sm leading-relaxed">{lbl}</Label>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">Review</h3>
            <div className="grid grid-cols-2 gap-2 p-3 rounded bg-muted">
              <div><span className="text-muted-foreground">Title:</span> {meta.title}</div>
              <div><span className="text-muted-foreground">Artist:</span> {meta.primary_artist}</div>
              <div><span className="text-muted-foreground">Genre:</span> {meta.genre}</div>
              <div><span className="text-muted-foreground">Language:</span> {meta.language}</div>
              <div><span className="text-muted-foreground">Release:</span> {meta.release_date}</div>
              <div><span className="text-muted-foreground">ISRC:</span> {meta.isrc || "—"}</div>
              <div><span className="text-muted-foreground">Audio:</span> {audioMeta?.format.toUpperCase()} · {audioMeta?.bitrate_kbps}kbps</div>
              <div><span className="text-muted-foreground">Cover:</span> {coverMeta?.width}×{coverMeta?.height}</div>
            </div>
            <p className="text-muted-foreground">Will be delivered to {DSP_PLATFORMS.length} platforms after review.</p>
            {submitting && <Progress value={progress} />}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>Back</Button>}
          {step < 4 && (
            <Button
              variant="hero"
              onClick={() => {
                if (step === 1 && !canStep2) { toast.error("Fix file issues first"); return; }
                if (step === 2 && !validateMetaStep()) return;
                setStep(step + 1);
              }}
            ><Upload className="w-4 h-4 mr-2" />Next</Button>
          )}
          {step === 4 && (
            <Button variant="hero" onClick={submit} disabled={!canSubmit || submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading…</> : <><ImageIcon className="w-4 h-4 mr-2" />Submit Release</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
