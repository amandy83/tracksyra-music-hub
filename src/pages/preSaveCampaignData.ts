import { supabase } from "@/integrations/supabase/client";

const client = supabase as any;

export type PreSaveReleaseRow = {
  id: string;
  title: string;
  primary_artist: string;
  genre: string | null;
  language: string | null;
  release_date: string | null;
  status: string;
  cover_art_url: string | null;
  created_at: string;
};

export type PreSaveCampaignRow = {
  id: string;
  user_id: string;
  release_id: string;
  campaign_name: string;
  smart_link_slug: string;
  status: string;
  launch_date: string | null;
  destination_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PreSaveEventRow = {
  id: string;
  campaign_id: string;
  event_type: "click" | "save" | string;
  referrer: string | null;
  visitor_id: string | null;
  user_agent: string | null;
  created_at: string;
};

export type PreSaveCampaignStats = {
  totalCampaigns: number;
  totalClicks: number;
  totalSaves: number;
  conversionRate: number;
  activeCampaigns: number;
  scheduledCampaigns: number;
  draftCampaigns: number;
};

export type PreSaveWorkspace = {
  releases: PreSaveReleaseRow[];
  campaigns: PreSaveCampaignRow[];
  events: PreSaveEventRow[];
  stats: PreSaveCampaignStats;
};

export const PRE_SAVE_STATUSES = ["draft", "scheduled", "active", "paused", "completed"] as const;

export function slugifyPreSaveCampaign(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getPreSaveLink(slug: string) {
  if (typeof window === "undefined") return `/pre-save/${slug}`;
  return `${window.location.origin}/pre-save/${slug}`;
}

export function buildSmartLinkSlug(campaignName: string, releaseTitle: string) {
  const base = slugifyPreSaveCampaign(`${campaignName}-${releaseTitle}`);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "pre-save"}-${suffix}`;
}

export function getVisitorId() {
  if (typeof window === "undefined") return null;
  const key = "tracksyra_presave_visitor_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `visitor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export async function loadPreSaveWorkspace(userId: string): Promise<PreSaveWorkspace> {
  const [releaseResult, campaignResult] = await Promise.all([
    client.from("releases").select("id,title,primary_artist,genre,language,release_date,status,cover_art_url,created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    client.from("dsp_pre_save_campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  const releases = (releaseResult.data || []) as PreSaveReleaseRow[];
  const campaigns = (campaignResult.data || []) as PreSaveCampaignRow[];
  const campaignIds = campaigns.map((campaign) => campaign.id);
  const eventsResult = campaignIds.length
    ? await client.from("dsp_pre_save_events").select("*").in("campaign_id", campaignIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  const events = (eventsResult.data || []) as PreSaveEventRow[];

  const stats = calculateCampaignStats(campaigns, events);
  return { releases, campaigns, events, stats };
}

export async function loadPreSaveCampaignBySlug(slug: string) {
  const campaignResult = await client.from("dsp_pre_save_campaigns").select("*").eq("smart_link_slug", slug).maybeSingle();
  const campaign = campaignResult.data as PreSaveCampaignRow | null;
  if (!campaign) return { campaign: null, release: null, clickCount: 0, saveCount: 0 };

  const [releaseResult, eventResult] = await Promise.all([
    client.from("releases").select("id,title,primary_artist,genre,language,release_date,status,cover_art_url,created_at").eq("id", campaign.release_id).maybeSingle(),
    client.from("dsp_pre_save_events").select("*").eq("campaign_id", campaign.id).order("created_at", { ascending: false }),
  ]);

  const release = releaseResult.data as PreSaveReleaseRow | null;
  const events = (eventResult.data || []) as PreSaveEventRow[];
  return {
    campaign,
    release,
    clickCount: events.filter((event) => event.event_type === "click").length,
    saveCount: events.filter((event) => event.event_type === "save").length,
  };
}

export function calculateCampaignStats(campaigns: PreSaveCampaignRow[], events: PreSaveEventRow[]): PreSaveCampaignStats {
  const totalClicks = events.filter((event) => event.event_type === "click").length;
  const totalSaves = events.filter((event) => event.event_type === "save").length;
  const totalCampaigns = campaigns.length;
  const conversionRate = totalClicks > 0 ? Math.round((totalSaves / totalClicks) * 100) : 0;
  return {
    totalCampaigns,
    totalClicks,
    totalSaves,
    conversionRate,
    activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
    scheduledCampaigns: campaigns.filter((campaign) => campaign.status === "scheduled").length,
    draftCampaigns: campaigns.filter((campaign) => campaign.status === "draft").length,
  };
}

export function buildCampaignMetrics(campaigns: PreSaveCampaignRow[], events: PreSaveEventRow[]) {
  const byCampaign = new Map<string, { clicks: number; saves: number; lastEventAt: string | null }>();
  campaigns.forEach((campaign) => {
    byCampaign.set(campaign.id, { clicks: 0, saves: 0, lastEventAt: null });
  });

  events.forEach((event) => {
    const current = byCampaign.get(event.campaign_id);
    if (!current) return;
    if (event.event_type === "click") current.clicks += 1;
    if (event.event_type === "save") current.saves += 1;
    if (!current.lastEventAt || event.created_at > current.lastEventAt) current.lastEventAt = event.created_at;
  });

  return campaigns.map((campaign) => {
    const metrics = byCampaign.get(campaign.id) || { clicks: 0, saves: 0, lastEventAt: null };
    const conversionRate = metrics.clicks > 0 ? Math.round((metrics.saves / metrics.clicks) * 100) : 0;
    return { campaign, ...metrics, conversionRate };
  });
}

export async function createPreSaveCampaign(input: {
  userId: string;
  releaseId: string;
  campaignName: string;
  status: string;
  launchDate: string | null;
  notes: string | null;
  destinationUrl: string | null;
  releaseTitle: string;
}) {
  const smartLinkSlug = buildSmartLinkSlug(input.campaignName, input.releaseTitle);
  return client.from("dsp_pre_save_campaigns").insert({
    user_id: input.userId,
    release_id: input.releaseId,
    campaign_name: input.campaignName,
    smart_link_slug: smartLinkSlug,
    status: input.status,
    launch_date: input.launchDate,
    notes: input.notes,
    destination_url: input.destinationUrl,
  }).select("*").single();
}

export async function trackPreSaveEvent(input: {
  campaignId: string;
  eventType: "click" | "save";
  referrer?: string | null;
  visitorId?: string | null;
  userAgent?: string | null;
}) {
  return client.from("dsp_pre_save_events").insert({
    campaign_id: input.campaignId,
    event_type: input.eventType,
    referrer: input.referrer || null,
    visitor_id: input.visitorId || null,
    user_agent: input.userAgent || null,
  });
}
