import type { DistributionPlatformName } from "../../distribution/models/distributionTypes";

export type RoyaltyPlatform = DistributionPlatformName | "spotify" | "apple_music" | "youtube_music";

export type MoneyCurrency = "USD";

export type RoyaltyRecord = {
  id: string;
  track_id: string;
  release_id: string;
  platform: RoyaltyPlatform;
  streams_count: number;
  revenue_per_stream: string;
  total_revenue: string;
  artist_id: string;
  calculation_key: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type RoyaltySplit = {
  track_id: string;
  user_id: string;
  percentage_share: string;
};

export type PlatformStreamCount = {
  platform: RoyaltyPlatform;
  streams_count: number;
};

export type TrackRoyaltyContext = {
  track_id: string;
  release_id: string;
  artist_id: string;
  featured_artists?: string[];
  genre?: string | null;
  language?: string | null;
};

export type CalculateTrackRevenueInput = {
  trackId: string;
  eventId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type TrackRevenueResult = {
  track_id: string;
  release_id: string;
  artist_id: string;
  total_revenue: string;
  records: RoyaltyRecord[];
};

export type SplitDistributionLine = {
  user_id: string;
  payable_amount: string;
  percentage_share: string;
  track_id: string;
  royalty_record_id: string;
};

export type SplitDistributionResult = {
  royalty_record_id: string;
  track_id: string;
  total_revenue: string;
  lines: SplitDistributionLine[];
};
