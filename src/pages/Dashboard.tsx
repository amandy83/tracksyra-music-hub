import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Upload, LogOut, Plus } from "lucide-react";
import UploadSongDialog from "@/components/UploadSongDialog";
import { toast } from "sonner";

type Song = {
  id: string;
  title: string;
  primary_artist: string;
  genre: string | null;
  status: string;
  cover_art_url: string | null;
  release_date: string | null;
  platforms: string[];
  created_at: string;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUpload, setOpenUpload] = useState(false);
  const [profile, setProfile] = useState<{ artist_name: string | null } | null>(null);

  const loadSongs = async () => {
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setSongs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadSongs();
    supabase.from("profiles").select("artist_name").maybeSingle().then(({ data }) => setProfile(data));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100">
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">TrackSyra Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {profile?.artist_name || user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-bold">My Releases</h2>
            <p className="text-muted-foreground">Manage and distribute your music</p>
          </div>
          <Button variant="hero" onClick={() => setOpenUpload(true)}>
            <Plus className="w-4 h-4 mr-2" />Upload New Song
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : songs.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No releases yet</h3>
            <p className="text-muted-foreground mb-6">Upload your first track and distribute it to Spotify, JioSaavn, Apple Music & more.</p>
            <Button variant="hero" onClick={() => setOpenUpload(true)}>
              <Plus className="w-4 h-4 mr-2" />Upload Your First Song
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {songs.map((song) => (
              <Card key={song.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-square bg-gradient-to-br from-pink-200 to-pink-400 relative">
                  {song.cover_art_url ? (
                    <img src={song.cover_art_url} alt={song.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-16 h-16 text-white/80" />
                    </div>
                  )}
                  <Badge className="absolute top-2 right-2 capitalize">{song.status}</Badge>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold truncate">{song.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{song.primary_artist}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {song.platforms.length} platform{song.platforms.length !== 1 ? "s" : ""} • {song.genre || "—"}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <UploadSongDialog open={openUpload} onOpenChange={setOpenUpload} onSuccess={loadSongs} />
    </div>
  );
};

export default Dashboard;
