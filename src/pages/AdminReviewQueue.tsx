import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Search, UserPlus, XCircle } from "lucide-react";

type QueueStatus = "pending" | "in_review" | "approved" | "rejected" | "needs_changes";
type QueueItem = {
  id: string;
  release_id: string;
  artist_id: string;
  queue_status: QueueStatus;
  priority: number;
  assigned_admin: string | null;
  validation_score: number;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  approved_at?: string | null;
  first_reviewed_at?: string | null;
  change_request_notes?: string | null;
};
type ReleaseRow = any;
type TrackRow = any;
type ValidationRow = any;
type DuplicateRow = any;
type CopyrightFlag = any;
type Contributor = any;
type AdminUser = { user_id: string; role: string; profiles?: { full_name: string | null; artist_name: string | null } | null };

const client = supabase as any;
const statusTabs: Array<{ value: QueueStatus; label: string }> = [
  { value: "pending", label: "Pending Releases" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminReviewQueue() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [releases, setReleases] = useState<Record<string, ReleaseRow>>({});
  const [tracks, setTracks] = useState<Record<string, TrackRow[]>>({});
  const [contributors, setContributors] = useState<Record<string, Contributor[]>>({});
  const [validations, setValidations] = useState<Record<string, ValidationRow[]>>({});
  const [duplicates, setDuplicates] = useState<Record<string, DuplicateRow[]>>({});
  const [flags, setFlags] = useState<Record<string, CopyrightFlag[]>>({});
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState({ pending_count: 0, avg_review_time_hours: 0, approvals_today: 0, rejection_rate: 0 });
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [note, setNote] = useState("");
  const [assignAdmin, setAssignAdmin] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    artist: "",
    genre: "all",
    releaseType: "all",
    minScore: "",
    startDate: "",
    endDate: "",
  });

  const load = async () => {
    const [{ data: q }, { data: m }, { data: adminRows }] = await Promise.all([
      client.from("review_queue").select("*").order("created_at", { ascending: true }),
      client.rpc("review_queue_metrics"),
      client.from("user_roles").select("user_id,role").in("role", ["super_admin", "publisher"]),
    ]);
    const items = (q || []) as QueueItem[];
    setQueue(items);
    setMetrics((m?.[0] || m || {}) as any);
    const adminUserIds = ((adminRows || []) as AdminUser[]).map((row) => row.user_id);
    const { data: adminProfiles } = adminUserIds.length
      ? await supabase.from("profiles").select("id,full_name,artist_name").in("id", adminUserIds)
      : { data: [] as any[] };
    const profilesById = indexById(adminProfiles || []);
    setAdmins(((adminRows || []) as AdminUser[]).map((row) => ({ ...row, profiles: profilesById[row.user_id] || null })));

    const releaseIds = items.map((item) => item.release_id);
    if (!releaseIds.length) return;

    const [{ data: rels }, { data: trks }, { data: contribs }, { data: vals }, { data: dups }, { data: cflags }] = await Promise.all([
      supabase.from("releases").select("*").in("id", releaseIds),
      supabase.from("tracks").select("*").in("release_id", releaseIds),
      client.from("release_contributors").select("*").in("release_id", releaseIds),
      client.from("media_validation_results").select("*").in("release_id", releaseIds).order("created_at", { ascending: false }),
      client.from("release_duplicates").select("*").in("release_id", releaseIds).order("created_at", { ascending: false }),
      client.from("copyright_flags").select("*").in("release_id", releaseIds).order("created_at", { ascending: false }),
    ]);

    setReleases(indexById(rels || []));
    setTracks(groupByRelease(trks || []));
    setContributors(groupByRelease(contribs || []));
    setValidations(groupByRelease(vals || []));
    setDuplicates(groupByRelease(dups || []));
    setFlags(groupByRelease(cflags || []));
  };

  useEffect(() => {
    load();
    const channel = supabase.channel("review-queue-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "review_queue" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_audit_log" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "releases" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => queue.filter((item) => matchesFilters(item, releases[item.release_id], tracks[item.release_id] || [], filters)), [queue, releases, tracks, filters]);

  const action = async (item: QueueItem, reviewAction: "approve" | "reject" | "needs_changes" | "escalate") => {
    if (!note.trim()) {
      toast.error("Review note is required.");
      return;
    }
    const { error } = await client.rpc("review_release_action", {
      p_queue_id: item.id,
      p_action: reviewAction,
      p_notes: note.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success(`Review ${reviewAction.replace("_", " ")} recorded`);
    setNote("");
    setSelected(null);
    load();
  };

  const assign = async (item: QueueItem) => {
    if (!assignAdmin || !note.trim()) {
      toast.error("Assigned admin and assignment note are required.");
      return;
    }
    const { error } = await client.rpc("assign_review_queue_item", {
      p_queue_id: item.id,
      p_admin_id: assignAdmin,
      p_notes: note.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Review assigned");
    setNote("");
    setAssignAdmin("");
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="mb-1">
              <ArrowLeft className="w-4 h-4 mr-1" />Admin
            </Button>
            <h1 className="text-2xl font-bold">Review Queue</h1>
            <p className="text-sm text-muted-foreground">Moderate validated releases before distribution.</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Pending" value={metrics.pending_count || 0} />
          <Metric label="Avg Review Hours" value={metrics.avg_review_time_hours || 0} />
          <Metric label="Approvals Today" value={metrics.approvals_today || 0} />
          <Metric label="Rejection Rate" value={`${metrics.rejection_rate || 0}%`} />
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="md:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Title, artist, UPC, ISRC" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
              </div>
            </div>
            <div>
              <Label>Artist</Label>
              <Input value={filters.artist} onChange={(event) => setFilters({ ...filters, artist: event.target.value })} />
            </div>
            <div>
              <Label>Genre</Label>
              <Select value={filters.genre} onValueChange={(genre) => setFilters({ ...filters, genre })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {unique(Object.values(releases).map((release) => release.genre).filter(Boolean)).map((genre) => <SelectItem key={genre} value={genre}>{genre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={filters.releaseType} onValueChange={(releaseType) => setFilters({ ...filters, releaseType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="ep">EP</SelectItem>
                  <SelectItem value="album">Album</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Min Score</Label>
              <Input type="number" min="0" max="100" value={filters.minScore} onChange={(event) => setFilters({ ...filters, minScore: event.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
              </div>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="pending">
          <TabsList className="flex-wrap h-auto">
            {statusTabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label} ({filtered.filter((item) => item.queue_status === tab.value).length})</TabsTrigger>)}
          </TabsList>
          {statusTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="mt-4">
              <QueueTable
                items={filtered.filter((item) => item.queue_status === tab.value)}
                releases={releases}
                onSelect={(item) => {
                  setSelected(item);
                  setAssignAdmin(item.assigned_admin || "");
                }}
              />
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setNote(""); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected ? releases[selected.release_id]?.title || "Release review" : "Release review"}</DialogTitle></DialogHeader>
          {selected && (
            <ReviewPanel
              item={selected}
              release={releases[selected.release_id]}
              tracks={tracks[selected.release_id] || []}
              contributors={contributors[selected.release_id] || []}
              validations={validations[selected.release_id] || []}
              duplicates={duplicates[selected.release_id] || []}
              flags={flags[selected.release_id] || []}
              admins={admins}
              assignAdmin={assignAdmin}
              setAssignAdmin={setAssignAdmin}
              note={note}
              setNote={setNote}
              onAssign={() => assign(selected)}
              onAction={(reviewAction) => action(selected, reviewAction)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueTable({ items, releases, onSelect }: { items: QueueItem[]; releases: Record<string, ReleaseRow>; onSelect: (item: QueueItem) => void }) {
  if (!items.length) return <Card className="p-8 text-center text-muted-foreground">No releases match this queue.</Card>;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Release</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Queued</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const release = releases[item.release_id] || {};
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{release.title || "Release"}</TableCell>
                <TableCell>{release.primary_artist || "Unknown"}</TableCell>
                <TableCell className="capitalize">{release.release_type || "release"}</TableCell>
                <TableCell><Badge variant={item.validation_score >= 90 ? "outline" : "secondary"}>{item.validation_score}%</Badge></TableCell>
                <TableCell>{new Date(item.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{item.assigned_admin ? shortId(item.assigned_admin) : "Unassigned"}</TableCell>
                <TableCell className="text-right"><Button size="sm" onClick={() => onSelect(item)}>Review</Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function ReviewPanel(props: {
  item: QueueItem;
  release: ReleaseRow;
  tracks: TrackRow[];
  contributors: Contributor[];
  validations: ValidationRow[];
  duplicates: DuplicateRow[];
  flags: CopyrightFlag[];
  admins: AdminUser[];
  assignAdmin: string;
  setAssignAdmin: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onAssign: () => void;
  onAction: (action: "approve" | "reject" | "needs_changes" | "escalate") => void;
}) {
  const { item, release, tracks, contributors, validations, duplicates, flags } = props;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-4">
        {release?.cover_art_url ? <img src={release.cover_art_url} alt="" className="w-full aspect-square rounded object-cover border" /> : <div className="aspect-square rounded border bg-muted" />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Info label="Title" value={release?.title} />
          <Info label="Primary Artist" value={release?.primary_artist} />
          <Info label="Release Type" value={release?.release_type} />
          <Info label="Genre" value={release?.genre} />
          <Info label="Language" value={release?.language} />
          <Info label="UPC" value={release?.upc || "None"} />
          <Info label="Validation Score" value={`${item.validation_score}%`} />
          <Info label="Queue Status" value={item.queue_status.replace("_", " ")} />
        </div>
      </div>

      <section>
        <h3 className="font-semibold mb-2">Contributors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {contributors.length ? contributors.map((contributor) => (
            <div key={contributor.id} className="rounded border p-2 text-sm">{contributor.name} - {String(contributor.role).replace(/_/g, " ")}</div>
          )) : <p className="text-sm text-muted-foreground">No contributor records.</p>}
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Tracks</h3>
        <div className="rounded border divide-y">
          {tracks.map((track) => (
            <div key={track.id} className="p-3 text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
              <span className="font-medium">{track.track_number}. {track.title}</span>
              <span>{track.primary_artist}</span>
              <span>ISRC {track.isrc || "none"}</span>
              <span>{track.audio_format?.toUpperCase()} - {track.sample_rate_hz || 0} Hz - {track.duration_sec || 0}s</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Validation Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {validations.map((validation) => (
            <div key={validation.id} className="rounded border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{validation.validation_type}</span>
                <Badge variant={validation.status === "failed" ? "destructive" : "outline"}>{validation.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{validationReason(validation)}</p>
            </div>
          ))}
        </div>
      </section>

      {(duplicates.length > 0 || flags.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <WarningList title="Duplicate Warnings" items={duplicates.map((item) => `${item.duplicate_type.replace(/_/g, " ")} - ${item.severity}`)} />
          <WarningList title="Copyright Flags" items={flags.map((item) => item.reason || "Copyright metadata requires review.")} />
        </section>
      )}

      <section className="rounded border p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label>Assign Admin</Label>
            <Select value={props.assignAdmin} onValueChange={props.setAssignAdmin}>
              <SelectTrigger><SelectValue placeholder="Select admin" /></SelectTrigger>
              <SelectContent>
                {props.admins.map((admin) => <SelectItem key={admin.user_id} value={admin.user_id}>{adminName(admin)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={props.onAssign}><UserPlus className="w-4 h-4 mr-1" />Assign</Button>
        </div>
        <div>
          <Label>Review Note</Label>
          <Textarea rows={4} value={props.note} onChange={(event) => props.setNote(event.target.value)} placeholder="Required for every review action." />
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => props.onAction("escalate")}><AlertTriangle className="w-4 h-4 mr-1" />Escalate</Button>
          <Button variant="secondary" onClick={() => props.onAction("needs_changes")}><Clock className="w-4 h-4 mr-1" />Request Changes</Button>
          <Button variant="destructive" onClick={() => props.onAction("reject")}><XCircle className="w-4 h-4 mr-1" />Reject</Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => props.onAction("approve")}><CheckCircle2 className="w-4 h-4 mr-1" />Approve</Button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></Card>;
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded border p-2"><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium capitalize">{String(value || "None")}</p></div>;
}

function WarningList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border p-3 text-sm">
      <h3 className="font-semibold mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-600" />{title}</h3>
      <div className="space-y-1">{items.map((item, index) => <p key={`${item}-${index}`} className="text-muted-foreground">{item}</p>)}</div>
    </div>
  );
}

function matchesFilters(item: QueueItem, release: ReleaseRow, tracks: TrackRow[], filters: Record<string, string>) {
  if (!release) return false;
  const haystack = [
    release.title,
    release.primary_artist,
    release.upc,
    ...tracks.flatMap((track) => [track.title, track.primary_artist, track.isrc]),
  ].join(" ").toLowerCase();
  if (filters.search && !haystack.includes(filters.search.toLowerCase())) return false;
  if (filters.artist && !String(release.primary_artist || "").toLowerCase().includes(filters.artist.toLowerCase())) return false;
  if (filters.genre !== "all" && release.genre !== filters.genre) return false;
  if (filters.releaseType !== "all" && release.release_type !== filters.releaseType) return false;
  if (filters.minScore && item.validation_score < Number(filters.minScore)) return false;
  if (filters.startDate && new Date(item.created_at) < new Date(filters.startDate)) return false;
  if (filters.endDate && new Date(item.created_at) > new Date(`${filters.endDate}T23:59:59`)) return false;
  return true;
}

function validationReason(validation: ValidationRow) {
  const details = validation.details || {};
  if (Array.isArray(details.errors) && details.errors.length) return details.errors.join(" ");
  if (Array.isArray(details.warnings) && details.warnings.length) return details.warnings.join(" ");
  return validation.status === "passed" ? "Passed." : "Requires review.";
}

function groupByRelease(rows: any[]) {
  return rows.reduce<Record<string, any[]>>((acc, row) => {
    acc[row.release_id] = [...(acc[row.release_id] || []), row];
    return acc;
  }, {});
}

function indexById(rows: any[]) {
  return rows.reduce<Record<string, any>>((acc, row) => {
    acc[row.id] = row;
    return acc;
  }, {});
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function shortId(value: string) {
  return `${value.slice(0, 8)}...`;
}

function adminName(admin: AdminUser) {
  return admin.profiles?.full_name || admin.profiles?.artist_name || `${admin.role}: ${shortId(admin.user_id)}`;
}
