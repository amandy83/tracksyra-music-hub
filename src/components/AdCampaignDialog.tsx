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

type ReleaseOpt = { id: string; title: string };

const schema = z.object({
  song_id: z.string().uuid(),
  campaign_name: z.string().trim().min(2).max(100),
  budget_inr: z.coerce.number().min(500, "Minimum budget is ₹500"),
  platform: z.string(),
  target_countries: z.string().max(200).optional(),
  target_age: z.string().max(50).optional(),
  target_genre: z.string().max(50).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

type Props = {
  releases: ReleaseOpt[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const AdCampaignDialog = ({ releases, open, onOpenChange, onSuccess }: Props) => {
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
    const { error } = await supabase.from("ad_campaigns").insert({
      user_id: user.id,
      song_id: parsed.data.song_id,
      campaign_name: parsed.data.campaign_name,
      budget_inr: parsed.data.budget_inr,
      platform: parsed.data.platform,
      target_countries: parsed.data.target_countries || null,
      target_age: parsed.data.target_age || null,
      target_genre: parsed.data.target_genre || null,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
      notes: parsed.data.notes || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Ad campaign request submitted! Our team will contact you for payment.");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Ads on Spotify / Streaming Platforms</DialogTitle>
          <DialogDescription>Promote your release with paid ads. Min budget ₹500. Our team handles setup.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Release *</Label>
            <Select value={songId} onValueChange={setSongId} required>
              <SelectTrigger><SelectValue placeholder="Select release" /></SelectTrigger>
              <SelectContent>{releases.map(release => <SelectItem key={release.id} value={release.id}>{release.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>Campaign Name *</Label><Input name="campaign_name" required /></div>
            <div>
              <Label>Platform *</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Spotify","YouTube","Instagram","Meta (FB+IG)"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Budget (₹) *</Label><Input name="budget_inr" type="number" min={500} required /></div>
            <div><Label>Target Age</Label><Input name="target_age" placeholder="e.g. 18-35" /></div>
            <div><Label>Target Countries</Label><Input name="target_countries" placeholder="India, USA, UK" /></div>
            <div><Label>Target Genre</Label><Input name="target_genre" placeholder="Pop, Hip-Hop..." /></div>
            <div><Label>Start Date</Label><Input name="start_date" type="date" /></div>
            <div><Label>End Date</Label><Input name="end_date" type="date" /></div>
          </div>
          <div><Label>Additional Notes</Label><Textarea name="notes" rows={3} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="hero" disabled={busy}>{busy ? "Submitting..." : "Submit Campaign"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AdCampaignDialog;
