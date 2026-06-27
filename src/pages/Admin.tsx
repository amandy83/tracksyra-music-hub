import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { Activity, DollarSign, LogOut, Eye, CheckCircle2, XCircle, Trash2, Search, MailCheck, ShieldAlert, ClipboardCheck, Users, ShieldCheck } from "lucide-react";
import EmailSettings from "@/components/EmailSettings";
import AdminReleasePanel from "@/components/AdminReleasePanel";
import AdminPromoAssetsPanel from "@/components/AdminPromoAssetsPanel";
import AdminPlaylistQueue from "@/components/AdminPlaylistQueue";
import AdminCuratorMarketplace from "@/components/AdminCuratorMarketplace";
import AdminPlaylistAnalytics from "@/components/AdminPlaylistAnalytics";
import AdminTooLostProviderPanel from "@/components/AdminTooLostProviderPanel";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { GlassCard, KpiCard } from "@/components/dashboard/DashboardPrimitives";

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

type ArtistRequest = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  artist_id: string | null;
  request_data: any;
  admin_notes: string | null;
  created_at: string;
};

type FraudReview = {
  review_id: string;
  fraud_event_id: string;
  event_id: string;
  event_type: string;
  rule_code: string | null;
  track_id: string | null;
  release_id: string | null;
  user_id: string | null;
  subject_user_id: string | null;
  platform: string | null;
  decision: string;
  severity: string;
  status: string;
  fraud_score: number;
  reasons: any[];
  feature_vector: any;
  raw_event: any;
  queued_at: string;
};

type PlatformRole = "super_admin" | "publisher" | "label" | "artist";

type PlatformUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  artist_name: string | null;
  roles: string[] | null;
  status: string;
  created_at: string;
  last_sign_in_at: string | null;
};

type DistributionOps = {
  queue: number;
  failed: number;
  processing: number;
  live: number;
  syncStatus: string;
};

const client = supabase as any;
const platformRoles: PlatformRole[] = ["super_admin", "publisher", "label", "artist"];

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    PENDING: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    APPROVED: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    REJECTED: "bg-red-100 text-red-800 border-red-200",
    submitted: "bg-blue-100 text-blue-800 border-blue-200",
  };
  return <Badge variant="outline" className={map[status] || ""}>{status}</Badge>;
};

const Admin = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [artistRequests, setArtistRequests] = useState<ArtistRequest[]>([]);
  const [fraudReviews, setFraudReviews] = useState<FraudReview[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [distributionOps, setDistributionOps] = useState<DistributionOps>({ queue: 0, failed: 0, processing: 0, live: 0, syncStatus: "not configured" });
  const [roleSavingUserId, setRoleSavingUserId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Submission | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    const [s, ar, fr, so, p, users, distributionJobs, distributionProviders] = await Promise.all([
      supabase.from("form_submissions").select("*").order("created_at", { ascending: false }),
      client.from("artist_requests").select("*").order("created_at", { ascending: false }),
      client.from("fraud_review_queue").select("*").order("queued_at", { ascending: false }),
      supabase.from("songs").select("*").order("created_at", { ascending: false }),
      supabase.from("playlist_pitches").select("*").order("created_at", { ascending: false }),
      client.rpc("list_platform_users"),
      client.from("distribution_jobs").select("status,provider,updated_at").eq("provider", "too_lost").order("updated_at", { ascending: false }),
      client.from("distribution_providers").select("provider,sync_status,last_sync_at").eq("provider", "too_lost").maybeSingle(),
    ]);
    setSubs((s.data as Submission[]) || []);
    setArtistRequests((ar.data as ArtistRequest[]) || []);
    setFraudReviews((fr.data as FraudReview[]) || []);
    const rawSongs = (so.data as Song[]) || [];
    const signed = await Promise.all(
      rawSongs.map(async (song) => {
        if (!song.audio_url || song.audio_url.startsWith("http")) return song;
        const { data } = await supabase.storage.from("audio").createSignedUrl(song.audio_url, 3600);
        return { ...song, audio_url: data?.signedUrl || song.audio_url };
      })
    );
    setSongs(signed);
    setPitches((p.data as Pitch[]) || []);
    setPlatformUsers((users.data as PlatformUser[]) || []);
    const jobs = distributionJobs.data || [];
    setDistributionOps({
      queue: jobs.filter((job: any) => ["PENDING", "SUBMITTED"].includes(job.status)).length,
      failed: jobs.filter((job: any) => ["FAILED", "DEAD_LETTER"].includes(job.status)).length,
      processing: jobs.filter((job: any) => job.status === "PROCESSING").length,
      live: jobs.filter((job: any) => ["PUBLISHED", "DELIVERED"].includes(job.status)).length,
      syncStatus: distributionProviders.data?.sync_status || "not configured",
    });
  };

  useEffect(() => {
    load();
    // Realtime: refresh on any change to admin-managed tables
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, () => {
        load();
        toast.info("New submission activity");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "artist_requests" }, () => {
        load();
        toast.info("Artist request activity");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_reviews" }, () => {
        load();
        toast.info("Fraud review activity");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fraud_events" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "songs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "playlist_pitches" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const matches = (text: string | null | undefined) =>
    !search || (text || "").toLowerCase().includes(search.toLowerCase());
  const statusOk = (s: string) => statusFilter === "all" || s === statusFilter;

  const filteredSubs = subs.filter(s => statusOk(s.status) && (matches(s.name) || matches(s.email) || matches(s.form_type)));
  const filteredArtistRequests = artistRequests.filter(r => statusOk(r.status) && (matches(r.name) || matches(r.email) || matches(r.artist_id)));
  const filteredFraudReviews = fraudReviews.filter(r => statusFilter === "all" || r.decision === statusFilter || r.severity === statusFilter || r.event_type === statusFilter)
    .filter(r => matches(r.event_id) || matches(r.rule_code) || matches(r.event_type) || matches(r.platform) || matches(r.track_id) || matches(r.release_id));
  const filteredSongs = songs.filter(s => statusOk(s.status) && (matches(s.title) || matches(s.primary_artist)));
  const filteredPitches = pitches.filter(p => statusOk(p.status) && (matches(p.target_playlist) || matches(p.platform)));
  const filteredPlatformUsers = platformUsers.filter((platformUser) => {
    const roleText = (platformUser.roles || []).join(" ");
    return matches(platformUser.email) || matches(platformUser.full_name) || matches(platformUser.artist_name) || matches(roleText) || matches(platformUser.status);
  });

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

  const approveArtistRequest = async (id: string) => {
    const adminNotes = prompt("Admin notes (optional):") || null;
    const { error } = await client.rpc("approve_artist_request", {
      p_request_id: id,
      p_admin_notes: adminNotes,
    });
    if (error) return toast.error(error.message);
    void supabase.functions.invoke("send-emails", { body: {} });
    toast.success("Artist request approved");
    load();
  };

  const rejectArtistRequest = async (id: string) => {
    const adminNotes = prompt("Rejection notes (optional):") || null;
    const { error } = await client.rpc("reject_artist_request", {
      p_request_id: id,
      p_admin_notes: adminNotes,
    });
    if (error) return toast.error(error.message);
    void supabase.functions.invoke("send-emails", { body: {} });
    toast.success("Artist request rejected");
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

  const decideFraudReview = async (reviewId: string, decision: "APPROVE" | "REJECT" | "ESCALATE") => {
    const note = prompt("Review notes (optional):") || null;
    const { error } = await client.rpc("decide_fraud_review", {
      p_review_id: reviewId,
      p_decision: decision,
      p_notes: note,
    });
    if (error) return toast.error(error.message);
    toast.success(`Fraud review ${decision.toLowerCase()}`);
    load();
  };

  const assignPlatformRole = async (userId: string, role: PlatformRole) => {
    setRoleSavingUserId(userId);
    const { error } = await client.rpc("assign_platform_role", {
      p_user_id: userId,
      p_role: role,
    });
    setRoleSavingUserId(null);
    if (error) return toast.error(error.message);
    toast.success(`Assigned ${role.replace(/_/g, " ")} role`);
    load();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const pendingSubs = subs.filter((s) => s.status === "pending").length;
  const pendingArtistRequests = artistRequests.filter((request) => request.status === "PENDING").length;
  const pendingFraudReviews = fraudReviews.length;
  const pendingSongs = songs.filter((s) => s.status === "submitted").length;
  const pendingPitches = pitches.filter((p) => ["submitted", "under_review"].includes(p.status)).length;
  const activeTab = searchParams.get("tab") || "forms";

  return (
    <DashboardShell
      title="Admin Overview"
      eyebrow="Operations command center"
      actions={(
        <>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/admin/review-queue")}>
            <ClipboardCheck className="w-4 h-4 mr-2" /> Review Queue
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={() => navigate("/admin/email-monitoring")}>
            <MailCheck className="w-4 h-4 mr-2" /> Email Monitoring
          </Button>
          <Button variant="outline" className="rounded-xl bg-white/75" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" /> Log Out
          </Button>
        </>
      )}
    >
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
          <KpiCard label="Pending Reviews" value={pendingArtistRequests + pendingSubs + pendingSongs + pendingPitches} delta={-3} comparison="review workload" icon={ClipboardCheck} accent="amber" />
          <KpiCard label="Distribution Queue" value={distributionOps.queue} delta={0} comparison="Too Lost pending" icon={ShieldAlert} accent="green" />
          <KpiCard label="Failed Deliveries" value={distributionOps.failed} delta={0} comparison="Too Lost failures" icon={ShieldAlert} accent="pink" />
          <KpiCard label="Processing Releases" value={distributionOps.processing} delta={0} comparison="provider work" icon={DollarSign} accent="blue" />
          <KpiCard label="Live Releases" value={distributionOps.live} delta={0} comparison="DSP live" icon={Users} accent="pink" />
          <KpiCard label="Too Lost Sync" value={distributionOps.syncStatus} delta={distributionOps.processing} comparison={`${distributionOps.live} live releases`} icon={Activity} accent="teal" />
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams(value === "forms" ? {} : { tab: value })}>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PENDING">Artist Pending</SelectItem>
                <SelectItem value="APPROVED">Artist Approved</SelectItem>
                <SelectItem value="REJECTED">Artist Rejected</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="CATALOG">Fraud Catalog</SelectItem>
                <SelectItem value="STREAM">Fraud Stream</SelectItem>
                <SelectItem value="AUDIO_FINGERPRINT">Fraud Fingerprint</SelectItem>
                <SelectItem value="ACCOUNT">Fraud Account</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsList className="flex-wrap h-auto rounded-xl bg-white/70 p-1 backdrop-blur">
            <TabsTrigger value="artists">Artist Requests ({filteredArtistRequests.length})</TabsTrigger>
            <TabsTrigger value="users">User Management ({filteredPlatformUsers.length})</TabsTrigger>
            <TabsTrigger value="fraud">Fraud ({filteredFraudReviews.length})</TabsTrigger>
            <TabsTrigger value="forms">Form Submissions ({filteredSubs.length})</TabsTrigger>
            <TabsTrigger value="releases">Releases</TabsTrigger>
            <TabsTrigger value="promo-assets">Promo Assets</TabsTrigger>
            <TabsTrigger value="playlist-queue">Playlist Queue</TabsTrigger>
            <TabsTrigger value="curator-marketplace">Curator Marketplace</TabsTrigger>
            <TabsTrigger value="playlist-analytics">Playlist Analytics</TabsTrigger>
            <TabsTrigger value="too-lost">Too Lost Provider</TabsTrigger>
            <TabsTrigger value="songs">Songs ({filteredSongs.length})</TabsTrigger>
            <TabsTrigger value="pitches">Pitches ({filteredPitches.length})</TabsTrigger>
            <TabsTrigger value="emails">Emails</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-3 mt-4">
            {filteredPlatformUsers.length === 0 && <p className="text-muted-foreground">No users match.</p>}
            {filteredPlatformUsers.map((platformUser) => {
              const currentRole = normalizePlatformRole(platformUser.roles);
              const displayName = platformUser.full_name || platformUser.artist_name || "Unnamed user";
              return (
                <GlassCard key={platformUser.user_id} className="p-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1.3fr_0.8fr_1fr] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-pink-600" />
                        <p className="truncate font-semibold">{displayName}</p>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{platformUser.user_id}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                      <p className="truncate text-sm">{platformUser.email || "No email"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                      <StatusBadge status={platformUser.status} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                      <Select
                        value={currentRole}
                        onValueChange={(value: PlatformRole) => assignPlatformRole(platformUser.user_id, value)}
                        disabled={roleSavingUserId === platformUser.user_id}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {platformRoles.map((role) => (
                            <SelectItem key={role} value={role}>{role.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </TabsContent>

          <TabsContent value="artists" className="space-y-3 mt-4">
            {filteredArtistRequests.length === 0 && <p className="text-muted-foreground">No artist requests match.</p>}
            {filteredArtistRequests.map((request) => (
              <GlassCard key={request.id} className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold">{request.name}</span>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{request.email}</p>
                    {!request.user_id && (
                      <p className="text-xs text-amber-700 mt-1">Approval requires an auth account with this email.</p>
                    )}
                    {request.artist_id && (
                      <p className="text-xs text-muted-foreground mt-1">Artist ID: {request.artist_id}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(request.created_at).toLocaleString()}
                    </p>
                    {request.admin_notes && (
                      <p className="text-xs mt-2 p-2 bg-muted rounded">Notes: {request.admin_notes}</p>
                    )}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {Object.entries(request.request_data || {}).slice(0, 8).map(([key, value]) => (
                        <div key={key} className="rounded border bg-background p-2">
                          <span className="font-medium text-muted-foreground">{key}: </span>
                          <span>{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {request.status !== "APPROVED" && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => approveArtistRequest(request.id)}
                        disabled={!request.user_id}
                        title={!request.user_id ? "Artist must create an auth account with this email before approval" : undefined}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    )}
                    {request.status !== "REJECTED" && (
                      <Button size="sm" variant="destructive" onClick={() => rejectArtistRequest(request.id)}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </TabsContent>

          <TabsContent value="releases" className="mt-4">
            <AdminReleasePanel />
          </TabsContent>

          <TabsContent value="promo-assets" className="mt-4">
            <AdminPromoAssetsPanel />
          </TabsContent>

          <TabsContent value="playlist-queue" className="mt-4">
            <AdminPlaylistQueue />
          </TabsContent>

          <TabsContent value="curator-marketplace" className="mt-4">
            <AdminCuratorMarketplace />
          </TabsContent>

          <TabsContent value="playlist-analytics" className="mt-4">
            <AdminPlaylistAnalytics />
          </TabsContent>

          <TabsContent value="too-lost" className="mt-4">
            <AdminTooLostProviderPanel />
          </TabsContent>

          <TabsContent value="fraud" className="space-y-3 mt-4">
            {filteredFraudReviews.length === 0 && <p className="text-muted-foreground">No fraud reviews match.</p>}
            {filteredFraudReviews.map((review) => {
              const reasons = Array.isArray(review.reasons) ? review.reasons : [];
              return (
                <GlassCard key={review.review_id} className="p-4">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span className="font-semibold">{review.rule_code || review.event_type}</span>
                        <Badge variant={review.fraud_score >= 75 ? "destructive" : "outline"}>
                          Score {review.fraud_score}
                        </Badge>
                        <Badge variant="secondary">{review.severity}</Badge>
                        <Badge variant="outline">{review.event_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">Event: {review.event_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {review.platform ? `Platform: ${review.platform} · ` : ""}
                        {review.track_id ? `Track: ${review.track_id} · ` : ""}
                        {review.release_id ? `Release: ${review.release_id}` : ""}
                      </p>
                      <div className="mt-3 space-y-2">
                        {reasons.slice(0, 4).map((reason, index) => (
                          <div key={`${review.review_id}-${index}`} className="rounded border bg-background p-2 text-xs">
                            <div className="font-medium">{reason.rule || review.rule_code}</div>
                            <div className="text-muted-foreground">{reason.explanation || "Fraud signal requires admin review."}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Queued {new Date(review.queued_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => decideFraudReview(review.review_id, "APPROVE")}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> False Positive
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => decideFraudReview(review.review_id, "REJECT")}>
                        <XCircle className="w-4 h-4 mr-1" /> Confirm
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => decideFraudReview(review.review_id, "ESCALATE")}>
                        Escalate
                      </Button>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </TabsContent>

          <TabsContent value="forms" className="space-y-3 mt-4">
            {filteredSubs.length === 0 && <p className="text-muted-foreground">No submissions match.</p>}
            {filteredSubs.map((s) => (
              <GlassCard key={s.id} className="p-4">
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
              </GlassCard>
            ))}
          </TabsContent>

          <TabsContent value="songs" className="space-y-3 mt-4">
            {filteredSongs.length === 0 && <p className="text-muted-foreground">No songs match.</p>}
            {filteredSongs.map((s) => (
              <GlassCard key={s.id} className="p-4">
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
              </GlassCard>
            ))}
          </TabsContent>

          <TabsContent value="pitches" className="space-y-3 mt-4">
            {filteredPitches.length === 0 && <p className="text-muted-foreground">No pitches match.</p>}
            {filteredPitches.map((p) => (
              <GlassCard key={p.id} className="p-4">
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
              </GlassCard>
            ))}
          </TabsContent>

          <TabsContent value="emails" className="mt-4">
            <EmailSettings />
          </TabsContent>
        </Tabs>
      </div>

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
    </DashboardShell>
  );
};

function normalizePlatformRole(roles: string[] | null | undefined): PlatformRole {
  if (roles?.includes("super_admin") || roles?.includes("admin")) return "super_admin";
  if (roles?.includes("publisher")) return "publisher";
  if (roles?.includes("label")) return "label";
  return "artist";
}

export default Admin;
