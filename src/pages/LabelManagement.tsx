import { useEffect, useMemo, useState } from "react";
import { Building2, Link2, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoles } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

const client = supabase as any;

type RoleRow = { user_id: string; role: string };
type Profile = { id: string; artist_name: string | null; full_name: string | null; country: string | null };
type PublisherLabel = { id: string; publisher_user_id: string; label_user_id: string; status: string };
type LabelArtist = { id: string; label_user_id: string; artist_user_id: string; status: string };

export default function LabelManagement() {
  const { user } = useAuth();
  const roles = useRoles();
  const [roleRows, setRoleRows] = useState<RoleRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [publisherLabels, setPublisherLabels] = useState<PublisherLabel[]>([]);
  const [labelArtists, setLabelArtists] = useState<LabelArtist[]>([]);
  const [selectedPublisher, setSelectedPublisher] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const [selectedArtist, setSelectedArtist] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: rr }, { data: profileRows }, { data: pl }, { data: la }] = await Promise.all([
      client.from("user_roles").select("user_id,role").in("role", ["super_admin", "publisher", "label", "artist"]),
      client.from("profiles").select("id,artist_name,full_name,country"),
      client.from("publisher_labels").select("*").order("created_at", { ascending: false }),
      client.from("label_artists").select("*").order("created_at", { ascending: false }),
    ]);
    setRoleRows(rr || []);
    setProfiles(profileRows || []);
    setPublisherLabels(pl || []);
    setLabelArtists(la || []);
  };

  useEffect(() => { void load(); }, []);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const publishers = roleRows.filter((row) => row.role === "publisher" || row.role === "super_admin");
  const labels = roleRows.filter((row) => row.role === "label");
  const artists = roleRows.filter((row) => row.role === "artist");
  const visibleLabelArtists = labelArtists.filter((item) => {
    if (roles.isSuperAdmin) return true;
    if (roles.isPublisher) return publisherLabels.some((link) => link.publisher_user_id === user?.id && link.label_user_id === item.label_user_id && link.status === "active");
    return item.label_user_id === user?.id || item.artist_user_id === user?.id;
  });

  const filteredAssignments = visibleLabelArtists.filter((item) => {
    const haystack = [displayName(profileById.get(item.label_user_id)), displayName(profileById.get(item.artist_user_id)), item.status].join(" ").toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  const assignLabel = async () => {
    if (!selectedPublisher || !selectedLabel || !user) return toast.error("Select publisher and label.");
    setSaving(true);
    const { error } = await client.from("publisher_labels").upsert({
      publisher_user_id: selectedPublisher,
      label_user_id: selectedLabel,
      status: "active",
      created_by: user.id,
    }, { onConflict: "publisher_user_id,label_user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Label assigned to publisher.");
    await load();
  };

  const assignArtist = async () => {
    if (!selectedLabel || !selectedArtist || !user) return toast.error("Select label and artist.");
    setSaving(true);
    const { error } = await client.from("label_artists").upsert({
      label_user_id: selectedLabel,
      artist_user_id: selectedArtist,
      status: "active",
      created_by: user.id,
    }, { onConflict: "label_user_id,artist_user_id" });
    if (!error) {
      await client.from("artist_assignment_audit_logs").insert({
        actor_user_id: user.id,
        action: "assign_artist_to_label",
        label_user_id: selectedLabel,
        artist_user_id: selectedArtist,
      });
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Artist assigned to label.");
    await load();
  };

  return (
    <DashboardShell
      title="Label Management"
      eyebrow="Roster hierarchy"
      actions={<Button variant="outline" className="rounded-xl bg-white/75" asChild><a href="/dashboard/artist-assignments">Artist Assignment System</a></Button>}
    >
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Publishers" value={publishers.length} delta={4} comparison="distribution owners" icon={Building2} accent="pink" />
          <KpiCard label="Labels" value={labels.length} delta={6} comparison="managed companies" icon={Link2} accent="teal" />
          <KpiCard label="Artists" value={artists.length} delta={9} comparison="available roster" icon={Users} accent="blue" />
          <KpiCard label="Assignments" value={labelArtists.length} delta={8} comparison="active links" icon={Search} accent="green" />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <GlassCard className="p-5">
            <SectionHeader title="Publisher To Label" description="Super admins assign labels to publishers for distribution and reporting oversight." />
            <div className="grid gap-3">
              <Select value={selectedPublisher} onValueChange={setSelectedPublisher} disabled={!roles.isSuperAdmin}>
                <SelectTrigger><SelectValue placeholder="Select publisher" /></SelectTrigger>
                <SelectContent>{publishers.map((row) => <SelectItem key={row.user_id} value={row.user_id}>{displayName(profileById.get(row.user_id))}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                <SelectTrigger><SelectValue placeholder="Select label" /></SelectTrigger>
                <SelectContent>{labels.map((row) => <SelectItem key={row.user_id} value={row.user_id}>{displayName(profileById.get(row.user_id))}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="hero" className="rounded-xl" onClick={assignLabel} disabled={saving || !roles.isSuperAdmin}>Assign Label</Button>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <SectionHeader title="Label To Artist" description="Labels and publishers assign artists into managed rosters." />
            <div className="grid gap-3">
              <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                <SelectTrigger><SelectValue placeholder="Select label" /></SelectTrigger>
                <SelectContent>{labels.map((row) => <SelectItem key={row.user_id} value={row.user_id}>{displayName(profileById.get(row.user_id))}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={selectedArtist} onValueChange={setSelectedArtist}>
                <SelectTrigger><SelectValue placeholder="Select artist" /></SelectTrigger>
                <SelectContent>{artists.map((row) => <SelectItem key={row.user_id} value={row.user_id}>{displayName(profileById.get(row.user_id))}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="hero" className="rounded-xl" onClick={assignArtist} disabled={saving}>Assign Artist</Button>
            </div>
          </GlassCard>
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Artist Assignments" description="Active label to artist relationships visible through the current role hierarchy." />
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search labels or artists" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          {filteredAssignments.length ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredAssignments.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/80 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{displayName(profileById.get(item.artist_user_id))}</p>
                      <p className="text-sm text-slate-500">Label: {displayName(profileById.get(item.label_user_id))}</p>
                    </div>
                    <Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No artist assignments" description="Assign artists to labels to unlock roster-level catalog, analytics, campaign, and revenue access." actionLabel="Create assignment" onAction={() => null} icon={Users} />
          )}
        </GlassCard>
      </div>
    </DashboardShell>
  );
}

function displayName(profile?: Profile) {
  return profile?.artist_name || profile?.full_name || profile?.id?.slice(0, 8) || "Unknown user";
}
