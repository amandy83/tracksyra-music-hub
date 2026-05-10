import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Music, Upload, LogOut, Plus, BarChart3, IndianRupee, ListMusic, Megaphone, Video, Pencil, Trash2 } from "lucide-react";
import UploadSongDialog from "@/components/UploadSongDialog";
import EditSongDialog from "@/components/EditSongDialog";
import PlaylistPitchDialog from "@/components/PlaylistPitchDialog";
import AdCampaignDialog from "@/components/AdCampaignDialog";
import CanvasUploadDialog from "@/components/CanvasUploadDialog";
import { toast } from "sonner";

type Song = any;
type Pitch = any;
type Ad = any;
type Royalty = any;
type Analytics = any;

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [analytics, setAnalytics] = useState<Analytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUpload, setOpenUpload] = useState(false);
  const [openPitch, setOpenPitch] = useState(false);
  const [editPitch, setEditPitch] = useState<Pitch | null>(null);
  const [openAd, setOpenAd] = useState(false);
  const [openCanvas, setOpenCanvas] = useState(false);
  const [editSong, setEditSong] = useState<Song | null>(null);
  const [profile, setProfile] = useState<{ artist_name: string | null } | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [s, p, a, r, an, pr] = await Promise.all([
      supabase.from("songs").select("*").order("created_at", { ascending: false }),
      supabase.from("playlist_pitches").select("*, songs(title)").order("created_at", { ascending: false }),
      supabase.from("ad_campaigns").select("*, songs(title)").order("created_at", { ascending: false }),
      supabase.from("royalties").select("*, songs(title)").order("created_at", { ascending: false }),
      supabase.from("song_analytics").select("*, songs(title)").order("date", { ascending: false }),
      user ? supabase.from("profiles").select("artist_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setSongs(s.data || []);
    setPitches(p.data || []);
    setAds(a.data || []);
    setRoyalties(r.data || []);
    setAnalytics(an.data || []);
    setProfile(pr.data);
    setLoading(false);
  };

  useEffect(() => { if (user) loadAll(); }, [user]);

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  const deleteSong = async (id: string) => {
    if (!confirm("Delete this song?")) return;
    const { error } = await supabase.from("songs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Song deleted"); loadAll(); }
  };

  const songOpts = songs.map((s) => ({ id: s.id, title: s.title }));
  const totalRevenue = royalties.reduce((sum, r) => sum + Number(r.revenue_inr || 0), 0);
  const totalStreams = analytics.reduce((sum, a) => sum + (a.streams || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100">
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">TrackSyra Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{profile?.artist_name || user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="w-4 h-4 mr-2" />Logout</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Total Releases</p><p className="text-2xl font-bold">{songs.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Total Streams</p><p className="text-2xl font-bold">{totalStreams.toLocaleString()}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Earnings (₹)</p><p className="text-2xl font-bold">₹{totalRevenue.toFixed(0)}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Active Pitches</p><p className="text-2xl font-bold">{pitches.length}</p></Card>
        </div>

        <Tabs defaultValue="releases" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="releases"><Music className="w-4 h-4 mr-1" />Releases</TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1" />Analytics</TabsTrigger>
            <TabsTrigger value="royalties"><IndianRupee className="w-4 h-4 mr-1" />Royalties</TabsTrigger>
            <TabsTrigger value="pitches"><ListMusic className="w-4 h-4 mr-1" />Playlist Pitching</TabsTrigger>
            <TabsTrigger value="ads"><Megaphone className="w-4 h-4 mr-1" />Spotify Ads</TabsTrigger>
            <TabsTrigger value="canvas"><Video className="w-4 h-4 mr-1" />Canvas Video</TabsTrigger>
          </TabsList>

          <TabsContent value="releases" className="mt-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="text-2xl font-bold">My Releases</h2>
              <Button variant="hero" onClick={() => setOpenUpload(true)}><Plus className="w-4 h-4 mr-2" />Upload New Song</Button>
            </div>
            {loading ? <p className="text-center py-12 text-muted-foreground">Loading...</p> : songs.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No releases yet</h3>
                <p className="text-muted-foreground mb-6">Upload your first track to start distributing.</p>
                <Button variant="hero" onClick={() => setOpenUpload(true)}><Plus className="w-4 h-4 mr-2" />Upload Your First Song</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {songs.map((song) => (
                  <Card key={song.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="aspect-square bg-gradient-to-br from-pink-200 to-pink-400 relative">
                      {song.cover_art_url ? <img src={song.cover_art_url} alt={song.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Music className="w-16 h-16 text-white/80" /></div>}
                      <Badge className="absolute top-2 right-2 capitalize">{song.status}</Badge>
                      {song.canvas_video_url && <Badge variant="secondary" className="absolute top-2 left-2"><Video className="w-3 h-3 mr-1" />Canvas</Badge>}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold truncate">{song.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{song.primary_artist}</p>
                      <p className="text-xs text-muted-foreground mt-2">{song.platforms?.length || 0} platforms • {song.genre || "—"}</p>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditSong(song)}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => deleteSong(song.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <h2 className="text-2xl font-bold mb-4">Streaming Analytics</h2>
            {analytics.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Analytics will appear here once your songs go live on platforms. Updates every 24-48 hrs.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {analytics.map((a) => (
                  <Card key={a.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{a.songs?.title}</p>
                      <p className="text-sm text-muted-foreground">{a.platform} • {a.date}</p>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div><p className="text-muted-foreground text-xs">Streams</p><p className="font-bold">{a.streams.toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground text-xs">Listeners</p><p className="font-bold">{a.listeners.toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground text-xs">Saves</p><p className="font-bold">{a.saves.toLocaleString()}</p></div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="royalties" className="mt-6">
            <h2 className="text-2xl font-bold mb-4">Royalty Management</h2>
            {royalties.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <IndianRupee className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Royalty earnings show up here monthly. Payouts are processed every 30 days via bank transfer / UPI.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {royalties.map((r) => (
                  <Card key={r.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{r.songs?.title}</p>
                      <p className="text-sm text-muted-foreground">{r.platform} • {r.period} • {r.streams} streams</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">₹{Number(r.revenue_inr).toFixed(2)}</p>
                      <Badge variant={r.payout_status === "paid" ? "default" : "secondary"} className="capitalize">{r.payout_status}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pitches" className="mt-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-2xl font-bold">Playlist Pitching</h2>
                <p className="text-sm text-muted-foreground">Genuine pitches → editorial review → playlist placement</p>
              </div>
              <Button variant="hero" onClick={() => setOpenPitch(true)} disabled={songs.length === 0}><Plus className="w-4 h-4 mr-2" />New Pitch</Button>
            </div>
            {pitches.length === 0 ? (
              <Card className="p-8 text-center border-dashed"><ListMusic className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No pitches yet. Submit a genuine, story-driven pitch to get featured on editorial playlists.</p></Card>
            ) : (
              <div className="space-y-2">
                {pitches.map((p) => {
                  const statusColor =
                    p.status === "approved"
                      ? "bg-green-100 text-green-800 border-green-300"
                      : p.status === "rejected"
                      ? "bg-red-100 text-red-800 border-red-300"
                      : "bg-amber-100 text-amber-800 border-amber-300";
                  return (
                    <Card key={p.id} className="p-4">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1">
                          <p className="font-semibold">{p.songs?.title} → {p.target_playlist}</p>
                          <p className="text-sm text-muted-foreground">{p.platform} • {p.genre || "—"} • {p.mood || "—"}</p>
                          <p className="text-sm mt-2 line-clamp-2">{p.pitch_story}</p>
                          {p.admin_notes && (
                            <div className="mt-2 rounded-md bg-muted p-2 text-xs">
                              <span className="font-semibold">Editor's note: </span>{p.admin_notes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={`capitalize border ${statusColor}`} variant="outline">{p.status}</Badge>
                          {p.status !== "approved" && (
                            <Button size="sm" variant="outline" onClick={() => setEditPitch(p)}>
                              <Pencil className="w-3 h-3 mr-1" />
                              {p.status === "rejected" ? "Edit & Resubmit" : "Edit"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ads" className="mt-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-2xl font-bold">Spotify & Streaming Ads</h2>
                <p className="text-sm text-muted-foreground">Promote your music with paid campaigns. Min ₹500.</p>
              </div>
              <Button variant="hero" onClick={() => setOpenAd(true)} disabled={songs.length === 0}><Plus className="w-4 h-4 mr-2" />New Campaign</Button>
            </div>
            {ads.length === 0 ? (
              <Card className="p-8 text-center border-dashed"><Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No ad campaigns yet. Launch one to boost streams & followers.</p></Card>
            ) : (
              <div className="space-y-2">
                {ads.map((a) => (
                  <Card key={a.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{a.campaign_name}</p>
                      <p className="text-sm text-muted-foreground">{a.songs?.title} • {a.platform} • {a.target_age || "All ages"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">₹{Number(a.budget_inr).toFixed(0)}</p>
                      <Badge variant="secondary" className="capitalize">{a.status}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="canvas" className="mt-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-2xl font-bold">Spotify Canvas Videos</h2>
                <p className="text-sm text-muted-foreground">Add looping videos that play with your songs on Spotify.</p>
              </div>
              <Button variant="hero" onClick={() => setOpenCanvas(true)} disabled={songs.length === 0}><Plus className="w-4 h-4 mr-2" />Upload Canvas</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {songs.filter((s) => s.canvas_video_url).map((s) => (
                <Card key={s.id} className="overflow-hidden">
                  <video src={s.canvas_video_url} className="w-full aspect-[9/16] object-cover" autoPlay loop muted playsInline />
                  <div className="p-3"><p className="font-semibold truncate">{s.title}</p></div>
                </Card>
              ))}
              {songs.filter((s) => s.canvas_video_url).length === 0 && (
                <Card className="p-8 text-center border-dashed col-span-full"><Video className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No Canvas videos yet.</p></Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <UploadSongDialog open={openUpload} onOpenChange={setOpenUpload} onSuccess={loadAll} />
      <PlaylistPitchDialog songs={songOpts} open={openPitch} onOpenChange={setOpenPitch} onSuccess={loadAll} />
      <PlaylistPitchDialog
        songs={songOpts}
        open={!!editPitch}
        onOpenChange={(v) => !v && setEditPitch(null)}
        onSuccess={loadAll}
        existing={editPitch}
      />
      <AdCampaignDialog songs={songOpts} open={openAd} onOpenChange={setOpenAd} onSuccess={loadAll} />
      <CanvasUploadDialog songs={songOpts} open={openCanvas} onOpenChange={setOpenCanvas} onSuccess={loadAll} />
      <EditSongDialog song={editSong} open={!!editSong} onOpenChange={(v) => !v && setEditSong(null)} onSuccess={loadAll} />
    </div>
  );
};

export default Dashboard;
