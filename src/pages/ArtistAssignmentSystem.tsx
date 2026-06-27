import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Link2, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

const client = supabase as any;

type Profile = { id: string; artist_name: string | null; full_name: string | null; country: string | null };
type Assignment = { id: string; label_user_id: string; artist_user_id: string; status: string; created_at: string };
type Audit = { id: string; action: string; actor_user_id: string | null; label_user_id: string | null; artist_user_id: string | null; created_at: string };

export default function ArtistAssignmentSystem() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      const [{ data: profileRows }, { data: assignmentRows }, { data: auditRows }] = await Promise.all([
        client.from("profiles").select("id,artist_name,full_name,country"),
        client.from("label_artists").select("*").order("created_at", { ascending: false }),
        client.from("artist_assignment_audit_logs").select("*").order("created_at", { ascending: false }).limit(25),
      ]);
      setProfiles(profileRows || []);
      setAssignments(assignmentRows || []);
      setAudits(auditRows || []);
    };
    void load();
  }, [user]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const filtered = assignments.filter((assignment) => {
    const haystack = [name(profileById.get(assignment.label_user_id)), name(profileById.get(assignment.artist_user_id)), assignment.status].join(" ").toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });

  return (
    <DashboardShell title="Artist Assignment System" eyebrow="Access control" actions={null}>
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard label="Assignments" value={assignments.length} delta={8} comparison="label artist links" icon={Link2} accent="pink" />
          <KpiCard label="Active" value={assignments.filter((item) => item.status === "active").length} delta={6} comparison="enabled access" icon={Users} accent="green" />
          <KpiCard label="Audit Events" value={audits.length} delta={4} comparison="recent changes" icon={ClipboardCheck} accent="blue" />
        </section>

        <GlassCard className="p-5">
          <SectionHeader title="Assignment Matrix" description="Label to artist relationships that drive catalog, analytics, campaign, and revenue visibility." />
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search assignment matrix" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {filtered.length ? (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {filtered.map((assignment) => (
                <div key={assignment.id} className="rounded-2xl border border-white/80 bg-white/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">Artist</p>
                      <p className="font-bold">{name(profileById.get(assignment.artist_user_id))}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-500">Label</p>
                      <p className="font-bold">{name(profileById.get(assignment.label_user_id))}</p>
                    </div>
                    <Badge>{assignment.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No assignment links" description="Create label and artist relationships from Label Management to activate hierarchy permissions." actionLabel="Open label management" onAction={() => { window.location.href = "/dashboard/label-management"; }} icon={Users} />
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SectionHeader title="Assignment Audit" description="Recent artist assignment changes for security and operations review." />
          <div className="space-y-3">
            {audits.map((audit) => (
              <div key={audit.id} className="rounded-2xl border border-white/80 bg-white/70 p-3 text-sm">
                <div className="font-semibold">{audit.action.replace(/_/g, " ")}</div>
                <div className="text-slate-500">
                  {name(profileById.get(audit.artist_user_id || ""))} - {name(profileById.get(audit.label_user_id || ""))} - {new Date(audit.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {!audits.length && <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">No audit events yet.</div>}
          </div>
        </GlassCard>
      </div>
    </DashboardShell>
  );
}

function name(profile?: Profile) {
  return profile?.artist_name || profile?.full_name || profile?.id?.slice(0, 8) || "Unknown";
}
