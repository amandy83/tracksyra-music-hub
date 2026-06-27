import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type ReleaseOpt = { id: string; title: string };
type ExistingPitch = {
  id: string;
  song_id: string;
  target_playlist: string;
  platform: string;
  genre: string | null;
  mood: string | null;
  target_audience: string | null;
  similar_artists: string | null;
  pitch_story: string;
  status: string;
};

const schema = z.object({
  song_id: z.string().uuid("Please select a release"),
  target_playlist: z.string().trim().min(2, "Playlist name too short").max(200),
  platform: z.string(),
  genre: z.string().max(50).optional(),
  mood: z.string().max(50).optional(),
  target_audience: z.string().max(200).optional(),
  similar_artists: z.string().max(300).optional(),
  pitch_story: z
    .string()
    .trim()
    .min(50, "Pitch story must be at least 50 characters for genuine review")
    .max(2000, "Pitch story max 2000 characters"),
});

type Props = {
  releases: ReleaseOpt[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  existing?: ExistingPitch | null;
};

const PlaylistPitchDialog = ({ releases, open, onOpenChange, onSuccess, existing }: Props) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [songId, setSongId] = useState("");
  const [platform, setPlatform] = useState("Spotify");
  const [story, setStory] = useState("");

  useEffect(() => {
    if (open) {
      setSongId(existing?.song_id || "");
      setPlatform(existing?.platform || "Spotify");
      setStory(existing?.pitch_story || "");
    }
  }, [open, existing]);

  const isEdit = !!existing;
  const isResubmit = existing?.status === "rejected";
  const storyLen = story.trim().length;
  const storyOk = storyLen >= 50 && storyLen <= 2000;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const data = {
      ...Object.fromEntries(fd.entries()),
      song_id: songId,
      platform,
      pitch_story: story,
    };
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    const payload = {
      song_id: parsed.data.song_id,
      target_playlist: parsed.data.target_playlist,
      platform: parsed.data.platform,
      pitch_story: parsed.data.pitch_story,
      genre: parsed.data.genre || null,
      mood: parsed.data.mood || null,
      target_audience: parsed.data.target_audience || null,
      similar_artists: parsed.data.similar_artists || null,
    };

    let error;
    if (isEdit) {
      const update: any = { ...payload };
      if (isResubmit) update.status = "pending";
      ({ error } = await supabase.from("playlist_pitches").update(update).eq("id", existing!.id));
    } else {
      ({ error } = await supabase
        .from("playlist_pitches")
        .insert({ user_id: user.id, ...payload }));
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      isResubmit
        ? "Pitch resubmitted for review!"
        : isEdit
        ? "Pitch updated"
        : "Pitch submitted! Our editorial team will review it."
    );
    onOpenChange(false);
    onSuccess();
  };

  const lockedDuringReview = isEdit && existing?.status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isResubmit ? "Edit & Resubmit Pitch" : isEdit ? "Edit Pitch" : "Pitch to Playlist"}
          </DialogTitle>
          <DialogDescription>
            Genuine pitches only. Tell a real story — editors prioritize authentic submissions.
          </DialogDescription>
        </DialogHeader>

        {/* Genuine pitch rules */}
        <div className="rounded-lg border border-pink-200 bg-pink-50 p-3 text-sm">
          <p className="font-semibold mb-2 text-pink-900">Pitch Guidelines</p>
          <ul className="space-y-1 text-pink-900/80 text-xs">
            <li>✓ Write your own story — no copy-paste, no AI-generic text</li>
            <li>✓ Mention inspiration, recording process, or emotional core</li>
            <li>✓ Be specific about why this playlist fits your release</li>
            <li>✗ No spam, fake stats, or paid-promotion language</li>
            <li>✗ No duplicate pitches for the same playlist</li>
          </ul>
        </div>

        {lockedDuringReview && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            This pitch is approved — editing is disabled.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Release *</Label>
            <Select value={songId} onValueChange={setSongId} disabled={lockedDuringReview} required>
              <SelectTrigger>
                <SelectValue placeholder="Select your release" />
              </SelectTrigger>
              <SelectContent>
                {releases.map((release) => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Platform *</Label>
              <Select value={platform} onValueChange={setPlatform} disabled={lockedDuringReview}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Spotify", "Apple Music", "JioSaavn", "YouTube Music", "Amazon Music", "Wynk", "Gaana"].map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Playlist Name *</Label>
              <Input
                name="target_playlist"
                placeholder="e.g. New Music Friday India"
                defaultValue={existing?.target_playlist || ""}
                disabled={lockedDuringReview}
                required
              />
            </div>
            <div>
              <Label>Genre</Label>
              <Input
                name="genre"
                placeholder="Bollywood, Indie..."
                defaultValue={existing?.genre || ""}
                disabled={lockedDuringReview}
              />
            </div>
            <div>
              <Label>Mood</Label>
              <Input
                name="mood"
                placeholder="Romantic, Energetic..."
                defaultValue={existing?.mood || ""}
                disabled={lockedDuringReview}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Target Audience</Label>
              <Input
                name="target_audience"
                placeholder="e.g. 18-30, India, Hindi listeners"
                defaultValue={existing?.target_audience || ""}
                disabled={lockedDuringReview}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Similar Artists</Label>
              <Input
                name="similar_artists"
                placeholder="e.g. Arijit Singh, AP Dhillon"
                defaultValue={existing?.similar_artists || ""}
                disabled={lockedDuringReview}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Pitch Story * (min 50, max 2000)</Label>
              <span
                className={`text-xs flex items-center gap-1 ${
                  storyOk ? "text-green-600" : "text-muted-foreground"
                }`}
              >
                {storyOk ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {storyLen}/2000
              </span>
            </div>
            <Textarea
              name="pitch_story"
              rows={6}
              required
              value={story}
              onChange={(e) => setStory(e.target.value)}
              disabled={lockedDuringReview}
              placeholder="Share the inspiration, story, and what makes this release special. Authentic pitches get prioritized by editors."
              className={!storyOk && storyLen > 0 ? "border-destructive/50" : ""}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            {!lockedDuringReview && (
              <Button type="submit" variant="hero" disabled={busy || !storyOk}>
                {busy
                  ? "Saving..."
                  : isResubmit
                  ? "Resubmit Pitch"
                  : isEdit
                  ? "Save Changes"
                  : "Submit Pitch"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PlaylistPitchDialog;
