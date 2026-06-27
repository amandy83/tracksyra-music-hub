import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, LineChart, Plus, RefreshCw, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Line, LineChart as ReLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Placement = any;
type AdminMetric = any;
type GenreMetric = any;

const client = supabase as any;

const blankSnapshot = {
  streams: 0,
  listeners: 0,
  saves: 0,
  followers: 0,
  playlist_followers: 0,
  collected_at: new Date().toISOString().slice(0, 16),
};

export default function AdminPlaylistAnalytics() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [analytics, setAnalytics] = useState<AdminMetric[]>([]);
  const [genres, setGenres] = useState<GenreMetric[]>([]);
  const [query, setQuery] = useState("");
  const [snapshotPlacement, setSnapshotPlacement] = useState<Placement | null>(null);
  const [snapshot, setSnapshot] = useState(blankSnapshot);
  const [removalNotes, setRemovalNotes] = useState("");

  const load = async () => {
    const [placementResult, analyticsResult, genreResult] = await Promise.all([
      client.from("playlist_performance_artist_dashboard").select("*").order("placement_date", { ascending: false }),
      client.from("playlist_performance_admin_analytics").select("*").order("average_effectiveness_score", { ascending: false }),
      client.from("playlist_genre_performance_admin").select("*").order("average_effectiveness_score", { ascending: false }),
    ]);
    if (placementResult.error) toast.error(placementResult.error.message);
    if (analyticsResult.error) toast.error(analyticsResult.error.message);
    if (genreResult.error) toast.error(genreResult.error.message);
    setPlacements(placementResult.data || []);
    setAnalytics(analyticsResult.data || []);
    setGenres(genreResult.data || []);
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-playlist-analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_placements" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_performance_snapshots" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_campaign_metrics" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredPlacements = useMemo(() => placements.filter((item) => {
    const haystack = [item.playlist_name, item.curator_name, item.release_title, item.track_title, item.genre, item.territory, item.placement_status].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [placements, query]);

  const totals = useMemo(() => ({
    placements: placements.length,
    active: placements.filter((item) => item.placement_status === "active").length,
    streams: placements.reduce((sum, item) => sum + Number(item.streams_gained || 0), 0),
    reach: placements.reduce((sum, item) => sum + Number(item.estimated_reach || 0), 0),
    accepted: analytics.reduce((sum, item) => sum + Number(item.placements || 0), 0),
  }), [placements, analytics]);

  const topCurators = Object.values(analytics.reduce<Record<string, any>>((acc, row) => {
    const key = row.curator_id || row.curator_name;
    acc[key] ||= { name: row.curator_name, streams: 0, placements: 0, score: 0 };
    acc[key].streams += Number(row.streams_gained || 0);
    acc[key].placements += Number(row.placements || 0);
    acc[key].score = Math.max(acc[key].score, Number(row.average_effectiveness_score || 0));
    return acc;
  }, {})).sort((a, b) => b.score - a.score).slice(0, 8);

  const topPlaylists = analytics.filter((row) => row.playlist_name).slice(0, 8).map((row) => ({
    name: row.playlist_name,
    streams: Number(row.streams_gained || 0),
    score: Number(row.average_effectiveness_score || 0),
  }));

  const genreBars = genres.slice(0, 8).map((row) => ({
    genre: row.genre,
    streams: Number(row.streams_gained || 0),
    score: Number(row.average_effectiveness_score || 0),
  }));

  const trendBars = analytics.slice(0, 10).map((row) => ({
    name: row.curator_name,
    acceptance: Number(row.acceptance_rate || 0),
    growth: Number(row.average_stream_growth_percent || 0),
  }));

  const saveSnapshot = async () => {
    if (!snapshotPlacement) return;
    const { error } = await client.from("playlist_performance_snapshots").insert({
      placement_id: snapshotPlacement.placement_id,
      release_id: snapshotPlacement.release_id,
      track_id: snapshotPlacement.track_id,
      streams: Number(snapshot.streams || 0),
      listeners: Number(snapshot.listeners || 0),
      saves: Number(snapshot.saves || 0),
      followers: Number(snapshot.followers || 0),
      playlist_followers: Number(snapshot.playlist_followers || 0),
      collected_at: new Date(snapshot.collected_at).toISOString(),
      source: "manual",
    });
    if (error) return toast.error(error.message);
    toast.success("Performance snapshot recorded.");
    setSnapshotPlacement(null);
    setSnapshot(blankSnapshot);
    await load();
  };

  const markRemoved = async (placement: Placement) => {
    const { error } = await client.from("playlist_placements").update({
      placement_status: "removed",
      removal_date: new Date().toISOString(),
      notes: removalNotes || placement.notes,
    }).eq("id", placement.placement_id);
    if (error) return toast.error(error.message);
    toast.success("Placement marked removed.");
    setSnapshotPlacement(null);
    setRemovalNotes("");
    await load();
  };

  const recalc = async (placement: Placement) => {
    const { error } = await client.rpc("refresh_playlist_placement_metrics", { p_placement_id: placement.placement_id });
    if (error) return toast.error(error.message);
    toast.success("Metrics refreshed.");
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Placements" value={totals.placements} />
        <Metric label="Active" value={totals.active} />
        <Metric label="Streams Gained" value={totals.streams.toLocaleString()} />
        <Metric label="Reach" value={totals.reach.toLocaleString()} />
        <Metric label="Accepted" value={totals.accepted} />
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search placements, curators, playlists, releases, genres" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="placements"><Activity className="w-4 h-4 mr-1" />Placements ({filteredPlacements.length})</TabsTrigger>
          <TabsTrigger value="genres"><LineChart className="w-4 h-4 mr-1" />Genres</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Top Curators">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topCurators}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="streams" fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Top Playlists">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topPlaylists}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" hide />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="score" fill="#14b8a6" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Acceptance Trends">
              <ResponsiveContainer width="100%" height={280}>
                <ReLineChart data={trendBars}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" hide />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="acceptance" stroke="#ec4899" />
                  <Line type="monotone" dataKey="growth" stroke="#14b8a6" />
                </ReLineChart>
              </ResponsiveContainer>
            </ChartCard>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Placement Effectiveness</h3>
              <div className="space-y-2">
                {analytics.slice(0, 6).map((row) => (
                  <div key={`${row.curator_id}-${row.playlist_id || row.genre}`} className="rounded border p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{row.playlist_name || row.curator_name}</p>
                      <p className="text-muted-foreground truncate">{row.genre} - {Number(row.placements || 0)} placements</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{Number(row.average_effectiveness_score || 0).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground">score</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="placements" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredPlacements.map((placement) => (
              <Card key={placement.placement_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{placement.playlist_name || placement.curator_name}</h3>
                      <Badge className="capitalize" variant={placement.placement_status === "active" ? "default" : "secondary"}>{placement.placement_status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{placement.release_title} - {placement.track_title}</p>
                    <p className="text-xs text-muted-foreground">{placement.curator_name} - {placement.genre || "Genre"} - {placement.territory || "Global"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => recalc(placement)}><RefreshCw className="w-4 h-4" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <Mini label="Streams" value={Number(placement.streams_gained || 0).toLocaleString()} />
                  <Mini label="Listeners" value={Number(placement.listeners_gained || 0).toLocaleString()} />
                  <Mini label="Saves" value={Number(placement.saves_gained || 0).toLocaleString()} />
                  <Mini label="Growth" value={`${Number(placement.stream_growth_percent || 0)}%`} />
                  <Mini label="Reach" value={Number(placement.estimated_reach || 0).toLocaleString()} />
                  <Mini label="Score" value={Number(placement.effectiveness_score || 0).toFixed(0)} />
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => setSnapshotPlacement(placement)}><Plus className="w-4 h-4 mr-1" />Snapshot</Button>
                  {placement.placement_status !== "removed" && (
                    <Button size="sm" variant="outline" onClick={() => setSnapshotPlacement({ ...placement, removeMode: true })}>Mark Removed</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="genres" className="mt-4">
          <ChartCard title="Highest Performing Genres">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={genreBars}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="genre" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="streams" fill="#ec4899" />
                <Bar dataKey="score" fill="#14b8a6" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>
      </Tabs>

      <Dialog open={!!snapshotPlacement} onOpenChange={(open) => !open && setSnapshotPlacement(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{snapshotPlacement?.removeMode ? "Remove Placement" : "Add Performance Snapshot"}</DialogTitle></DialogHeader>
          {snapshotPlacement?.removeMode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{snapshotPlacement.playlist_name || snapshotPlacement.curator_name} - {snapshotPlacement.track_title}</p>
              <div>
                <Label>Removal Notes</Label>
                <Textarea rows={4} value={removalNotes} onChange={(event) => setRemovalNotes(event.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button variant="destructive" onClick={() => markRemoved(snapshotPlacement)}>Mark Removed</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Streams" value={snapshot.streams} onChange={(value) => setSnapshot({ ...snapshot, streams: value })} />
              <Field label="Listeners" value={snapshot.listeners} onChange={(value) => setSnapshot({ ...snapshot, listeners: value })} />
              <Field label="Saves" value={snapshot.saves} onChange={(value) => setSnapshot({ ...snapshot, saves: value })} />
              <Field label="Track Followers" value={snapshot.followers} onChange={(value) => setSnapshot({ ...snapshot, followers: value })} />
              <Field label="Playlist Followers" value={snapshot.playlist_followers} onChange={(value) => setSnapshot({ ...snapshot, playlist_followers: value })} />
              <div>
                <Label>Collected At</Label>
                <Input type="datetime-local" value={snapshot.collected_at} onChange={(event) => setSnapshot({ ...snapshot, collected_at: event.target.value })} />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button variant="hero" onClick={saveSnapshot}><TrendingUp className="w-4 h-4 mr-2" />Save Snapshot</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></Card>;
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border bg-background p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="p-4"><h3 className="font-semibold mb-3">{title}</h3>{children}</Card>;
}

function Field(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Input type="number" min={0} value={props.value} onChange={(event) => props.onChange(Number(event.target.value || 0))} />
    </div>
  );
}
