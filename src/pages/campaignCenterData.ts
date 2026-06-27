import { supabase } from "@/integrations/supabase/client";

const client = supabase as any;

export const CAMPAIGN_TYPES = ["spotify", "youtube", "tiktok", "instagram"] as const;
export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignRow = {
  id: string;
  user_id: string;
  campaign_name: string;
  campaign_type: CampaignType | string;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  status: CampaignStatus | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignMetricRow = {
  id: string;
  campaign_id: string;
  total_reach: number;
  total_engagement: number;
  created_at: string;
  updated_at: string;
};

export type CampaignCenterStats = {
  totalCampaigns: number;
  activeCampaigns: number;
  totalReach: number;
  totalEngagement: number;
};

export type CampaignCenterWorkspace = {
  campaigns: CampaignRow[];
  metrics: CampaignMetricRow[];
  stats: CampaignCenterStats;
};

export function formatCampaignType(value: string) {
  return value.replace(/_/g, " ");
}

export function formatCampaignStatus(value: string) {
  return value.replace(/_/g, " ");
}

export function calculateCampaignCenterStats(campaigns: CampaignRow[], metrics: CampaignMetricRow[]): CampaignCenterStats {
  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
    totalReach: metrics.reduce((sum, metric) => sum + Number(metric.total_reach || 0), 0),
    totalEngagement: metrics.reduce((sum, metric) => sum + Number(metric.total_engagement || 0), 0),
  };
}

export function buildCampaignCenterMetrics(campaigns: CampaignRow[], metrics: CampaignMetricRow[]) {
  const byCampaign = new Map<string, CampaignMetricRow>();
  metrics.forEach((metric) => byCampaign.set(metric.campaign_id, metric));

  return campaigns.map((campaign) => {
    const metric = byCampaign.get(campaign.id) || null;
    return {
      campaign,
      metric,
      totalReach: Number(metric?.total_reach || 0),
      totalEngagement: Number(metric?.total_engagement || 0),
      engagementRate: Number(metric?.total_reach || 0) > 0 ? Math.round((Number(metric?.total_engagement || 0) / Number(metric?.total_reach || 1)) * 100) : 0,
    };
  });
}

export async function loadCampaignCenterWorkspace(userId: string): Promise<CampaignCenterWorkspace> {
  const campaignResult = await client.from("dsp_campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  const campaigns = (campaignResult.data || []) as CampaignRow[];
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const metricResult = campaignIds.length
    ? await client.from("dsp_campaign_metrics").select("*").in("campaign_id", campaignIds)
    : { data: [], error: null };
  const metrics = (metricResult.data || []) as CampaignMetricRow[];
  const stats = calculateCampaignCenterStats(campaigns, metrics);
  return { campaigns, metrics, stats };
}

export async function loadCampaignCenterCampaign(campaignId: string, userId?: string) {
  const campaignResult = userId
    ? await client.from("dsp_campaigns").select("*").eq("id", campaignId).eq("user_id", userId).maybeSingle()
    : await client.from("dsp_campaigns").select("*").eq("id", campaignId).maybeSingle();
  const campaign = campaignResult.data as CampaignRow | null;
  if (!campaign) return { campaign: null, metric: null };

  const metricResult = await client.from("dsp_campaign_metrics").select("*").eq("campaign_id", campaign.id).maybeSingle();
  const metric = metricResult.data as CampaignMetricRow | null;
  return { campaign, metric };
}

export async function createCampaign(input: {
  userId: string;
  campaignName: string;
  campaignType: CampaignType;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  status: CampaignStatus;
  notes: string | null;
}) {
  const campaignResult = await client.from("dsp_campaigns").insert({
    user_id: input.userId,
    campaign_name: input.campaignName,
    campaign_type: input.campaignType,
    budget: input.budget,
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status,
    notes: input.notes,
  }).select("*").single();

  if (campaignResult.error || !campaignResult.data) return campaignResult;

  const metricResult = await client.from("dsp_campaign_metrics").insert({
    campaign_id: campaignResult.data.id,
    total_reach: 0,
    total_engagement: 0,
  });

  if (metricResult.error) return metricResult;
  return campaignResult;
}

export async function updateCampaign(input: {
  campaignId: string;
  userId: string;
  campaignName: string;
  campaignType: CampaignType;
  budget: number;
  startDate: string | null;
  endDate: string | null;
  status: CampaignStatus;
  notes: string | null;
}) {
  return client.from("dsp_campaigns").update({
    campaign_name: input.campaignName,
    campaign_type: input.campaignType,
    budget: input.budget,
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  }).eq("id", input.campaignId).eq("user_id", input.userId).select("*").single();
}

export async function updateCampaignStatus(input: { campaignId: string; userId: string; status: CampaignStatus }) {
  return client.from("dsp_campaigns").update({ status: input.status, updated_at: new Date().toISOString() }).eq("id", input.campaignId).eq("user_id", input.userId).select("*").single();
}
