import { loadCampaignCenterWorkspace, type CampaignCenterWorkspace } from "./campaignCenterData";
import { loadPreSaveWorkspace, type PreSaveWorkspace } from "./preSaveCampaignData";
import { supabase } from "@/integrations/supabase/client";

const client = supabase as any;

export type DspPlaylistPerformanceRow = {
  placement_id: string;
  pitch_id: string;
  curator_name: string;
  playlist_name: string | null;
  spotify_playlist_url: string | null;
  release_id: string;
  release_title: string;
  track_id: string;
  track_title: string;
  placement_date: string;
  removal_date: string | null;
  placement_status: string;
  notes: string | null;
  streams_before: number;
  streams_after: number;
  streams_gained: number;
  listeners_gained: number;
  saves_gained: number;
  stream_growth_percent: number;
  placement_duration_days: number;
  estimated_reach: number;
  effectiveness_score: number;
  last_snapshot_at: string | null;
  genre: string | null;
  territory: string | null;
};

export type DspPitchAnalyticsRow = {
  id: string;
  user_id: string;
  release_id: string;
  track_id: string;
  release_title: string;
  track_title: string;
  status: string;
  genre: string | null;
  territory: string | null;
  artist_country: string | null;
  total_curators_sent: number;
  accepted_count: number;
  rejected_count: number;
  curator_response_rate: number;
  estimated_playlist_reach: number;
  opened_count: number;
  reviewed_count: number;
  playlist_added_count: number;
  created_at: string;
  updated_at: string;
};

export type DspTimelineRow = {
  snapshot_id: string;
  placement_id: string;
  streams: number;
  listeners: number;
  saves: number;
  followers: number;
  playlist_followers: number;
  collected_at: string;
  playlist_name: string | null;
  curator_name: string;
};

export type DspAnalyticsSnapshotRow = {
  id: string;
  user_id: string;
  snapshot_date: string;
  streams: number;
  saves: number;
  playlist_adds: number;
  followers: number;
  reach: number;
  engagement: number;
  created_at: string;
  updated_at: string;
};

export type DspAudienceMetricRow = {
  id: string;
  user_id: string;
  metric_date: string;
  country: string;
  city: string;
  followers: number;
  reach: number;
  engagement: number;
  growth_rate: number;
  created_at: string;
  updated_at: string;
};

export type DspAnalyticsStats = {
  streams: number;
  saves: number;
  playlistAdds: number;
  followers: number;
  reach: number;
  engagement: number;
  activeCampaigns: number;
  totalCampaigns: number;
  totalPreSaveCampaigns: number;
  totalPlaylistPitches: number;
};

export type DspAnalyticsPoint = {
  date: string;
  label: string;
  streams: number;
  saves: number;
  playlistAdds: number;
  followers: number;
  reach: number;
  engagement: number;
};

export type DspAudienceCountryRow = {
  country: string;
  followers: number;
  reach: number;
  engagement: number;
};

export type DspAudienceCityRow = {
  city: string;
  followers: number;
  reach: number;
  engagement: number;
};

export type DspAnalyticsWorkspace = {
  playlistPerformance: DspPlaylistPerformanceRow[];
  pitchAnalytics: DspPitchAnalyticsRow[];
  timeline: DspTimelineRow[];
  snapshots: DspAnalyticsSnapshotRow[];
  audienceMetrics: DspAudienceMetricRow[];
  campaignWorkspace: CampaignCenterWorkspace;
  preSaveWorkspace: PreSaveWorkspace;
  stats: DspAnalyticsStats;
  dailySeries: DspAnalyticsPoint[];
  weeklySeries: DspAnalyticsPoint[];
  monthlySeries: DspAnalyticsPoint[];
  countryBreakdown: DspAudienceCountryRow[];
  cityBreakdown: DspAudienceCityRow[];
  growthTrend: DspAnalyticsPoint[];
};

export async function loadDspAnalyticsWorkspace(userId: string): Promise<DspAnalyticsWorkspace> {
  const [performanceResult, pitchResult, timelineResult, snapshotResult, audienceResult, campaignWorkspace, preSaveWorkspace] = await Promise.all([
    client.from("playlist_performance_artist_dashboard").select("*").order("placement_date", { ascending: false }),
    client.from("playlist_pitch_artist_dashboard").select("*").order("created_at", { ascending: false }),
    client.from("playlist_performance_timeline").select("*").order("collected_at", { ascending: true }),
    client.from("dsp_analytics_snapshots").select("*").eq("user_id", userId).order("snapshot_date", { ascending: true }),
    client.from("dsp_audience_metrics").select("*").eq("user_id", userId).order("metric_date", { ascending: true }),
    loadCampaignCenterWorkspace(userId),
    loadPreSaveWorkspace(userId),
  ]);

  const playlistPerformance = (performanceResult.data || []) as DspPlaylistPerformanceRow[];
  const pitchAnalytics = (pitchResult.data || []) as DspPitchAnalyticsRow[];
  const timeline = (timelineResult.data || []) as DspTimelineRow[];
  const snapshots = (snapshotResult.data || []) as DspAnalyticsSnapshotRow[];
  const audienceMetrics = (audienceResult.data || []) as DspAudienceMetricRow[];

  const playlistStreams = playlistPerformance.reduce((sum, row) => sum + Number(row.streams_gained || 0), 0);
  const playlistSaves = playlistPerformance.reduce((sum, row) => sum + Number(row.saves_gained || 0), 0);
  const playlistAdds = pitchAnalytics.reduce((sum, row) => sum + Number(row.playlist_added_count || 0), 0);
  const playlistReach = playlistPerformance.reduce((sum, row) => sum + Number(row.estimated_reach || 0), 0);
  const audienceFollowers = audienceMetrics.reduce((sum, row) => sum + Number(row.followers || 0), 0);
  const audienceReach = audienceMetrics.reduce((sum, row) => sum + Number(row.reach || 0), 0);
  const audienceEngagement = audienceMetrics.reduce((sum, row) => sum + Number(row.engagement || 0), 0);

  const stats: DspAnalyticsStats = {
    streams: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.streams || 0), 0) : playlistStreams,
    saves: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.saves || 0), 0) : playlistSaves + preSaveWorkspace.stats.totalSaves,
    playlistAdds: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.playlist_adds || 0), 0) : playlistAdds,
    followers: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.followers || 0), 0) : audienceFollowers || playlistPerformance.reduce((sum, row) => sum + Number(row.listeners_gained || 0), 0),
    reach: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.reach || 0), 0) : playlistReach + campaignWorkspace.stats.totalReach + audienceReach,
    engagement: snapshots.length ? snapshots.reduce((sum, row) => sum + Number(row.engagement || 0), 0) : playlistPerformance.reduce((sum, row) => sum + Number(row.listeners_gained || 0), 0) + campaignWorkspace.stats.totalEngagement + preSaveWorkspace.stats.totalSaves + audienceEngagement,
    activeCampaigns: campaignWorkspace.stats.activeCampaigns,
    totalCampaigns: campaignWorkspace.stats.totalCampaigns,
    totalPreSaveCampaigns: preSaveWorkspace.stats.totalCampaigns,
    totalPlaylistPitches: pitchAnalytics.length,
  };

  const seedPoints = snapshots.length
    ? snapshots.map((row) => ({
        date: row.snapshot_date,
        label: row.snapshot_date,
        streams: Number(row.streams || 0),
        saves: Number(row.saves || 0),
        playlistAdds: Number(row.playlist_adds || 0),
        followers: Number(row.followers || 0),
        reach: Number(row.reach || 0),
        engagement: Number(row.engagement || 0),
      }))
    : timeline.length
      ? timeline.map((row) => ({
          date: row.collected_at,
          label: row.collected_at,
          streams: Number(row.streams || 0),
          saves: Number(row.saves || 0),
          playlistAdds: 0,
          followers: Number(row.followers || 0),
          reach: Number(row.playlist_followers || 0),
          engagement: Number(row.listeners || 0) + Number(row.saves || 0),
        }))
      : [{
          date: new Date().toISOString(),
          label: new Date().toISOString(),
          streams: stats.streams,
          saves: stats.saves,
          playlistAdds: stats.playlistAdds,
          followers: stats.followers,
          reach: stats.reach,
          engagement: stats.engagement,
        }];

  return {
    playlistPerformance,
    pitchAnalytics,
    timeline,
    snapshots,
    audienceMetrics,
    campaignWorkspace,
    preSaveWorkspace,
    stats,
    dailySeries: aggregateSeries(seedPoints, "daily"),
    weeklySeries: aggregateSeries(seedPoints, "weekly"),
    monthlySeries: aggregateSeries(seedPoints, "monthly"),
    countryBreakdown: aggregateCountries(audienceMetrics),
    cityBreakdown: aggregateCities(audienceMetrics),
    growthTrend: buildGrowthTrend(audienceMetrics),
  };
}

function aggregateSeries(points: DspAnalyticsPoint[], period: "daily" | "weekly" | "monthly"): DspAnalyticsPoint[] {
  const buckets = new Map<string, DspAnalyticsPoint>();
  points.forEach((point) => {
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) return;
    const bucket = getBucket(date, period);
    const current = buckets.get(bucket.key) || {
      date: bucket.key,
      label: bucket.label,
      streams: 0,
      saves: 0,
      playlistAdds: 0,
      followers: 0,
      reach: 0,
      engagement: 0,
    };
    current.streams += Number(point.streams || 0);
    current.saves += Number(point.saves || 0);
    current.playlistAdds += Number(point.playlistAdds || 0);
    current.followers += Number(point.followers || 0);
    current.reach += Number(point.reach || 0);
    current.engagement += Number(point.engagement || 0);
    buckets.set(bucket.key, current);
  });
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateCountries(rows: DspAudienceMetricRow[]): DspAudienceCountryRow[] {
  const map = new Map<string, DspAudienceCountryRow>();
  rows.forEach((row) => {
    const key = row.country || "Unknown";
    const current = map.get(key) || { country: key, followers: 0, reach: 0, engagement: 0 };
    current.followers += Number(row.followers || 0);
    current.reach += Number(row.reach || 0);
    current.engagement += Number(row.engagement || 0);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.followers - a.followers).slice(0, 8);
}

function aggregateCities(rows: DspAudienceMetricRow[]): DspAudienceCityRow[] {
  const map = new Map<string, DspAudienceCityRow>();
  rows.forEach((row) => {
    const key = row.city || "Unknown";
    const current = map.get(key) || { city: key, followers: 0, reach: 0, engagement: 0 };
    current.followers += Number(row.followers || 0);
    current.reach += Number(row.reach || 0);
    current.engagement += Number(row.engagement || 0);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.followers - a.followers).slice(0, 10);
}

function buildGrowthTrend(rows: DspAudienceMetricRow[]): DspAnalyticsPoint[] {
  const buckets = new Map<string, DspAnalyticsPoint>();
  rows.forEach((row) => {
    const date = new Date(row.metric_date);
    if (Number.isNaN(date.getTime())) return;
    const key = date.toISOString().slice(0, 10);
    const current = buckets.get(key) || {
      date: key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      streams: 0,
      saves: 0,
      playlistAdds: 0,
      followers: 0,
      reach: 0,
      engagement: 0,
    };
    current.followers += Number(row.followers || 0);
    current.reach += Number(row.reach || 0);
    current.engagement += Number(row.engagement || 0);
    current.streams += Number(row.growth_rate || 0);
    buckets.set(key, current);
  });
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function getBucket(date: Date, period: "daily" | "weekly" | "monthly") {
  if (period === "monthly") {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString(undefined, { month: "short", year: "numeric" }) };
  }

  if (period === "weekly") {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    const key = copy.toISOString().slice(0, 10);
    return { key, label: `Week of ${copy.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` };
  }

  const key = date.toISOString().slice(0, 10);
  return { key, label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) };
}
