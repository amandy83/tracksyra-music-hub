import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, CheckCircle2, ExternalLink, Heart, Search, Send, SlidersHorizontal, Star, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

type MarketplaceCard = {
  playlist_id: string;
  playlist_name: string;
  spotify_playlist_url: string;
  spotify_playlist_id: string | null;
  followers: number;
  genre: string | null;
  mood: string | null;
  playlist_territory: string | null;
  playlist_verified: boolean;
  curator_id: string;
  curator_name: string;
  company_name: string | null;
  email: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  website_url: string | null;
  spotify_profile_url: string | null;
  country: string | null;
  curator_territory: string | null;
  bio: string | null;
  curator_verified: boolean;
  acceptance_rate: number;
  response_rate: number;
  average_response_days: number;
  total_playlists: number;
  total_followers: number;
  created_at: string;
};

type Release = { id: string; title: string; primary_artist: string; status: string };
type Track = { id: string; release_id: string; title: string };
type Favorite = { id: string; curator_id: string | null; playlist_id: string | null; favorite_type: string; deleted_at?: string | null };
type Outreach = {
  id: string;
  status: string;
  release_title?: string;
  track_title?: string;
  curator_name?: string;
  playlist_name?: string;
  submission_date: string | null;
  response_date: string | null;
  curator_feedback: string | null;
};

const client = supabase as any;
const SORTS = [
  { value: "acceptance", label: "Acceptance rate" },
  { value: "response", label: "Response rate" },
  { value: "followers", label: "Followers" },
];

export default function CuratorMarketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState<MarketplaceCard[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [outreach, setOutreach] = useState<Outreach[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [mood, setMood] = useState("all");
  const [territory, setTerritory] = useState("all");
  const [verified, setVerified] = useState("all");
  const [minFollowers, setMinFollowers] = useState("");
  const [sort, setSort] = useState("acceptance");
  const [selected, setSelected] = useState<MarketplaceCard | null>(null);
  const [pitching, setPitching] = useState<MarketplaceCard | null>(null);
  const [releaseId, setReleaseId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [pitchStory, setPitchStory] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const [cardsResult, favoritesResult, outreachResult, releaseResult, trackResult] = await Promise.all([
      client.from("curator_marketplace_playlist_cards").select("*").order("followers", { ascending: false }),
      client.from("curator_favorites").select("*").is("deleted_at", null),
      client.from("curator_outreach_artist_dashboard").select("*").order("created_at", { ascending: false }),
      supabase.from("releases").select("id,title,primary_artist,status").eq("user_id", user.id).in("status", ["approved", "sent_to_stores", "processing", "live"]),
      supabase.from("tracks").select("id,release_id,title").eq("user_id", user.id).order("track_number"),
    ]);
    if (cardsResult.error) toast.error(cardsResult.error.message);
    if (favoritesResult.error) toast.error(favoritesResult.error.message);
    if (outreachResult.error) toast.error(outreachResult.error.message);
    setCards(cardsResult.data || []);
    setFavorites(favoritesResult.data || []);
    setOutreach(outreachResult.data || []);
    setReleases((releaseResult.data || []) as Release[]);
    setTracks((trackResult.data || []) as Track[]);
    if (!releaseId && releaseResult.data?.[0]) setReleaseId(releaseResult.data[0].id);
  };

  useEffect(() => { void load(); }, [user]);

  const releaseTracks = tracks.filter((track) => track.release_id === releaseId);
  useEffect(() => {
    if (releaseTracks.length && (!trackId || !releaseTracks.some((track) => track.id === trackId))) {
      setTrackId(releaseTracks[0].id);
    }
  }, [releaseId, tracks]);

  const filtered = useMemo(() => {
    const min = Number(minFollowers || 0);
    const rows = cards.filter((card) => {
      const haystack = [card.playlist_name, card.curator_name, card.company_name, card.genre, card.mood, card.playlist_territory, card.country].join(" ").toLowerCase();
      return (!query || haystack.includes(query.toLowerCase()))
        && (genre === "all" || card.genre === genre)
        && (mood === "all" || card.mood === mood)
        && (territory === "all" || card.playlist_territory === territory || card.curator_territory === territory)
        && (verified === "all" || (verified === "verified" ? card.curator_verified || card.playlist_verified : !card.curator_verified && !card.playlist_verified))
        && Number(card.followers || 0) >= min;
    });
    return rows.sort((a, b) => {
      if (sort === "response") return Number(b.response_rate || 0) - Number(a.response_rate || 0);
      if (sort === "followers") return Number(b.followers || 0) - Number(a.followers || 0);
      return Number(b.acceptance_rate || 0) - Number(a.acceptance_rate || 0);
    });
  }, [cards, query, genre, mood, territory, verified, minFollowers, sort]);

  const favoritePlaylistIds = new Set(favorites.filter((item) => item.favorite_type === "playlist" && !item.deleted_at).map((item) => item.playlist_id));
  const favoriteCuratorIds = new Set(favorites.filter((item) => item.favorite_type === "curator" && !item.deleted_at).map((item) => item.curator_id));
  const favoriteCards = filtered.filter((card) => favoritePlaylistIds.has(card.playlist_id) || favoriteCuratorIds.has(card.curator_id));

  const analytics = useMemo(() => {
    const sent = outreach.filter((item) => item.status !== "draft").length;
    const accepted = outreach.filter((item) => item.status === "accepted").length;
    const rejected = outreach.filter((item) => item.status === "rejected").length;
    const responded = outreach.filter((item) => ["responded", "accepted", "rejected"].includes(item.status)).length;
    return {
      sent,
      accepted,
      rejected,
      responseRate: sent ? Math.round((responded / sent) * 100) : 0,
      engagement: responded,
    };
  }, [outreach]);

  const saveFavorite = async (card: MarketplaceCard, type: "curator" | "playlist") => {
    if (!user) return;
    const existing = favorites.find((item) =>
      item.favorite_type === type && (type === "curator" ? item.curator_id === card.curator_id : item.playlist_id === card.playlist_id)
    );
    if (existing) {
      const { error } = await client.from("curator_favorites").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) return toast.error(error.message);
      toast.success("Removed from favorites.");
    } else {
      const { error } = await client.from("curator_favorites").insert({
        user_id: user.id,
        favorite_type: type,
        curator_id: type === "curator" ? card.curator_id : null,
        playlist_id: type === "playlist" ? card.playlist_id : null,
      });
      if (error) return toast.error(error.message);
      toast.success("Saved to favorites.");
    }
    await load();
  };

  const submitOutreach = async () => {
    if (!pitching || !releaseId || !trackId) return toast.error("Select release and track.");
    if (pitchStory.trim().length < 60) return toast.error("Pitch story must be at least 60 characters.");
    setBusy(true);
    const { error } = await client.rpc("create_curator_outreach", {
      p_release_id: releaseId,
      p_track_id: trackId,
      p_curator_id: pitching.curator_id,
      p_playlist_id: pitching.playlist_id,
      p_pitch_story: pitchStory,
      p_notes: notes || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Curator outreach submitted.");
    setPitching(null);
    setPitchStory("");
    setNotes("");
    await load();
  };

  return (
    <DashboardShell
      title="Curator Marketplace"
      eyebrow="Verified curator network"
      actions={<Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/dashboard/playlist-pitching")}>Playlist Pitching</Button>}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Pitches Sent" value={analytics.sent} delta={10} comparison="outreach volume" icon={Send} accent="pink" />
          <KpiCard label="Accepted" value={analytics.accepted} delta={analytics.accepted ? 13 : 0} comparison="accepted pitches" icon={CheckCircle2} accent="green" />
          <KpiCard label="Rejected" value={analytics.rejected} delta={analytics.rejected ? -3 : 0} comparison="fit feedback" icon={BarChart3} accent="slate" />
          <KpiCard label="Response Rate" value={`${analytics.responseRate}%`} delta={analytics.responseRate ? 6 : 0} comparison="curator replies" icon={Users} accent="teal" />
          <KpiCard label="Engagement" value={analytics.engagement} delta={analytics.engagement ? 8 : 0} comparison="active conversations" icon={Heart} accent="blue" />
        </div>

        <Tabs defaultValue="marketplace">
          <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
            <TabsTrigger value="marketplace"><Search className="w-4 h-4 mr-1" />Marketplace</TabsTrigger>
            <TabsTrigger value="favorites"><Heart className="w-4 h-4 mr-1" />Favorites</TabsTrigger>
            <TabsTrigger value="outreach"><Send className="w-4 h-4 mr-1" />Outreach</TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="mt-6 space-y-4">
            <Filters
              cards={cards}
              query={query}
              setQuery={setQuery}
              genre={genre}
              setGenre={setGenre}
              mood={mood}
              setMood={setMood}
              territory={territory}
              setTerritory={setTerritory}
              verified={verified}
              setVerified={setVerified}
              minFollowers={minFollowers}
              setMinFollowers={setMinFollowers}
              sort={sort}
              setSort={setSort}
            />
            <CardGrid
              cards={filtered}
              favoritePlaylistIds={favoritePlaylistIds}
              favoriteCuratorIds={favoriteCuratorIds}
              onView={setSelected}
              onPitch={setPitching}
              onFavorite={saveFavorite}
            />
          </TabsContent>

          <TabsContent value="favorites" className="mt-6">
            <CardGrid
              cards={favoriteCards}
              favoritePlaylistIds={favoritePlaylistIds}
              favoriteCuratorIds={favoriteCuratorIds}
              onView={setSelected}
              onPitch={setPitching}
              onFavorite={saveFavorite}
              empty="No favorite curators or playlists yet."
            />
          </TabsContent>

          <TabsContent value="outreach" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {outreach.length === 0 ? (
                <div className="lg:col-span-2">
                  <EmptyState title="No curator outreach" description="Pitch verified curators from the marketplace and track every response here." actionLabel="Find curators" onAction={() => null} icon={Users} />
                </div>
              ) : outreach.map((item) => (
                <GlassCard key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{item.playlist_name || item.curator_name || "Curator"}</h3>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{item.release_title} - {item.track_title}</p>
                      {item.curator_feedback && <p className="text-xs rounded bg-muted p-2 mt-3">{item.curator_feedback}</p>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{item.submission_date ? new Date(item.submission_date).toLocaleDateString() : "Draft"}</p>
                      {item.response_date && <p>Responded {new Date(item.response_date).toLocaleDateString()}</p>}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.playlist_name}</DialogTitle></DialogHeader>
          {selected && <ProfileDetails card={selected} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pitching} onOpenChange={(open) => !open && setPitching(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pitch {pitching?.playlist_name}</DialogTitle></DialogHeader>
          {pitching && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Release</Label>
                  <Select value={releaseId} onValueChange={setReleaseId}>
                    <SelectTrigger><SelectValue placeholder="Select release" /></SelectTrigger>
                    <SelectContent>
                      {releases.map((release) => <SelectItem key={release.id} value={release.id}>{release.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Track</Label>
                  <Select value={trackId} onValueChange={setTrackId} disabled={!releaseTracks.length}>
                    <SelectTrigger><SelectValue placeholder="Select track" /></SelectTrigger>
                    <SelectContent>
                      {releaseTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Pitch Story</Label>
                <Textarea rows={7} value={pitchStory} onChange={(event) => setPitchStory(event.target.value)} placeholder="Tell the curator why this track fits their playlist, audience, and current mood." />
                <p className="text-xs text-muted-foreground mt-1">{pitchStory.trim().length}/2000, minimum 60</p>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional internal notes for tracking this outreach." />
              </div>
              <div className="flex justify-end">
                <Button variant="hero" onClick={submitOutreach} disabled={busy || pitchStory.trim().length < 60}>
                  <Send className="w-4 h-4 mr-2" />{busy ? "Submitting..." : "Submit Outreach"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function Filters(props: {
  cards: MarketplaceCard[];
  query: string;
  setQuery: (value: string) => void;
  genre: string;
  setGenre: (value: string) => void;
  mood: string;
  setMood: (value: string) => void;
  territory: string;
  setTerritory: (value: string) => void;
  verified: string;
  setVerified: (value: string) => void;
  minFollowers: string;
  setMinFollowers: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
}) {
  return (
    <GlassCard className="p-4">
      <SectionHeader title="Search and Filters" description="Find curators by genre, mood, territory, verification, followers, and response quality." />
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Input className="md:col-span-2" placeholder="Search curators or playlists" value={props.query} onChange={(event) => props.setQuery(event.target.value)} />
        <Select value={props.genre} onValueChange={props.setGenre}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All genres</SelectItem>{unique(props.cards.map((card) => card.genre).filter(Boolean) as string[]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={props.mood} onValueChange={props.setMood}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All moods</SelectItem>{unique(props.cards.map((card) => card.mood).filter(Boolean) as string[]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Select value={props.territory} onValueChange={props.setTerritory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All territories</SelectItem>{unique(props.cards.flatMap((card) => [card.playlist_territory, card.curator_territory]).filter(Boolean) as string[]).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
        <Input type="number" min={0} placeholder="Min followers" value={props.minFollowers} onChange={(event) => props.setMinFollowers(event.target.value)} />
        <Select value={props.verified} onValueChange={props.setVerified}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any verification</SelectItem><SelectItem value="verified">Verified only</SelectItem><SelectItem value="unverified">Unverified</SelectItem></SelectContent></Select>
        <Select value={props.sort} onValueChange={props.setSort}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SORTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
      </div>
    </GlassCard>
  );
}

function CardGrid(props: {
  cards: MarketplaceCard[];
  favoritePlaylistIds: Set<string | null>;
  favoriteCuratorIds: Set<string | null>;
  onView: (card: MarketplaceCard) => void;
  onPitch: (card: MarketplaceCard) => void;
  onFavorite: (card: MarketplaceCard, type: "curator" | "playlist") => void;
  empty?: string;
}) {
  if (!props.cards.length) {
    return <EmptyState title="No marketplace matches" description={props.empty || "No curators or playlists match your filters. Adjust filters or search a broader territory."} actionLabel="Reset filters" onAction={() => null} icon={Search} />;
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {props.cards.map((card) => (
        <GlassCard key={card.playlist_id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{card.playlist_name}</h3>
                {(card.curator_verified || card.playlist_verified) && <Badge className="bg-green-100 text-green-800 border-green-200" variant="outline"><CheckCircle2 className="w-3 h-3 mr-1" />Verified</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{card.curator_name} - {card.genre || "Genre"} - {card.playlist_territory || "Global"}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => props.onFavorite(card, "playlist")} title="Save playlist">
              <Heart className={`w-4 h-4 ${props.favoritePlaylistIds.has(card.playlist_id) ? "fill-primary text-primary" : ""}`} />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
            <Mini label="Followers" value={Number(card.followers || 0).toLocaleString()} />
            <Mini label="Accept" value={`${Number(card.acceptance_rate || 0)}%`} />
            <Mini label="Response" value={`${Number(card.response_rate || 0)}%`} />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => props.onView(card)}><Users className="w-4 h-4 mr-1" />Profile</Button>
            <Button size="sm" variant="outline" onClick={() => props.onFavorite(card, "curator")}><Star className={`w-4 h-4 mr-1 ${props.favoriteCuratorIds.has(card.curator_id) ? "fill-primary text-primary" : ""}`} />Curator</Button>
            <Button size="sm" variant="hero" onClick={() => props.onPitch(card)}><Send className="w-4 h-4 mr-1" />Pitch</Button>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function ProfileDetails({ card }: { card: MarketplaceCard }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Info label="Followers" value={Number(card.followers || 0).toLocaleString()} />
        <Info label="Acceptance" value={`${Number(card.acceptance_rate || 0)}%`} />
        <Info label="Response" value={`${Number(card.response_rate || 0)}%`} />
        <Info label="Avg Days" value={Number(card.average_response_days || 0).toFixed(1)} />
      </div>
      <div>
        <h3 className="font-semibold mb-1">{card.curator_name}</h3>
        <p className="text-sm text-muted-foreground">{card.company_name || "Independent curator"} - {card.country || card.curator_territory || "Global"}</p>
        {card.bio && <p className="text-sm mt-3 whitespace-pre-wrap">{card.bio}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Info label="Playlist Genre" value={card.genre || "Any"} />
        <Info label="Mood" value={card.mood || "Any"} />
        <Info label="Territory" value={card.playlist_territory || "Global"} />
        <Info label="Curator Playlists" value={card.total_playlists || 0} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={card.spotify_playlist_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1" />Playlist</a></Button>
        {card.spotify_profile_url && <Button asChild variant="outline" size="sm"><a href={card.spotify_profile_url} target="_blank" rel="noreferrer">Spotify Profile</a></Button>}
        {card.instagram_url && <Button asChild variant="outline" size="sm"><a href={card.instagram_url} target="_blank" rel="noreferrer">Instagram</a></Button>}
        {card.website_url && <Button asChild variant="outline" size="sm"><a href={card.website_url} target="_blank" rel="noreferrer">Website</a></Button>}
      </div>
    </div>
  );
}

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border bg-background p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded border bg-background p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "accepted" ? "bg-green-100 text-green-800 border-green-200" : status === "rejected" ? "bg-red-100 text-red-800 border-red-200" : "bg-blue-100 text-blue-800 border-blue-200";
  return <Badge variant="outline" className={`capitalize ${className}`}>{status.replace(/_/g, " ")}</Badge>;
}
