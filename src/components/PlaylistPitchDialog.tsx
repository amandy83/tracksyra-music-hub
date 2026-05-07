import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type SongOpt = { id: string; title: string };

const schema = z.object({
  song_id: z.string().uuid(),
  target_playlist: z.string().trim().min(2).max(200),
  platform: z.string(),
  genre: z.string().max(50).optional(),
  mood: z.string().max(50).optional(),
  target_audience: z.string().max(200).optional(),
  similar_artists: z.string().max(300).optional(),
  pitch_story: z.string().trim().min(50, "Pitch story must be at least 50 characters for genuine review").max(2000),
});

type Props = {
  songs: SongOpt[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const PlaylistPitchDialog = ({ songs, open, onOpenChange, onSuccess }: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [songId, setSongId] = useState("");
  const [platform, setPlatform] = useState("Spotify");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const data = { ...Object.fromEntries(fd.entries()), song_id: songId, platform };
    const parsed = schema.safeParse(data);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setBusy(true);
    const { error } = await supabase.from("playlist_pitches").insert({
      user_id: user.id,
      ...parsed.data,
      genre: parsed.data.genre || null,
      mood: parsed.data.mood || null,
      target_audience: parsed.data.target_audience || null,
      similar_artists: parsed.data.similar_artists || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pitch submitted! Our editorial team will review it.");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pitch to Playlist</DialogTitle>
          <DialogDescription>
            Genuine pitches only. Tell us a real story about your song so editors and curators can connect with it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Song *</Label>
            <Select value={songId} onValueChange={setSongId} required>
              <SelectTrigger><SelectValue placeholder="Select your song" /></SelectTrigger>
              <SelectContent>
                {songs.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Platform *</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Spotify","Apple Music","JioSaavn","YouTube Music","Amazon Music","Wynk","Gaana"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Target Playlist Name *</Label><Input name="target_playlist" placeholder="e.g. New Music Friday India" required /></div>
            <div><Label>Genre</Label><Input name="genre" placeholder="Bollywood, Indie..." /></div>
            <div><Label>Mood</Label><Input name="mood" placeholder="Romantic, Energetic..." /></div>
            <div className="sm:col-span-2"><Label>Target Audience</Label><Input name="target_audience" placeholder="e.g. 18-30, India, Hindi listeners" /></div>
            <div className="sm:col-span-2"><Label>Similar Artists</Label><Input name="similar_artists" placeholder="e.g. Arijit Singh, AP Dhillon" /></div>
          </div>
          <div>
            <Label>Pitch Story * (min 50 chars)</Label>
            <Textarea name="pitch_story" rows={5} required placeholder="Share the inspiration, story, and what makes this song special. Authentic pitches get prioritized." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="hero" disabled={busy}>{busy ? "Submitting..." : "Submit Pitch"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PlaylistPitchDialog;
