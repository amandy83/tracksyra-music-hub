import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, Disc3, RadioTower, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import RoyaltyPayoutDashboard from "@/components/RoyaltyPayoutDashboard";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ChartLoading, EmptyState, GlassCard, KpiCard, SectionHeader } from "@/components/dashboard/DashboardPrimitives";

const client = supabase as any;

type Relationship = { id: string; publisher_user_id: string; label_user_id: string; status: string };
type LabelArtist = { id: string; label_user_id: string; artist_user_id: string; status: string };

export default function PublisherDashboard() {
  const { user } = useAuth();
  const [publisherLabels, setPublisherLabels] = useState<Relationship[]>([]);
  const [labelArtists, setLabelArtists] = useState<LabelArtist[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [pitches, setPitches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      const [{ data: labels }, { data: artists }, { data: releaseRows }, { data: pitchRows }] = await Promise.all([
        client.from("publisher_labels").select("*").eq("publisher_user_id", user.id).eq("status", "active"),
        client.from("label_artists").select("*").eq("status", "active"),
        client.from("music_releases").select("id,title,status,owner_user_id,created_at"),
        client.from("playlist_pitches").select("id,status,user_id,created_at"),
      ]);
      setPublisherLabels(labels || []);
      setLabelArtists(artists || []);
      setReleases(releaseRows || []);
      setPitches(pitchRows || []);
      setLoading(false);
    };
    void load();
  }, [user]);

  const labelIds = new Set(publisherLabels.map((item) => item.label_user_id));
  const artistIds = new Set(labelArtists.filter((item) => labelIds.has(item.label_user_id)).map((item) => item.artist_user_id));
  const managedReleases = releases.filter((release) => artistIds.has(release.owner_user_id) || labelIds.has(release.owner_user_id));
  const managedPitches = pitches.filter((pitch) => artistIds.has(pitch.user_id) || labelIds.has(pitch.user_id));
  const pendingApprovals = managedReleases.filter((release) => ["submitted", "under_review", "validation_pending"].includes(release.status)).length;

  const chartData = useMemo(() => {
    const counts = managedReleases.reduce<Record<string, number>>((acc, release) => {
      const status = String(release.status || "draft").replace(/_/g, " ");
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [managedReleases]);

  return (
    <DashboardShell
      title="Publisher Dashboard"
      eyebrow="Distribution operations"
      actions={<Button className="rounded-xl" variant="hero" asChild><a href="/dashboard/label-management">Manage Labels</a></Button>}
    >
      {loading ? (
        <GlassCard className="p-5"><ChartLoading /></GlassCard>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Labels" value={publisherLabels.length} delta={6} comparison="managed accounts" icon={Building2} accent="pink" />
            <KpiCard label="Artists" value={artistIds.size} delta={9} comparison="roster coverage" icon={Users} accent="teal" />
            <KpiCard label="Releases" value={managedReleases.length} delta={12} comparison="catalog volume" icon={Disc3} accent="blue" />
            <KpiCard label="Pending Approvals" value={pendingApprovals} delta={pendingApprovals ? -2 : 0} comparison="review queue" icon={RadioTower} accent="amber" />
            <KpiCard label="Playlist Ops" value={managedPitches.length} delta={8} comparison="active campaigns" icon={TrendingUp} accent="green" />
          </section>

          <GlassCard className="p-5">
            <SectionHeader title="Release Operations" description="Publisher-level release status across assigned labels and artists." />
            {chartData.length ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="status" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#ec4899" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState title="No publisher catalog yet" description="Assign labels and artists to see distribution, release approvals, playlist operations, analytics, and revenue reporting." actionLabel="Open assignments" onAction={() => { window.location.href = "/dashboard/artist-assignments"; }} icon={Building2} />
            )}
          </GlassCard>

          <RoyaltyPayoutDashboard role="publisher" />
        </div>
      )}
    </DashboardShell>
  );
}
