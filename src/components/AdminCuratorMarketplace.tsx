import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, FileUp, ListPlus, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Curator = any;
type Playlist = any;
type Outreach = any;
type Analytics = {
  total_curators: number;
  verified_curators: number;
  active_curators?: number;
  active_playlists: number;
  total_followers_represented: number;
  average_response_hours?: number;
  marketplace_growth_30d: number;
};

const client = supabase as any;
const blankCurator = {
  curator_name: "",
  company_name: "",
  email: "",
  instagram_url: "",
  tiktok_url: "",
  website_url: "",
  spotify_profile_url: "",
  country: "",
  territory: "",
  bio: "",
};
const blankPlaylist = {
  playlist_name: "",
  spotify_playlist_url: "",
  spotify_playlist_id: "",
  followers: 0,
  genre: "",
  mood: "",
  territory: "",
  curator_id: "",
};

export default function AdminCuratorMarketplace() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [curators, setCurators] = useState<Curator[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>({ total_curators: 0, verified_curators: 0, active_playlists: 0, total_followers_represented: 0, marketplace_growth_30d: 0 });
  const [query, setQuery] = useState("");
  const [selectedCurator, setSelectedCurator] = useState<Curator | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [curatorDialogOpen, setCuratorDialogOpen] = useState(false);
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [curatorForm, setCuratorForm] = useState(blankCurator);
  const [playlistForm, setPlaylistForm] = useState(blankPlaylist);

  const load = async () => {
    const [curatorResult, playlistResult, outreachResult, analyticsResult] = await Promise.all([
      client.from("playlist_curator_marketplace").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      client.from("curator_playlists").select("*").is("deleted_at", null).order("followers", { ascending: false }),
      client.from("curator_outreach_artist_dashboard").select("*").order("created_at", { ascending: false }),
      client.from("curator_marketplace_admin_analytics").select("*").maybeSingle(),
    ]);
    if (curatorResult.error) toast.error(curatorResult.error.message);
    if (playlistResult.error) toast.error(playlistResult.error.message);
    if (outreachResult.error) toast.error(outreachResult.error.message);
    setCurators(curatorResult.data || []);
    setPlaylists(playlistResult.data || []);
    setOutreach(outreachResult.data || []);
    setAnalytics((analyticsResult.data || {}) as Analytics);
  };

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-curator-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_curator_marketplace" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "curator_playlists" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "curator_outreach_history" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredCurators = useMemo(() => curators.filter((curator) => {
    const haystack = [curator.curator_name, curator.company_name, curator.email, curator.spotify_profile_url, curator.country, curator.territory].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [curators, query]);

  const filteredPlaylists = useMemo(() => playlists.filter((playlist) => {
    const curator = curators.find((item) => item.id === playlist.curator_id);
    const haystack = [playlist.playlist_name, playlist.spotify_playlist_url, playlist.genre, playlist.mood, playlist.territory, curator?.curator_name].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }), [playlists, curators, query]);

  const duplicates = useMemo(() => {
    const byPlaylistUrl = repeated(playlists.map((item) => item.spotify_playlist_url).filter(Boolean));
    const byEmail = repeated(curators.map((item) => item.email).filter(Boolean));
    const byProfile = repeated(curators.map((item) => item.spotify_profile_url).filter(Boolean));
    return { byPlaylistUrl, byEmail, byProfile, total: byPlaylistUrl.length + byEmail.length + byProfile.length };
  }, [curators, playlists]);

  const saveCurator = async () => {
    if (!curatorForm.curator_name.trim()) return toast.error("Curator name is required.");
    const payload = clean({
      ...curatorForm,
      approval_status: "approved",
      active: true,
    });
    const request = selectedCurator
      ? client.from("playlist_curator_marketplace").update(payload).eq("id", selectedCurator.id)
      : client.from("playlist_curator_marketplace").insert(payload);
    const { error } = await request;
    if (error) return toast.error(error.message);
    toast.success(selectedCurator ? "Curator updated." : "Curator added.");
    setSelectedCurator(null);
    setCuratorForm(blankCurator);
    setCuratorDialogOpen(false);
    await load();
  };

  const savePlaylist = async () => {
    if (!playlistForm.curator_id || !playlistForm.playlist_name.trim() || !playlistForm.spotify_playlist_url.trim()) {
      return toast.error("Curator, playlist name, and Spotify URL are required.");
    }
    const payload = clean({
      ...playlistForm,
      followers: Number(playlistForm.followers || 0),
      active: true,
    });
    const request = selectedPlaylist
      ? client.from("curator_playlists").update(payload).eq("id", selectedPlaylist.id)
      : client.from("curator_playlists").insert(payload);
    const { error } = await request;
    if (error) return toast.error(error.message);
    toast.success(selectedPlaylist ? "Playlist updated." : "Playlist added.");
    setSelectedPlaylist(null);
    setPlaylistForm(blankPlaylist);
    setPlaylistDialogOpen(false);
    await load();
  };

  const updateCurator = async (curator: Curator, patch: Record<string, unknown>) => {
    const { error } = await client.from("playlist_curator_marketplace").update(patch).eq("id", curator.id);
    if (error) return toast.error(error.message);
    toast.success("Curator updated.");
    await load();
  };

  const updatePlaylist = async (playlist: Playlist, patch: Record<string, unknown>) => {
    const { error } = await client.from("curator_playlists").update(patch).eq("id", playlist.id);
    if (error) return toast.error(error.message);
    toast.success("Playlist updated.");
    await load();
  };

  const respondToOutreach = async (item: Outreach, status: string) => {
    const feedback = prompt("Curator feedback (optional):") || null;
    const { error } = await client.rpc("record_curator_outreach_response", {
      p_outreach_id: item.id,
      p_status: status,
      p_curator_feedback: feedback,
      p_notes: null,
    });
    if (error) return toast.error(error.message);
    toast.success("Outreach response recorded.");
    await load();
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (!rows.length) return toast.error("CSV has no rows.");
    let importedCurators = 0;
    let importedPlaylists = 0;
    for (const row of rows) {
      const curatorName = row.curator_name || row.name || row.curator;
      if (!curatorName) continue;
      let curator = curators.find((item) => item.email?.toLowerCase() === row.email?.toLowerCase() || item.spotify_profile_url?.toLowerCase() === row.spotify_profile_url?.toLowerCase());
      if (!curator) {
        const { data, error } = await client.from("playlist_curator_marketplace").insert(clean({
          curator_name: curatorName,
          company_name: row.company_name,
          email: row.email,
          spotify_profile_url: row.spotify_profile_url,
          instagram_url: row.instagram_url,
          tiktok_url: row.tiktok_url,
          website_url: row.website_url,
          country: row.country,
          territory: row.territory,
          bio: row.bio,
          approval_status: "approved",
          active: true,
        })).select("*").single();
        if (error) {
          toast.error(error.message);
          continue;
        }
        curator = data;
        importedCurators += 1;
      }
      if (row.playlist_name && row.spotify_playlist_url) {
        const exists = playlists.some((item) => item.spotify_playlist_url?.toLowerCase() === row.spotify_playlist_url.toLowerCase());
        if (!exists) {
          const { error } = await client.from("curator_playlists").insert(clean({
            curator_id: curator.id,
            playlist_name: row.playlist_name,
            spotify_playlist_url: row.spotify_playlist_url,
            spotify_playlist_id: row.spotify_playlist_id,
            followers: Number(row.followers || 0),
            genre: row.genre,
            mood: row.mood,
            territory: row.playlist_territory || row.territory,
            active: true,
          }));
          if (!error) importedPlaylists += 1;
        }
      }
    }
    toast.success(`Imported ${importedCurators} curators and ${importedPlaylists} playlists.`);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const openCurator = (curator?: Curator) => {
    setSelectedCurator(curator || null);
    setCuratorForm(curator ? { ...blankCurator, ...curator } : blankCurator);
    setCuratorDialogOpen(true);
  };

  const openPlaylist = (playlist?: Playlist) => {
    setSelectedPlaylist(playlist || null);
    setPlaylistForm(playlist ? { ...blankPlaylist, ...playlist } : blankPlaylist);
    setPlaylistDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Metric label="Total Curators" value={analytics.total_curators || 0} />
        <Metric label="Verified" value={analytics.verified_curators || 0} />
        <Metric label="Active Curators" value={analytics.active_curators || 0} />
        <Metric label="Playlist Reach" value={Number(analytics.total_followers_represented || 0).toLocaleString()} />
        <Metric label="Avg Response" value={`${Number(analytics.average_response_hours || 0).toFixed(1)}h`} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search curators, playlists, emails, Spotify URLs" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Button variant="outline" onClick={() => openCurator()}><ListPlus className="w-4 h-4 mr-2" />Add Curator</Button>
          <Button variant="outline" onClick={() => openPlaylist()}><ListPlus className="w-4 h-4 mr-2" />Add Playlist</Button>
          <div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => event.target.files?.[0] && void importCsv(event.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp className="w-4 h-4 mr-2" />CSV Import</Button>
          </div>
        </div>
        {duplicates.total > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Duplicate detection: {duplicates.byPlaylistUrl.length} playlist URL, {duplicates.byEmail.length} email, {duplicates.byProfile.length} Spotify profile duplicates.
          </div>
        )}
      </Card>

      <Tabs defaultValue="curators">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="curators">Curators ({filteredCurators.length})</TabsTrigger>
          <TabsTrigger value="playlists">Playlists ({filteredPlaylists.length})</TabsTrigger>
          <TabsTrigger value="outreach">Outreach ({outreach.length})</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates ({duplicates.total})</TabsTrigger>
        </TabsList>

        <TabsContent value="curators" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredCurators.map((curator) => (
              <Card key={curator.id} className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{curator.curator_name}</h3>
                      {curator.verified && <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline"><ShieldCheck className="w-3 h-3 mr-1" />Verified</Badge>}
                      <Badge variant="secondary">{curator.approval_status}</Badge>
                      {!curator.active && <Badge variant="destructive">Inactive</Badge>}
                      {curator.suspended && <Badge variant="destructive">Suspended</Badge>}
                      <Badge variant="outline" className="capitalize">{curator.curator_level || "bronze"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{curator.company_name || "Independent"} - {curator.email || "No email"}</p>
                    <p className="text-sm text-muted-foreground">{curator.country || curator.territory || "Global"} - {Number(curator.total_followers || 0).toLocaleString()} followers represented</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openCurator(curator)}>Edit</Button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
                  <Mini label="Accept" value={`${Number(curator.acceptance_rate || 0)}%`} />
                  <Mini label="Response" value={`${Number(curator.response_rate || 0)}%`} />
                  <Mini label="Playlists" value={curator.total_playlists || 0} />
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => updateCurator(curator, { approval_status: "approved", rejection_reason: null })}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCurator(curator, { approval_status: "rejected", rejection_reason: prompt("Rejection reason:") || null })}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCurator(curator, { verified: !curator.verified, verified_at: !curator.verified ? new Date().toISOString() : null })}>Verify</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCurator(curator, { suspended: !curator.suspended, active: curator.suspended, suspended_at: !curator.suspended ? new Date().toISOString() : null, suspension_reason: !curator.suspended ? prompt("Suspension reason:") || null : null })}>{curator.suspended ? "Unsuspend" : "Suspend"}</Button>
                  <Button size="sm" variant="outline" onClick={() => updateCurator(curator, { active: !curator.active })}>{curator.active ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="destructive" onClick={() => updateCurator(curator, { deleted_at: new Date().toISOString(), active: false })}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="playlists" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredPlaylists.map((playlist) => {
              const curator = curators.find((item) => item.id === playlist.curator_id);
              return (
                <Card key={playlist.id} className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{playlist.playlist_name}</h3>
                        {playlist.verified && <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline">Verified</Badge>}
                        {!playlist.active && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{curator?.curator_name || "Curator"} - {playlist.genre || "Genre"} - {playlist.territory || "Global"}</p>
                      <p className="text-sm text-muted-foreground">{Number(playlist.followers || 0).toLocaleString()} followers</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openPlaylist(playlist)}>Edit</Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button size="sm" variant="outline" onClick={() => updatePlaylist(playlist, { verified: !playlist.verified, last_checked_at: new Date().toISOString() })}>Verify</Button>
                    <Button size="sm" variant="outline" onClick={() => updatePlaylist(playlist, { active: !playlist.active })}>{playlist.active ? "Deactivate" : "Activate"}</Button>
                    <Button size="sm" variant="destructive" onClick={() => updatePlaylist(playlist, { deleted_at: new Date().toISOString(), active: false })}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="outreach" className="mt-4">
          <div className="space-y-3">
            {outreach.map((item) => (
              <Card key={item.id} className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{item.playlist_name || item.curator_name}</h3>
                      <Badge variant="outline" className="capitalize">{item.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.release_title} - {item.track_title}</p>
                    {item.curator_feedback && <p className="text-xs rounded bg-muted p-2 mt-2">{item.curator_feedback}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => respondToOutreach(item, "responded")}>Responded</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => respondToOutreach(item, "accepted")}>Accepted</Button>
                    <Button size="sm" variant="destructive" onClick={() => respondToOutreach(item, "rejected")}>Rejected</Button>
                    <Button size="sm" variant="outline" onClick={() => respondToOutreach(item, "expired")}>Expired</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          <Card className="p-4 space-y-3">
            <DuplicateBlock label="Spotify playlist URLs" values={duplicates.byPlaylistUrl} />
            <DuplicateBlock label="Curator emails" values={duplicates.byEmail} />
            <DuplicateBlock label="Spotify profiles" values={duplicates.byProfile} />
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={curatorDialogOpen} onOpenChange={(open) => { setCuratorDialogOpen(open); if (!open) { setSelectedCurator(null); setCuratorForm(blankCurator); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedCurator ? "Edit Curator" : "Add Curator"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Curator Name" value={curatorForm.curator_name} onChange={(value) => setCuratorForm({ ...curatorForm, curator_name: value })} />
            <Field label="Company" value={curatorForm.company_name} onChange={(value) => setCuratorForm({ ...curatorForm, company_name: value })} />
            <Field label="Email" value={curatorForm.email} onChange={(value) => setCuratorForm({ ...curatorForm, email: value })} />
            <Field label="Country" value={curatorForm.country} onChange={(value) => setCuratorForm({ ...curatorForm, country: value })} />
            <Field label="Territory" value={curatorForm.territory} onChange={(value) => setCuratorForm({ ...curatorForm, territory: value })} />
            <Field label="Spotify Profile" value={curatorForm.spotify_profile_url} onChange={(value) => setCuratorForm({ ...curatorForm, spotify_profile_url: value })} />
            <Field label="Instagram" value={curatorForm.instagram_url} onChange={(value) => setCuratorForm({ ...curatorForm, instagram_url: value })} />
            <Field label="TikTok" value={curatorForm.tiktok_url} onChange={(value) => setCuratorForm({ ...curatorForm, tiktok_url: value })} />
            <Field label="Website" value={curatorForm.website_url} onChange={(value) => setCuratorForm({ ...curatorForm, website_url: value })} />
            <div className="sm:col-span-2">
              <Label>Bio</Label>
              <Textarea rows={4} value={curatorForm.bio || ""} onChange={(event) => setCuratorForm({ ...curatorForm, bio: event.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="hero" onClick={saveCurator}>Save Curator</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={playlistDialogOpen} onOpenChange={(open) => { setPlaylistDialogOpen(open); if (!open) { setSelectedPlaylist(null); setPlaylistForm(blankPlaylist); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedPlaylist ? "Edit Playlist" : "Add Playlist"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Curator</Label>
              <Select value={playlistForm.curator_id} onValueChange={(value) => setPlaylistForm({ ...playlistForm, curator_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select curator" /></SelectTrigger>
                <SelectContent>{curators.map((curator) => <SelectItem key={curator.id} value={curator.id}>{curator.curator_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Field label="Playlist Name" value={playlistForm.playlist_name} onChange={(value) => setPlaylistForm({ ...playlistForm, playlist_name: value })} />
            <Field label="Spotify URL" value={playlistForm.spotify_playlist_url} onChange={(value) => setPlaylistForm({ ...playlistForm, spotify_playlist_url: value })} />
            <Field label="Spotify ID" value={playlistForm.spotify_playlist_id} onChange={(value) => setPlaylistForm({ ...playlistForm, spotify_playlist_id: value })} />
            <Field label="Followers" type="number" value={String(playlistForm.followers || 0)} onChange={(value) => setPlaylistForm({ ...playlistForm, followers: Number(value) })} />
            <Field label="Genre" value={playlistForm.genre} onChange={(value) => setPlaylistForm({ ...playlistForm, genre: value })} />
            <Field label="Mood" value={playlistForm.mood} onChange={(value) => setPlaylistForm({ ...playlistForm, mood: value })} />
            <Field label="Territory" value={playlistForm.territory} onChange={(value) => setPlaylistForm({ ...playlistForm, territory: value })} />
          </div>
          <div className="flex justify-end">
            <Button variant="hero" onClick={savePlaylist}>Save Playlist</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function clean(input: Record<string, any>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]));
}

function repeated(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return;
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  });
  return Array.from(duplicates);
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]));
  });
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></Card>;
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border bg-background p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}

function DuplicateBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h3 className="font-semibold">{label}</h3>
      {values.length === 0 ? <p className="text-sm text-muted-foreground">No duplicates.</p> : values.map((value) => <p key={value} className="text-sm text-amber-800">{value}</p>)}
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <Label>{props.label}</Label>
      <Input type={props.type || "text"} value={props.value || ""} onChange={(event) => props.onChange(event.target.value)} />
    </div>
  );
}
