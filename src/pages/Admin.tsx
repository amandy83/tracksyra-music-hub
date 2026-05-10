import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { LogOut, Eye, CheckCircle2, XCircle, Trash2, Search } from "lucide-react";

type Submission = {
  id: string;
  form_type: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  data: any;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type Song = {
  id: string;
  title: string;
  primary_artist: string;
  status: string;
  created_at: string;
  user_id: string;
  cover_art_url: string | null;
  audio_url: string | null;
  platforms: string[];
};

type Pitch = {
  id: string;
  target_playlist: string;
  platform: string;
  pitch_story: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    submitted: "bg-blue-100 text-blue-800 border-blue-200",
  };
  return <Badge variant="outline" className={map[status] || ""}>{status}</Badge>;
};

const Admin = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [viewing, setViewing] = useState<Submission | null>(null);
  const [notes, setNotes] = useState("");

  const load = async () => {
    const [s, so, p] = await Promise.all([
      supabase.from("form_submissions").select("*").order("created_at", { ascending: false }),
      supabase.from("songs").select("*").order("created_at", { ascending: false }),
      supabase.from("playlist_pitches").select("*").order("created_at", { ascending: false }),
    ]);
    setSubs((s.data as Submission[]) || []);
    const rawSongs = (so.data as Song[]) || [];
    // Sign private audio URLs so admin can preview tracks
    const signed = await Promise.all(
      rawSongs.map(async (song) => {
        if (!song.audio_url || song.audio_url.startsWith("http")) return song;
        const { data } = await supabase.storage.from("audio").createSignedUrl(song.audio_url, 3600);
        return { ...song, audio_url: data?.signedUrl || song.audio_url };
      })
    );
    setSongs(signed);
    setPitches((p.data as Pitch[]) || []);
  };

  useEffect(() => { load(); }, []);

  const updateSubStatus = async (id: string, status: string, admin_notes?: string) => {
    const { error } = await supabase
      .from("form_submissions")
      .update({ status, admin_notes: admin_notes ?? null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Submission ${status}`);
    setViewing(null);
    setNotes("");
    load();
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this submission?")) return;
    const { error } = await supabase.from("form_submissions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const updateSongStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("songs").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Song ${status}`);
    load();
  };

  const updatePitchStatus = async (id: string, status: string) => {
    const note = prompt("Admin notes (optional):") || null;
    const { error } = await supabase
      .from("playlist_pitches")
      .update({ status, admin_notes: note })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Pitch ${status}`);
    load();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const pendingSubs = subs.filter((s) => s.status === "pending").length;
  const pendingSongs = songs.filter((s) => s.status === "submitted").length;
  const pendingPitches = pitches.filter((p) => p.status === "pending").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">TrackSyra Admin</h1>
            <p className="text-sm text-muted-foreground">Manage submissions, songs & pitches</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" /> Log Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Pending Form Submissions</div>
            <div className="text-3xl font-bold text-pink-600">{pendingSubs}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Songs Awaiting Review</div>
            <div className="text-3xl font-bold text-pink-600">{pendingSongs}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Pending Playlist Pitches</div>
            <div className="text-3xl font-bold text-pink-600">{pendingPitches}</div>
          </Card>
        </div>

        <Tabs defaultValue="forms">
          <TabsList>
            <TabsTrigger value="forms">Form Submissions ({subs.length})</TabsTrigger>
            <TabsTrigger value="songs">Songs ({songs.length})</TabsTrigger>
            <TabsTrigger value="pitches">Pitches ({pitches.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="space-y-3 mt-4">
            {subs.length === 0 && <p className="text-muted-foreground">No submissions yet.</p>}
            {subs.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{s.name || "Unnamed"}</span>
                      <StatusBadge status={s.status} />
                      <Badge variant="secondary">{s.form_type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {s.email} {s.phone && `· ${s.phone}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                    {s.admin_notes && (
                      <p className="text-xs mt-2 p-2 bg-muted rounded">Notes: {s.admin_notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => { setViewing(s); setNotes(s.admin_notes || ""); }}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                    {s.status === "pending" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateSubStatus(s.id, "approved")}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => updateSubStatus(s.id, "rejected")}>
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => deleteSub(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="songs" className="space-y-3 mt-4">
            {songs.length === 0 && <p className="text-muted-foreground">No songs yet.</p>}
            {songs.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex gap-3 flex-1 min-w-0">
                    {s.cover_art_url && (
                      <img src={s.cover_art_url} alt="" className="w-16 h-16 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{s.title}</span>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{s.primary_artist}</p>
                      <p className="text-xs text-muted-foreground">
                        Platforms: {s.platforms?.join(", ") || "—"}
                      </p>
                      {s.audio_url && (
                        <audio controls className="mt-2 h-8" src={s.audio_url} />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {s.status !== "approved" && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateSongStatus(s.id, "approved")}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    )}
                    {s.status !== "rejected" && (
                      <Button size="sm" variant="destructive" onClick={() => updateSongStatus(s.id, "rejected")}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="pitches" className="space-y-3 mt-4">
            {pitches.length === 0 && <p className="text-muted-foreground">No pitches yet.</p>}
            {pitches.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{p.target_playlist}</span>
                      <StatusBadge status={p.status} />
                      <Badge variant="secondary">{p.platform}</Badge>
                    </div>
                    <p className="text-sm mt-2 whitespace-pre-wrap">{p.pitch_story}</p>
                    {p.admin_notes && (
                      <p className="text-xs mt-2 p-2 bg-muted rounded">Notes: {p.admin_notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {p.status === "pending" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updatePitchStatus(p.id, "approved")}>
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => updatePitchStatus(p.id, "rejected")}>
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </main>

      {/* View submission dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.form_type} — {viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                {Object.entries(viewing.data).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-2 border-b pb-1">
                    <span className="font-medium text-muted-foreground">{k}</span>
                    <span className="col-span-2 break-words">{String(v)}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium">Admin Notes</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateSubStatus(viewing.id, "approved", notes)}>
                  Approve
                </Button>
                <Button variant="destructive" onClick={() => updateSubStatus(viewing.id, "rejected", notes)}>
                  Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
