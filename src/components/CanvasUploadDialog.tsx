import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type SongOpt = { id: string; title: string };

type Props = {
  songs: SongOpt[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const CanvasUploadDialog = ({ songs, open, onOpenChange, onSuccess }: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [songId, setSongId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !songId || !file) { toast.error("Select a song and video"); return; }
    if (file.size > 30 * 1024 * 1024) { toast.error("Max 30MB"); return; }

    setBusy(true);
    try {
      const path = `${user.id}/${songId}-${Date.now()}-${file.name}`;
      const { error: uErr } = await supabase.storage.from("canvas").upload(path, file);
      if (uErr) throw uErr;
      const url = supabase.storage.from("canvas").getPublicUrl(path).data.publicUrl;
      const { error: upErr } = await supabase.from("songs").update({ canvas_video_url: url }).eq("id", songId);
      if (upErr) throw upErr;
      toast.success("Spotify Canvas video uploaded!");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Spotify Canvas Video</DialogTitle>
          <DialogDescription>Add a 3-8 sec looping video (9:16, MP4) that plays with your song on Spotify.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Song *</Label>
            <Select value={songId} onValueChange={setSongId} required>
              <SelectTrigger><SelectValue placeholder="Select song" /></SelectTrigger>
              <SelectContent>{songs.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Video File (MP4, max 30MB) *</Label>
            <Input type="file" accept="video/mp4" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="hero" disabled={busy}>{busy ? "Uploading..." : "Upload Canvas"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CanvasUploadDialog;
