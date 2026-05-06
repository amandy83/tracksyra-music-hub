import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const PLATFORMS = ["Spotify", "Apple Music", "JioSaavn", "YouTube Music", "Amazon Music", "Wynk", "Gaana", "Tidal", "Deezer", "Boomplay"];

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  primary_artist: z.string().trim().min(1).max(200),
  featured_artists: z.string().max(300).optional(),
  songwriter_credits: z.string().max(300).optional(),
  genre: z.string().max(50).optional(),
  language: z.string().max(50).optional(),
  release_date: z.string().optional(),
  isrc: z.string().max(20).optional(),
  upc: z.string().max(20).optional(),
  copyright_info: z.string().max(200).optional(),
  lyrics: z.string().max(10000).optional(),
});

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const UploadSongDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [explicit, setExplicit] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(["Spotify", "Apple Music", "JioSaavn"]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    if (!audioFile) { toast.error("Please select an audio file"); return; }
    if (platforms.length === 0) { toast.error("Select at least one platform"); return; }

    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    const parsed = schema.safeParse(raw);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setBusy(true);
    try {
      const ts = Date.now();
      const audioPath = `${user.id}/${ts}-${audioFile.name}`;
      const { error: aErr } = await supabase.storage.from("audio").upload(audioPath, audioFile);
      if (aErr) throw aErr;

      let coverUrl: string | null = null;
      if (coverFile) {
        const coverPath = `${user.id}/${ts}-${coverFile.name}`;
        const { error: cErr } = await supabase.storage.from("covers").upload(coverPath, coverFile);
        if (cErr) throw cErr;
        coverUrl = supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
      }

      const { error: insErr } = await supabase.from("songs").insert({
        user_id: user.id,
        title: parsed.data.title,
        primary_artist: parsed.data.primary_artist,
        featured_artists: parsed.data.featured_artists || null,
        songwriter_credits: parsed.data.songwriter_credits || null,
        genre: parsed.data.genre || null,
        language: parsed.data.language || null,
        release_date: parsed.data.release_date || null,
        isrc: parsed.data.isrc || null,
        upc: parsed.data.upc || null,
        copyright_info: parsed.data.copyright_info || null,
        lyrics: parsed.data.lyrics || null,
        explicit,
        platforms,
        audio_url: audioPath,
        cover_art_url: coverUrl,
        status: "submitted",
      });
      if (insErr) throw insErr;

      toast.success("Song submitted for distribution!");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload New Song</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Title *</Label><Input name="title" required /></div>
            <div><Label>Primary Artist *</Label><Input name="primary_artist" required defaultValue="" /></div>
            <div><Label>Featured Artists</Label><Input name="featured_artists" /></div>
            <div><Label>Songwriter Credits</Label><Input name="songwriter_credits" /></div>
            <div><Label>Genre</Label><Input name="genre" placeholder="Pop, Hip-Hop..." /></div>
            <div><Label>Language</Label><Input name="language" placeholder="Hindi, English..." /></div>
            <div><Label>Release Date</Label><Input name="release_date" type="date" /></div>
            <div><Label>ISRC Code</Label><Input name="isrc" placeholder="Optional" /></div>
            <div><Label>UPC</Label><Input name="upc" placeholder="Optional" /></div>
            <div><Label>Copyright (©)</Label><Input name="copyright_info" placeholder="2026 Your Label" /></div>
          </div>

          <div><Label>Lyrics</Label><Textarea name="lyrics" rows={3} /></div>

          <div className="flex items-center gap-2">
            <Checkbox id="explicit" checked={explicit} onCheckedChange={(v) => setExplicit(!!v)} />
            <Label htmlFor="explicit">Explicit content</Label>
          </div>

          <div>
            <Label>Audio file (MP3 / WAV) *</Label>
            <Input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} required />
          </div>
          <div>
            <Label>Cover Art (JPG / PNG, 3000x3000 recommended)</Label>
            <Input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <Label>Distribution Platforms *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                  <span className="text-sm">{p}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="hero" disabled={busy}>
              {busy ? "Uploading..." : "Submit for Distribution"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UploadSongDialog;
