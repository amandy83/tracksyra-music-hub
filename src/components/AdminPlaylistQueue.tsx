import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Filter, Send, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type Pitch = any;
type Curator = any;
type Assignment = any;
type CuratorRecommendation = {
  curator_id: string;
  curator_name?: string;
  playlist_id?: string | null;
  playlist_name?: string | null;
  match_score?: number | string | null;
  match_reasons?: string[];
  estimated_reach?: number | string | null;
};
type AdminAnalytics = {
  total_pitches: number;
  accepted_pitches: number;
  rejected_pitches: number;
  pitch_success_rate: number;
  playlist_reach: number;
  curator_acceptance_rate: number;
};

const client = supabase as any;
const STATUSES = ["draft", "submitted", "under_review", "approved", "sent_to_curators", "accepted", "rejected"];
const blankCurator = {
  curator_name: "",
  email: "",
  company_name: "",
  spotify_profile_url: "",
  country: "",
  territory: "",
  notes: "",
};

export default function AdminPlaylistQueue() {
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [curators, setCurators] = useState<Curator[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<Pitch | null>(null);
  const [status, setStatus] = useState("all");
  const [genre, setGenre] = useState("all");
  const [territory, setTerritory] = useState("all");
  const [search, setSearch] = useState("");
  const [curatorId, setCuratorId] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState(50);
  const [newCurator, setNewCurator] = useState(blankCurator);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [pitchResult, curatorResult, assignmentResult, analyticsResult] = await Promise.all([
      client.from("playlist_pitch_admin_queue").select("*").order("created_at", { ascending: false }),
      client.from("playlist_curator_marketplace").select("*").eq("approval_status", "approved").eq("active", true).eq("verified", true).eq("suspended", false).is("deleted_at", null).order("acceptance_rate", { ascending: false }),
      client.from("curator_deliveries").select("*").order("created_at", { ascending: false }),
      client.from("free_playlist_pitch_admin_analytics").select("*").maybeSingle(),
    ]);
    const playlistResult = await client.from("curator_playlists").select("*").eq("active", true).eq("verified", true).eq("is_public", true).eq("verification_status", "verified").is("deleted_at", null).order("followers", { ascending: false });
    if (pitchResult.error) {
      const fallback = await supabase.from("playlist_pitches").select("*").order("created_at", { ascending: false });
      setPitches(fallback.data || []);
    } else {
      setPitches(pitchResult.data || []);
    }
    if (curatorResult.error) toast.error(curatorResult.error.message);
    if (assignmentResult.error) toast.error(assignmentResult.error.message);
    if (playlistResult.error) toast.error(playlistResult.error.message);
    setCurators(curatorResult.data || []);
    setPlaylists(playlistResult.data || []);
    setAssignments(assignmentResult.data || []);
    if (!analyticsResult.error) setAdminAnalytics(analyticsResult.data || null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-playlist-pitching")
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_pitches" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "curator_deliveries" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "curator_responses" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "curator_playlist_additions" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => pitches.filter((pitch) => {
    const haystack = [pitch.release_title, pitch.track_title, pitch.primary_artist, pitch.artist_name, pitch.genre, pitch.territory, pitch.spotify_uri].join(" ").toLowerCase();
    return (status === "all" || pitch.status === status)
      && (genre === "all" || pitch.genre === genre)
      && (territory === "all" || pitch.territory === territory)
      && (!search || haystack.includes(search.toLowerCase()));
  }), [pitches, status, genre, territory, search]);

  const metrics = {
    total: pitches.length,
    submitted: pitches.filter((pitch) => pitch.status === "submitted").length,
    accepted: pitches.filter((pitch) => pitch.status === "accepted").length,
    rejected: pitches.filter((pitch) => pitch.status === "rejected").length,
    reach: pitches.reduce((sum, pitch) => sum + Number(pitch.estimated_playlist_reach || 0), 0),
  };

  const chart = [
    { name: "Submitted", value: metrics.submitted },
    { name: "Accepted", value: metrics.accepted },
    { name: "Rejected", value: metrics.rejected },
  ];

  const review = async (pitch: Pitch, action: string) => {
    const note = action === "reject" ? prompt("Rejection reason:") : prompt("Internal notes (optional):");
    if (action === "reject" && !note?.trim()) return toast.error("Rejection reason is required.");
    const { error } = await client.rpc("review_playlist_pitch", {
      p_pitch_id: pitch.id,
      p_action: action,
      p_admin_notes: note || null,
      p_priority_score: Number(pitch.priority_score || priority),
    });
    if (error) return toast.error(error.message);
    toast.success(`Pitch ${action.replace(/_/g, " ")}`);
    await load();
  };

  const assignCurator = async () => {
    if (!selected || !curatorId) return toast.error("Select a curator.");
    const playlist = playlists.find((item) => item.curator_id === curatorId) || null;
    const { error } = await client.rpc("force_assign_playlist_pitch_curator", {
      p_pitch_id: selected.id,
      p_curator_id: curatorId,
      p_playlist_id: playlist?.id || null,
      p_internal_notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Curator assigned.");
    setCuratorId("");
    setNotes("");
    await load();
  };

  const assignRecommendedCurator = async (pitch: Pitch, recommendation: any) => {
    const { error } = await client.rpc("force_assign_playlist_pitch_curator", {
      p_pitch_id: pitch.id,
      p_curator_id: recommendation.curator_id,
      p_playlist_id: recommendation.playlist_id || null,
      p_internal_notes: `AI match ${Number(recommendation.match_score || 0).toFixed(0)}: ${(recommendation.match_reasons || []).join(", ")}`,
    });
    if (error) return toast.error(error.message);
    toast.success("Recommended curator assigned.");
    await load();
  };

  const recordResponse = async (assignment: Assignment, responseStatus: string) => {
    const responseNotes = prompt("Curator response notes (optional):") || null;
    const playlistName = responseStatus === "playlist_added" ? prompt("Playlist add confirmation - playlist name:") || null : null;
    const playlistUrl = responseStatus === "playlist_added" ? prompt("Playlist URL (required):") || null : null;
    const playlistId = responseStatus === "playlist_added" ? prompt("Playlist ID (required):") || null : null;
    const reach = responseStatus === "playlist_added" ? Number(prompt("Estimated reach:", "0") || 0) : 0;
    const { error } = await client.rpc("record_curator_delivery_action", {
      p_delivery_id: assignment.id,
      p_action: responseStatus,
      p_response_notes: responseNotes,
      p_requested_information: responseStatus === "request_more_information" ? responseNotes : null,
      p_playlist_url: playlistUrl,
      p_playlist_id: playlistId,
      p_playlist_name: playlistName,
      p_estimated_reach: reach,
    });
    if (error) return toast.error(error.message);
    toast.success("Curator response recorded.");
    await load();
  };

  const saveCurator = async () => {
    if (!newCurator.curator_name.trim()) return toast.error("Curator name is required.");
    const { error } = await client.from("playlist_curator_marketplace").insert({
      curator_name: newCurator.curator_name.trim(),
      email: newCurator.email.trim() || null,
      company_name: newCurator.company_name.trim() || null,
      spotify_profile_url: newCurator.spotify_profile_url.trim() || null,
      country: newCurator.country.trim() || null,
      territory: newCurator.territory.trim() || null,
      bio: newCurator.notes.trim() || null,
      approval_status: "approved",
      active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Marketplace curator profile created.");
    setNewCurator(blankCurator);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Total Pitches" value={metrics.total} />
        <Metric label="Submitted" value={metrics.submitted} />
        <Metric label="Accepted" value={metrics.accepted} />
        <Metric label="Rejected" value={metrics.rejected} />
        <Metric label="Estimated Reach" value={metrics.reach.toLocaleString()} />
      </div>
      {adminAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Metric label="Pitch Success Rate" value={`${Number(adminAnalytics.pitch_success_rate || 0)}%`} />
          <Metric label="Playlist Reach" value={Number(adminAnalytics.playlist_reach || 0).toLocaleString()} />
          <Metric label="Curator Acceptance" value={`${Number(adminAnalytics.curator_acceptance_rate || 0)}%`} />
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Queue Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Search release, artist, URI" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((item) => <SelectItem key={item} value={item}>{item.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genres</SelectItem>
              {unique(pitches.map((pitch) => pitch.genre).filter(Boolean)).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={territory} onValueChange={setTerritory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All territories</SelectItem>
              {unique(pitches.map((pitch) => pitch.territory).filter(Boolean)).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-3">
          {loading ? <Card className="p-8 text-center text-muted-foreground">Loading playlist queue...</Card> : null}
          {!loading && filtered.length === 0 ? <Card className="p-8 text-center text-muted-foreground border-dashed">No playlist pitches match.</Card> : null}
          {filtered.map((pitch) => (
            <Card key={pitch.id} className="p-4">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{pitch.release_title || "Release"}</h3>
                    <StatusBadge status={pitch.status} />
                    <Badge variant="secondary">Priority {pitch.priority_score || 50}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{pitch.track_title || "Track"} • {pitch.primary_artist || pitch.artist_name || "Artist"}</p>
                  <p className="text-sm text-muted-foreground">{pitch.genre || "Genre"} • {pitch.territory || "Territory"} • Response {pitch.curator_response_rate || 0}%</p>
                  <p className="text-xs text-muted-foreground">{pitch.mood || pitch.mood_tags?.[0] || "Mood"} - {pitch.language || "Language"} - {pitch.artist_country || "Country"}{pitch.curator_match_score > 0 ? ` - AI match ${Number(pitch.curator_match_score).toFixed(0)}` : ""}</p>
                  <p className="text-sm mt-2 line-clamp-2">{pitch.pitch_story}</p>
                  {pitch.admin_notes && <p className="text-xs rounded bg-muted p-2 mt-2">Notes: {pitch.admin_notes}</p>}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button size="sm" variant="outline" onClick={() => setSelected(pitch)}>Review</Button>
                  {pitch.status === "submitted" && <Button size="sm" variant="outline" onClick={() => review(pitch, "under_review")}>Start Review</Button>}
                  {["submitted", "under_review"].includes(pitch.status) && (
                    <>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => review(pitch, "approve")}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => review(pitch, "reject")}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                    </>
                  )}
                  {pitch.status === "approved" && <Button size="sm" onClick={() => setSelected(pitch)}><UserPlus className="w-4 h-4 mr-1" />Assign</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Curator Profiles</h3>
            </div>
            <div className="space-y-3">
              {curators.slice(0, 6).map((curator) => (
                <div key={curator.id} className="rounded border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{curator.curator_name}</p>
                      <p className="text-xs text-muted-foreground">{curator.company_name || curator.email || "Independent curator"}</p>
                    </div>
                    <Badge variant="secondary">{Number(curator.acceptance_rate || 0)}%</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Country: {curator.country || "Global"}</p>
                  <p className="text-xs text-muted-foreground">Territory: {curator.territory || "Global"}</p>
                  <p className="text-xs text-muted-foreground">Reach: {Number(curator.total_followers || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              <Input placeholder="Curator name" value={newCurator.curator_name} onChange={(event) => setNewCurator({ ...newCurator, curator_name: event.target.value })} />
              <Input placeholder="Email" value={newCurator.email} onChange={(event) => setNewCurator({ ...newCurator, email: event.target.value })} />
              <Input placeholder="Company" value={newCurator.company_name} onChange={(event) => setNewCurator({ ...newCurator, company_name: event.target.value })} />
              <Input placeholder="Spotify profile URL" value={newCurator.spotify_profile_url} onChange={(event) => setNewCurator({ ...newCurator, spotify_profile_url: event.target.value })} />
              <Input placeholder="Country" value={newCurator.country} onChange={(event) => setNewCurator({ ...newCurator, country: event.target.value })} />
              <Input placeholder="Territory" value={newCurator.territory} onChange={(event) => setNewCurator({ ...newCurator, territory: event.target.value })} />
              <Textarea rows={2} placeholder="Internal curator notes" value={newCurator.notes} onChange={(event) => setNewCurator({ ...newCurator, notes: event.target.value })} />
              <Button type="button" variant="outline" onClick={saveCurator}><UserPlus className="w-4 h-4 mr-2" />Add Curator</Button>
            </div>
          </Card>

          <Card className="p-4 h-fit">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Outcomes</h3>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chart} dataKey="value" nameKey="name" outerRadius={80}>
                    {chart.map((_, index) => <Cell key={index} fill={["#2563eb", "#16a34a", "#dc2626"][index]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.release_title || "Playlist pitch"}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Info label="Status" value={selected.status} />
                <Info label="Genre" value={selected.genre || "—"} />
                <Info label="Territory" value={selected.territory || "—"} />
                <Info label="Track" value={selected.track_title || "—"} />
                <Info label="Budget" value={selected.campaign_budget ? `₹${Number(selected.campaign_budget).toLocaleString()}` : "—"} />
                <Info label="Reach" value={Number(selected.estimated_playlist_reach || 0).toLocaleString()} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Info label="Mood" value={selected.mood || selected.mood_tags?.join(", ") || "—"} />
                <Info label="Language" value={selected.language || "—"} />
                <Info label="Country" value={selected.artist_country || selected.territory || "—"} />
                <Info label="Similar Artists" value={selected.similar_artists || "—"} />
              </div>

              <div>
                <Label>Pitch Story</Label>
                <p className="text-sm whitespace-pre-wrap rounded border bg-background p-3">{selected.pitch_story}</p>
              </div>
              <div>
                <Label>Marketing Plan</Label>
                <p className="text-sm whitespace-pre-wrap rounded border bg-background p-3">{selected.marketing_plan || "—"}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-3">
                <div>
                  <Label>Internal Notes</Label>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Input type="number" min={0} max={100} value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <Label>Assign Curator</Label>
                  <Select value={curatorId} onValueChange={setCuratorId}>
                    <SelectTrigger><SelectValue placeholder="Select curator" /></SelectTrigger>
                    <SelectContent>
                      {curators.map((curator) => (
                        <SelectItem key={curator.id} value={curator.id}>
                          {curator.curator_name} - {curator.acceptance_rate}% - {Number(curator.total_followers || 0).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={assignCurator}><Send className="w-4 h-4 mr-2" />Assign</Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">AI Curator Recommendations</h3>
                {normalizeRecommendations(selected.curator_recommendations).length === 0 && (
                  <p className="text-sm text-muted-foreground">No recommendation data yet. Save or resubmit the pitch to refresh matching.</p>
                )}
                {normalizeRecommendations(selected.curator_recommendations).map((recommendation) => (
                  <div key={`${recommendation.curator_id}-${recommendation.playlist_id || "curator"}`} className="rounded border p-3 flex justify-between items-center gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{recommendation.curator_name}{recommendation.playlist_name ? ` - ${recommendation.playlist_name}` : ""}</p>
                      <p className="text-xs text-muted-foreground">
                        Score {Number(recommendation.match_score || 0).toFixed(0)} - {(recommendation.match_reasons || []).join(", ") || "profile match"} - Reach {Number(recommendation.estimated_reach || 0).toLocaleString()}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => assignRecommendedCurator(selected, recommendation)}>Assign</Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Deliveries</h3>
                {assignments.filter((assignment) => assignment.pitch_id === selected.id).length === 0 && (
                  <p className="text-sm text-muted-foreground">No curator deliveries yet.</p>
                )}
                {assignments.filter((assignment) => assignment.pitch_id === selected.id).map((assignment) => {
                  const curator = curators.find((item) => item.id === assignment.curator_id);
                  return (
                    <div key={assignment.id} className="rounded border p-3 flex justify-between items-center gap-3 flex-wrap">
                      <div>
                        <p className="font-medium">{curator?.curator_name || assignment.curator_id}</p>
                        <p className="text-xs text-muted-foreground">{assignment.status} - {assignment.internal_notes || "No notes"}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "opened")}>Opened</Button>
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "reviewed")}>Reviewed</Button>
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "accepted")}>Accepted</Button>
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "rejected")}>Rejected</Button>
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "request_more_information")}>More Info</Button>
                        <Button size="sm" variant="outline" onClick={() => recordResponse(assignment, "playlist_added")}>Playlist Added</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function normalizeRecommendations(value: unknown): CuratorRecommendation[] {
  if (Array.isArray(value)) return value as CuratorRecommendation[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as CuratorRecommendation[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-background p-3">
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
