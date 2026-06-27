import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { BarChart3, ListMusic, Send, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";

type Release = {
  id: string;
  title: string;
  primary_artist: string;
  genre: string | null;
  language: string | null;
  release_date: string | null;
  status: string;
  upc: string | null;
};

type Track = {
  id: string;
  release_id: string;
  title: string;
  primary_artist: string;
  isrc: string | null;
  explicit: boolean;
  duration_sec: number | null;
};

type Pitch = {
  id: string;
  release_id: string;
  track_id: string;
  genre: string | null;
  subgenre: string | null;
  territory: string | null;
  artist_country?: string | null;
  status: string;
  priority_score: number;
  admin_notes: string | null;
  rejection_reason: string | null;
  release_title?: string;
  track_title?: string;
  total_curators_sent?: number;
  opened_count?: number;
  reviewed_count?: number;
  accepted_count?: number;
  rejected_count?: number;
  playlist_added_count?: number;
  curator_response_rate?: number;
  estimated_playlist_reach?: number;
  created_at: string;
};

const client = supabase as any;

const ACTIVE_STATUSES = ["draft", "submitted", "under_review", "approved", "sent_to_curators", "accepted"];

const pitchSchema = z.object({
  release_id: z.string().uuid(),
  track_id: z.string().uuid(),
  genre: z.string().trim().min(2).max(80),
  subgenre: z.string().trim().max(80).optional(),
  mood_tags: z.string().trim().min(2),
  instruments: z.string().trim().min(2),
  language: z.string().trim().min(2).max(80),
  territory: z.string().trim().min(2).max(120),
  artist_country: z.string().trim().min(2).max(120),
  similar_artists: z.string().trim().min(2).max(500),
  pitch_story: z.string().trim().min(80).max(2500),
  marketing_plan: z.string().trim().min(40).max(2000),
  campaign_budget: z.coerce.number().min(0).max(10000000),
  release_date: z.string().min(4),
  spotify_uri: z.string().trim().regex(/^(spotify:(track|album):[A-Za-z0-9]+|https:\/\/open\.spotify\.com\/(track|album)\/[A-Za-z0-9]+)/, "Spotify URL or URI is required."),
  instagram: z.string().trim().optional(),
  tiktok: z.string().trim().optional(),
  youtube: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

export default function PlaylistPitching() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { primaryRole } = useRoles();
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [releaseId, setReleaseId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [story, setStory] = useState("");
  const [marketingPlan, setMarketingPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<{ role_name: string; monthly_limit: number | null; used_count: number; remaining_count: number | null } | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [releaseResult, trackResult, pitchResult, usageResult] = await Promise.all([
      supabase
        .from("releases")
        .select("id,title,primary_artist,genre,language,release_date,status,upc")
        .eq("user_id", user.id)
        .in("status", ["approved", "sent_to_stores", "processing", "live"])
        .order("release_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("tracks")
        .select("id,release_id,title,primary_artist,isrc,explicit,duration_sec")
        .eq("user_id", user.id)
        .order("track_number"),
      client
        .from("playlist_pitch_artist_dashboard")
        .select("*")
        .order("created_at", { ascending: false }),
      client.from("free_playlist_pitch_usage").select("*").maybeSingle(),
    ]);

    if (releaseResult.error) toast.error(releaseResult.error.message);
    if (trackResult.error) toast.error(trackResult.error.message);
    if (pitchResult.error) {
      const fallback = await supabase.from("playlist_pitches").select("*").order("created_at", { ascending: false });
      setPitches((fallback.data || []) as unknown as Pitch[]);
    } else {
      setPitches((pitchResult.data || []) as Pitch[]);
    }
    if (!usageResult.error) setUsage(usageResult.data || null);

    const approved = (releaseResult.data || []) as Release[];
    setReleases(approved);
    setTracks((trackResult.data || []) as Track[]);
    if (!releaseId && approved[0]) setReleaseId(approved[0].id);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [user]);

  const selectedRelease = releases.find((release) => release.id === releaseId) || null;
  const releaseTracks = tracks.filter((track) => track.release_id === releaseId);
  const selectedTrack = releaseTracks.find((track) => track.id === trackId) || releaseTracks[0] || null;
  const activePitch = pitches.find((pitch) => pitch.release_id === releaseId && ACTIVE_STATUSES.includes(pitch.status));
  const limitReached = usage?.remaining_count !== null && usage?.remaining_count !== undefined && usage.remaining_count <= 0;
  const canSubmit = !!selectedRelease && !!selectedTrack && !activePitch && !limitReached && story.trim().length >= 80 && marketingPlan.trim().length >= 40;

  useEffect(() => {
    if (releaseTracks.length && (!trackId || !releaseTracks.some((track) => track.id === trackId))) {
      setTrackId(releaseTracks[0].id);
    }
  }, [releaseId, tracks]);

  const analytics = useMemo(() => {
    const total = pitches.length;
    const accepted = pitches.filter((pitch) => pitch.status === "accepted").length;
    const rejected = pitches.filter((pitch) => pitch.status === "rejected").length;
    const reach = pitches.reduce((sum, pitch) => sum + Number(pitch.estimated_playlist_reach || 0), 0);
    const responseRate = total ? Math.round(pitches.reduce((sum, pitch) => sum + Number(pitch.curator_response_rate || 0), 0) / total) : 0;
    return { total, accepted, rejected, reach, responseRate };
  }, [pitches]);

  const chartData = [
    { name: "Total", value: analytics.total },
    { name: "Accepted", value: analytics.accepted },
    { name: "Rejected", value: analytics.rejected },
  ];

  const submitPitch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !selectedRelease || !selectedTrack) return;
    if (activePitch) {
      toast.error("This release already has an active playlist pitch.");
      return;
    }
    if (limitReached) {
      toast.error("Your free playlist pitch limit is used for this month.");
      return;
    }

    const fd = new FormData(event.currentTarget);
    const parsed = pitchSchema.safeParse({
      ...Object.fromEntries(fd.entries()),
      release_id: selectedRelease.id,
      track_id: selectedTrack.id,
      pitch_story: story,
      marketing_plan: marketingPlan,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    const { error } = await client.from("playlist_pitches").insert({
      user_id: user.id,
      release_id: selectedRelease.id,
      track_id: selectedTrack.id,
      genre: parsed.data.genre,
      subgenre: parsed.data.subgenre || null,
      mood_tags: splitTags(parsed.data.mood_tags),
      instruments: splitTags(parsed.data.instruments),
      language: parsed.data.language,
      territory: parsed.data.territory,
      artist_country: parsed.data.artist_country,
      similar_artists: parsed.data.similar_artists,
      mood: splitTags(parsed.data.mood_tags)[0] || null,
      pitch_story: parsed.data.pitch_story,
      marketing_plan: parsed.data.marketing_plan,
      social_links: {
        instagram: parsed.data.instagram || null,
        tiktok: parsed.data.tiktok || null,
        youtube: parsed.data.youtube || null,
        website: parsed.data.website || null,
      },
      campaign_budget: parsed.data.campaign_budget,
      release_date: parsed.data.release_date,
      spotify_uri: parsed.data.spotify_uri,
      spotify_url: toSpotifyUrl(parsed.data.spotify_uri),
      status: "submitted",
      submitted_at: new Date().toISOString(),
      release_metadata: {
        title: selectedRelease.title,
        primary_artist: selectedRelease.primary_artist,
        genre: selectedRelease.genre,
        language: selectedRelease.language,
        upc: selectedRelease.upc,
        track_title: selectedTrack.title,
        isrc: selectedTrack.isrc,
        explicit: selectedTrack.explicit,
        duration_sec: selectedTrack.duration_sec,
        similar_artists: parsed.data.similar_artists,
        artist_country: parsed.data.artist_country,
        free_limit_role: usage?.role_name || primaryRole || "artist",
      },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Playlist pitch submitted and delivered to matched curators.");
    setStory("");
    setMarketingPlan("");
    await load();
  };

  return (
    <DashboardShell
      title="Playlist Pitching"
      eyebrow="Editorial growth"
      actions={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard")}>Dashboard</Button>}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Total Pitches" value={analytics.total} delta={9} comparison="pipeline activity" icon={ListMusic} accent="pink" />
          <KpiCard label="Accepted" value={analytics.accepted} delta={analytics.accepted ? 12 : 0} comparison="curator wins" icon={Target} accent="green" />
          <KpiCard label="Rejected" value={analytics.rejected} delta={analytics.rejected ? -4 : 0} comparison="quality signal" icon={BarChart3} accent="slate" />
          <KpiCard label="Response Rate" value={`${analytics.responseRate}%`} delta={analytics.responseRate ? 6 : 0} comparison="curator response" icon={TrendingUp} accent="teal" />
          <KpiCard label="Playlist Adds" value={pitches.reduce((sum, pitch) => sum + Number(pitch.playlist_added_count || 0), 0)} delta={analytics.reach ? 15 : 0} comparison="confirmed placements" icon={Send} accent="blue" />
        </div>
        <GlassCard className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">Free Playlist Submissions</p>
              <p className="text-sm text-muted-foreground">
                {usage?.monthly_limit === null ? "Publisher plan: unlimited free pitches this month." : `${usage?.used_count || 0}/${usage?.monthly_limit || (primaryRole === "label" ? 20 : 2)} used this month.`}
              </p>
            </div>
            <Badge variant={limitReached ? "destructive" : "outline"} className="w-fit capitalize">
              {usage?.monthly_limit === null ? "Unlimited" : `${usage?.remaining_count ?? (primaryRole === "label" ? 20 : 2)} remaining`}
            </Badge>
          </div>
        </GlassCard>

        <Tabs defaultValue="create">
          <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
            <TabsTrigger value="create"><Send className="w-4 h-4 mr-1" />Create Pitch</TabsTrigger>
            <TabsTrigger value="pitches"><ListMusic className="w-4 h-4 mr-1" />My Pitches</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1" />Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-6">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
              <GlassCard className="p-5">
                <SectionHeader title="Create Pitch" description="Submit a structured editorial pitch with metadata, story, and rollout signals." />
                <form onSubmit={submitPitch} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Approved Release</Label>
                      <Select value={releaseId} onValueChange={setReleaseId}>
                        <SelectTrigger><SelectValue placeholder={loading ? "Loading..." : "Select release"} /></SelectTrigger>
                        <SelectContent>
                          {releases.map((release) => <SelectItem key={release.id} value={release.id}>{release.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Track</Label>
                      <Select value={selectedTrack?.id || ""} onValueChange={setTrackId} disabled={!releaseTracks.length}>
                        <SelectTrigger><SelectValue placeholder="Select track" /></SelectTrigger>
                        <SelectContent>
                          {releaseTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {activePitch && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      This release already has an active pitch with status <strong>{activePitch.status}</strong>.
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field name="genre" label="Genre" defaultValue={selectedRelease?.genre || ""} />
                    <Field name="subgenre" label="Subgenre" placeholder="Alt pop, melodic rap, synthwave" />
                    <Field name="mood_tags" label="Mood Tags" placeholder="uplifting, late night, romantic" />
                    <Field name="similar_artists" label="Similar Artists" placeholder="Arijit Singh, AP Dhillon, Prateek Kuhad" />
                    <Field name="instruments" label="Instruments" placeholder="piano, 808, acoustic guitar" />
                    <Field name="language" label="Language" defaultValue={selectedRelease?.language || ""} />
                    <Field name="territory" label="Territory" placeholder="India, US, UK, Global" />
                    <Field name="artist_country" label="Artist Country" placeholder="India" />
                    <Field name="release_date" label="Release Date" type="date" defaultValue={selectedRelease?.release_date || ""} />
                    <Field name="campaign_budget" label="Campaign Budget" type="number" placeholder="25000" />
                    <Field name="spotify_uri" label="Spotify URL" placeholder="https://open.spotify.com/track/..." />
                  </div>

                  <div>
                    <Label>Pitch Story</Label>
                    <Textarea rows={7} value={story} onChange={(event) => setStory(event.target.value)} placeholder="Tell the editorial team the story behind this track, why it matters now, and what listener moment it serves." />
                    <p className="text-xs text-muted-foreground mt-1">{story.trim().length}/2500, minimum 80</p>
                  </div>

                  <div>
                    <Label>Marketing Plan</Label>
                    <Textarea rows={5} value={marketingPlan} onChange={(event) => setMarketingPlan(event.target.value)} placeholder="Describe campaign rollout, content calendar, creator outreach, ads, press, and audience signals." />
                    <p className="text-xs text-muted-foreground mt-1">{marketingPlan.trim().length}/2000, minimum 40</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field name="instagram" label="Instagram" placeholder="https://instagram.com/artist" />
                    <Field name="tiktok" label="TikTok" placeholder="https://tiktok.com/@artist" />
                    <Field name="youtube" label="YouTube" placeholder="https://youtube.com/@artist" />
                    <Field name="website" label="Website" placeholder="https://artist.com" />
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" variant="hero" disabled={!canSubmit || busy}>
                      <Send className="w-4 h-4 mr-2" />{busy ? "Submitting..." : "Submit Pitch"}
                    </Button>
                  </div>
                </form>
              </GlassCard>

              <GlassCard className="p-5 h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold">Release Metadata</h2>
                </div>
                {selectedRelease && selectedTrack ? (
                  <div className="space-y-3 text-sm">
                    <Info label="Release" value={selectedRelease.title} />
                    <Info label="Artist" value={selectedRelease.primary_artist} />
                    <Info label="Status" value={selectedRelease.status} />
                    <Info label="Track" value={selectedTrack.title} />
                    <Info label="ISRC" value={selectedTrack.isrc || "Missing"} />
                    <Info label="UPC" value={selectedRelease.upc || "Missing"} />
                    <Info label="Explicit" value={selectedTrack.explicit ? "Yes" : "No"} />
                    <Info label="Eligibility" value="Approved release" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an approved release to load metadata.</p>
                )}
              </GlassCard>
            </div>
          </TabsContent>

          <TabsContent value="pitches" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pitches.length === 0 ? (
                <div className="lg:col-span-2">
                  <EmptyState title="No playlist pitches" description="Create your first pitch to build a curator pipeline and forecast acceptance probability." actionLabel="Create pitch" onAction={() => null} icon={ListMusic} />
                </div>
              ) : pitches.map((pitch) => (
                <GlassCard key={pitch.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{pitch.release_title || "Release"}</h3>
                        <StatusBadge status={pitch.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{pitch.track_title || "Track"} • {pitch.genre || "Genre"} • {pitch.territory || "Territory"}</p>
                      {(pitch.admin_notes || pitch.rejection_reason) && (
                        <p className="text-xs rounded bg-muted p-2 mt-3">{pitch.rejection_reason || pitch.admin_notes}</p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">{Number(pitch.estimated_playlist_reach || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">confirmed reach</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-sm">
                    <Mini label="Reached" value={pitch.total_curators_sent || 0} />
                    <Mini label="Opened" value={pitch.opened_count || 0} />
                    <Mini label="Reviewed" value={pitch.reviewed_count || 0} />
                    <Mini label="Accepted" value={pitch.accepted_count || 0} />
                    <Mini label="Playlist Added" value={pitch.playlist_added_count || 0} />
                    <Mini label="Response" value={`${pitch.curator_response_rate || 0}%`} />
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <GlassCard className="p-5">
              <SectionHeader title="Pitch Outcomes" description="Accepted, rejected, and total pitches for fast editorial feedback." />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#db2777" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function toSpotifyUrl(value: string) {
  if (value.startsWith("https://open.spotify.com/")) return value;
  const [, type, id] = value.match(/^spotify:(track|album):([A-Za-z0-9]+)$/) || [];
  return type && id ? `https://open.spotify.com/${type}/${id}` : value;
}

function Field(props: { name: string; label: string; placeholder?: string; defaultValue?: string; type?: string }) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Input name={props.name} type={props.type || "text"} placeholder={props.placeholder} defaultValue={props.defaultValue || ""} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "accepted" || status === "approved"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "rejected"
        ? "bg-red-100 text-red-800 border-red-200"
        : status === "sent_to_curators"
          ? "bg-purple-100 text-purple-800 border-purple-200"
          : "bg-blue-100 text-blue-800 border-blue-200";
  return <Badge variant="outline" className={`capitalize ${className}`}>{status.replace(/_/g, " ")}</Badge>;
}
