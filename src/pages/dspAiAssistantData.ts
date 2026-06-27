import { supabase } from "@/integrations/supabase/client";
import { loadDspAnalyticsWorkspace, type DspAnalyticsWorkspace } from "./dspAnalyticsData";

const client = supabase as any;

export const AI_DSP_RECOMMENDATION_TYPES = [
  "best_release_day",
  "best_release_time",
  "recommended_countries",
  "recommended_curators",
  "recommended_campaign_type",
  "similar_artists",
] as const;

export type AiDspRecommendationType = (typeof AI_DSP_RECOMMENDATION_TYPES)[number];

export type AiDspPitchRow = {
  id: string;
  user_id: string;
  release_id: string;
  track_id: string;
  genre: string | null;
  subgenre: string | null;
  mood: string | null;
  mood_tags: string[] | null;
  language: string | null;
  territory: string | null;
  artist_country: string | null;
  similar_artists: string | null;
  status: string;
  priority_score: number;
  admin_notes: string | null;
  rejection_reason: string | null;
  curator_match_score: number | null;
  curator_recommendations: unknown;
  created_at: string;
  updated_at: string;
};

export type AiDspRecommendationRow = {
  id?: string;
  user_id: string;
  recommendation_type: AiDspRecommendationType;
  recommendation: string;
  confidence_score: number;
  reason: string;
  source_summary: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AiDspAssistantStats = {
  totalRecommendations: number;
  highConfidenceRecommendations: number;
  sourcesUsed: number;
  topConfidenceScore: number;
  recommendationTypes: number;
};

export type AiDspAssistantWorkspace = {
  analyticsWorkspace: DspAnalyticsWorkspace;
  pitchRows: AiDspPitchRow[];
  recommendations: AiDspRecommendationRow[];
  groupedRecommendations: Record<AiDspRecommendationType, AiDspRecommendationRow[]>;
  stats: AiDspAssistantStats;
};

export async function loadAiDspAssistantWorkspace(userId: string, analyticsWorkspace?: DspAnalyticsWorkspace): Promise<AiDspAssistantWorkspace> {
  const workspace = analyticsWorkspace || await loadDspAnalyticsWorkspace(userId);
  const pitchResult = await client
    .from("playlist_pitches")
    .select("id,user_id,release_id,track_id,genre,subgenre,mood,mood_tags,language,territory,artist_country,similar_artists,status,priority_score,admin_notes,rejection_reason,curator_match_score,curator_recommendations,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const pitchRows = (pitchResult.data || []) as AiDspPitchRow[];
  const recommendations = generateRecommendations(userId, workspace, pitchRows);
  await syncRecommendations(userId, recommendations);

  const groupedRecommendations = groupByType(recommendations);
  const topConfidenceScore = recommendations.reduce((max, item) => Math.max(max, Number(item.confidence_score || 0)), 0);
  const highConfidenceRecommendations = recommendations.filter((item) => Number(item.confidence_score || 0) >= 80).length;
  const sourcesUsed = [
    workspace.pitchAnalytics.length > 0,
    workspace.campaignWorkspace.campaigns.length > 0,
    workspace.preSaveWorkspace.campaigns.length > 0,
    workspace.audienceMetrics.length > 0,
    pitchRows.length > 0,
  ].filter(Boolean).length;

  return {
    analyticsWorkspace: workspace,
    pitchRows,
    recommendations,
    groupedRecommendations,
    stats: {
      totalRecommendations: recommendations.length,
      highConfidenceRecommendations,
      sourcesUsed,
      topConfidenceScore,
      recommendationTypes: AI_DSP_RECOMMENDATION_TYPES.length,
    },
  };
}

function generateRecommendations(userId: string, workspace: DspAnalyticsWorkspace, pitchRows: AiDspPitchRow[]): AiDspRecommendationRow[] {
  const recommendations: AiDspRecommendationRow[] = [];
  const dailyPoints = workspace.dailySeries.length ? workspace.dailySeries : workspace.snapshots.map((snapshot) => ({
    date: snapshot.snapshot_date,
    label: snapshot.snapshot_date,
    streams: Number(snapshot.streams || 0),
    saves: Number(snapshot.saves || 0),
    playlistAdds: Number(snapshot.playlist_adds || 0),
    followers: Number(snapshot.followers || 0),
    reach: Number(snapshot.reach || 0),
    engagement: Number(snapshot.engagement || 0),
  }));

  const dayBuckets = new Map<number, { score: number; label: string; count: number }>();
  dailyPoints.forEach((point) => {
    const date = new Date(point.date);
    if (Number.isNaN(date.getTime())) return;
    const day = date.getDay();
    const current = dayBuckets.get(day) || { score: 0, label: WEEKDAY_LABELS[day], count: 0 };
    current.score += weightedPerformance(point.streams, point.saves, point.playlistAdds, point.followers, point.reach, point.engagement);
    current.count += 1;
    dayBuckets.set(day, current);
  });
  const bestDay = selectTopEntry(dayBuckets);
  if (bestDay) {
    recommendations.push({
      user_id: userId,
      recommendation_type: "best_release_day",
      recommendation: bestDay.label,
      confidence_score: confidenceFromRank(bestDay.score, [...dayBuckets.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Weighted engagement across ${bestDay.count} day(s) peaks on ${bestDay.label}.`,
      source_summary: { bucketCount: dayBuckets.size, score: round(bestDay.score), day: bestDay.label },
    });
  }

  const timeBuckets = new Map<number, { score: number; label: string; count: number }>();
  workspace.preSaveWorkspace.events.forEach((event) => {
    const date = new Date(event.created_at);
    if (Number.isNaN(date.getTime())) return;
    const hour = Math.floor(date.getHours() / 2) * 2;
    const current = timeBuckets.get(hour) || { score: 0, label: formatHourWindow(hour), count: 0 };
    current.score += event.event_type === "save" ? 1.5 : 1;
    current.count += 1;
    timeBuckets.set(hour, current);
  });
  const bestTime = selectTopEntry(timeBuckets);
  if (bestTime) {
    recommendations.push({
      user_id: userId,
      recommendation_type: "best_release_time",
      recommendation: bestTime.label,
      confidence_score: confidenceFromRank(bestTime.score, [...timeBuckets.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Click and save activity is strongest in the ${bestTime.label} window.`,
      source_summary: { bucketCount: timeBuckets.size, score: round(bestTime.score), window: bestTime.label },
    });
  }

  const countryScores = new Map<string, { score: number; followers: number; reach: number; engagement: number; count: number }>();
  workspace.countryBreakdown.forEach((row) => {
    const current = countryScores.get(row.country) || { score: 0, followers: 0, reach: 0, engagement: 0, count: 0 };
    current.followers += Number(row.followers || 0);
    current.reach += Number(row.reach || 0);
    current.engagement += Number(row.engagement || 0);
    current.score += weightedPerformance(0, 0, 0, row.followers, row.reach, row.engagement);
    current.count += 1;
    countryScores.set(row.country, current);
  });
  [...countryScores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).forEach(([country, data], index) => {
    recommendations.push({
      user_id: userId,
      recommendation_type: "recommended_countries",
      recommendation: country,
      confidence_score: confidenceFromRank(data.score, [...countryScores.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Country rank ${index + 1} based on followers, reach, and engagement from audience metrics.`,
      source_summary: { rank: index + 1, followers: data.followers, reach: data.reach, engagement: data.engagement, score: round(data.score) },
    });
  });

  const curatorScores = new Map<string, { score: number; adds: number; streams: number; saves: number; reach: number; count: number }>();
  workspace.playlistPerformance.forEach((row) => {
    const key = row.curator_name || row.playlist_name || "Curator";
    const current = curatorScores.get(key) || { score: 0, adds: 0, streams: 0, saves: 0, reach: 0, count: 0 };
    current.streams += Number(row.streams_gained || 0);
    current.saves += Number(row.saves_gained || 0);
    current.reach += Number(row.estimated_reach || 0);
    current.score += (Number(row.estimated_reach || 0) * 0.45) + (Number(row.effectiveness_score || 0) * 9) + (Number(row.saves_gained || 0) * 120) + (Number(row.streams_gained || 0) * 0.08);
    current.count += 1;
    curatorScores.set(key, current);
  });
  [...curatorScores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).forEach(([curator, data], index) => {
    recommendations.push({
      user_id: userId,
      recommendation_type: "recommended_curators",
      recommendation: curator,
      confidence_score: confidenceFromRank(data.score, [...curatorScores.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Curator rank ${index + 1} combines playlist adds, estimated reach, and curator response rate.`,
      source_summary: { rank: index + 1, streams: data.streams, saves: data.saves, reach: data.reach, count: data.count },
    });
  });

  const campaignScores = new Map<string, { score: number; reach: number; engagement: number; count: number; label: string }>();
  workspace.campaignWorkspace.campaigns.forEach((campaign) => {
    const metric = workspace.campaignWorkspace.metrics.find((item) => item.campaign_id === campaign.id);
    const current = campaignScores.get(campaign.campaign_type) || { score: 0, reach: 0, engagement: 0, count: 0, label: campaign.campaign_type };
    const reach = Number(metric?.total_reach || 0);
    const engagement = Number(metric?.total_engagement || 0);
    current.reach += reach;
    current.engagement += engagement;
    current.score += (reach * 0.65) + (engagement * 1.35);
    current.count += 1;
    current.label = campaign.campaign_type;
    campaignScores.set(campaign.campaign_type, current);
  });
  const bestCampaignType = selectTopEntry(campaignScores);
  if (bestCampaignType) {
    recommendations.push({
      user_id: userId,
      recommendation_type: "recommended_campaign_type",
      recommendation: formatCampaignType(bestCampaignType.label),
      confidence_score: confidenceFromRank(bestCampaignType.score, [...campaignScores.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Highest weighted reach and engagement among existing campaign center campaigns.`,
      source_summary: { count: bestCampaignType.count, reach: round(bestCampaignType.reach), engagement: round(bestCampaignType.engagement) },
    });
  }

  const similarArtistScores = new Map<string, { score: number; count: number; genres: Set<string>; territories: Set<string> }>();
  pitchRows.forEach((pitch) => {
    parseSimilarArtists(pitch.similar_artists).forEach((artist) => {
      const current = similarArtistScores.get(artist) || { score: 0, count: 0, genres: new Set<string>(), territories: new Set<string>() };
      current.score += 1;
      current.count += 1;
      if (pitch.genre) current.genres.add(pitch.genre);
      if (pitch.territory) current.territories.add(pitch.territory);
      similarArtistScores.set(artist, current);
    });
  });
  [...similarArtistScores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).forEach(([artist, data], index) => {
    recommendations.push({
      user_id: userId,
      recommendation_type: "similar_artists",
      recommendation: artist,
      confidence_score: confidenceFromRank(data.score, [...similarArtistScores.values()].reduce((sum, item) => sum + item.score, 0)),
      reason: `Artist rank ${index + 1} is derived from repeated placement in pitch submissions and genre overlap.`,
      source_summary: { rank: index + 1, mentions: data.count, genres: [...data.genres].slice(0, 3), territories: [...data.territories].slice(0, 3) },
    });
  });

  return recommendations.sort((a, b) => {
    const typeOrder = AI_DSP_RECOMMENDATION_TYPES.indexOf(a.recommendation_type) - AI_DSP_RECOMMENDATION_TYPES.indexOf(b.recommendation_type);
    if (typeOrder !== 0) return typeOrder;
    return Number(b.confidence_score || 0) - Number(a.confidence_score || 0);
  });
}

async function syncRecommendations(userId: string, recommendations: AiDspRecommendationRow[]) {
  await client.from("dsp_ai_recommendations").delete().eq("user_id", userId);
  if (!recommendations.length) return;
  await client.from("dsp_ai_recommendations").insert(recommendations.map((recommendation) => ({
    user_id: recommendation.user_id,
    recommendation_type: recommendation.recommendation_type,
    recommendation: recommendation.recommendation,
    confidence_score: recommendation.confidence_score,
    reason: recommendation.reason,
    source_summary: recommendation.source_summary,
  })));
}

function weightedPerformance(streams: number, saves: number, playlistAdds: number, followers: number, reach: number, engagement: number) {
  return (Number(streams || 0) * 1) + (Number(saves || 0) * 1.25) + (Number(playlistAdds || 0) * 1.5) + (Number(followers || 0) * 0.4) + (Number(reach || 0) * 0.15) + (Number(engagement || 0) * 1.1);
}

function confidenceFromRank(score: number, total: number) {
  if (total <= 0) return 55;
  return Math.max(45, Math.min(99, Math.round((score / total) * 100)));
}

function selectTopEntry<T extends { score: number }>(map: Map<unknown, T>) {
  const entries = [...map.values()].sort((a, b) => b.score - a.score);
  return entries[0] || null;
}

function parseSimilarArtists(value: string | null) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatCampaignType(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} Campaign`;
}

function formatHourWindow(hour: number) {
  const start = hour % 24;
  const end = (hour + 2) % 24;
  return `${formatHour(start)} - ${formatHour(end)}`;
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 || 12;
  return `${display}:00 ${suffix}`;
}

function round(value: number) {
  return Math.round(Number(value || 0));
}

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function groupByType(recommendations: AiDspRecommendationRow[]) {
  return AI_DSP_RECOMMENDATION_TYPES.reduce((acc, type) => {
    acc[type] = recommendations.filter((item) => item.recommendation_type === type);
    return acc;
  }, {} as Record<AiDspRecommendationType, AiDspRecommendationRow[]>);
}
