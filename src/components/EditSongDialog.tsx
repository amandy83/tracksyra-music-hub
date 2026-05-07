import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Song = {
  id: string;
  title: string;
  primary_artist: string;
  featured_artists: string | null;
  genre: string | null;
  language: string | null;
  release_date: string | null;
  isrc: string | null;
  upc: string | null;
  copyright_info: string | null;
  lyrics: string | null;
};

type Props = {
  song: Song | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const EditSongDialog = ({ song, open, onOpenChange, onSuccess }: Props) => {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<Song>>({});

  useEffect(() => { if (song) setForm(song); }, [song]);

  if (!song) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("songs").update({
      title: form.title,
      primary_artist: form.primary_artist,
      featured_artists: form.featured_artists || null,
      genre: form.genre || null,
      language: form.language || null,
      release_date: form.release_date || null,
      isrc: form.isrc || null,
      upc: form.upc || null,
      copyright_info: form.copyright_info || null,
      lyrics: form.lyrics || null,
    }).eq("id", song.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Song updated!");
    onOpenChange(false);
    onSuccess();
  };

  const set = (k: keyof Song) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Song Details</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Title</Label><Input value={form.title || ""} onChange={set("title")} required /></div>
            <div><Label>Primary Artist</Label><Input value={form.primary_artist || ""} onChange={set("primary_artist")} required /></div>
            <div><Label>Featured Artists</Label><Input value={form.featured_artists || ""} onChange={set("featured_artists")} /></div>
            <div><Label>Genre</Label><Input value={form.genre || ""} onChange={set("genre")} /></div>
            <div><Label>Language</Label><Input value={form.language || ""} onChange={set("language")} /></div>
            <div><Label>Release Date</Label><Input type="date" value={form.release_date || ""} onChange={set("release_date")} /></div>
            <div><Label>ISRC</Label><Input value={form.isrc || ""} onChange={set("isrc")} /></div>
            <div><Label>UPC</Label><Input value={form.upc || ""} onChange={set("upc")} /></div>
            <div className="sm:col-span-2"><Label>Copyright</Label><Input value={form.copyright_info || ""} onChange={set("copyright_info")} /></div>
          </div>
          <div><Label>Lyrics</Label><Textarea rows={4} value={form.lyrics || ""} onChange={set("lyrics")} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="hero" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditSongDialog;
