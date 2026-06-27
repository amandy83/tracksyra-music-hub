export const DISTRIBUTION_PLATFORMS = [
  "too_lost",
] as const;

export const DISTRIBUTION_PROVIDERS = [
  "internal",
  "too_lost",
] as const;

export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORMS)[number];
export type DistributionProvider = (typeof DISTRIBUTION_PROVIDERS)[number];
export type LegacyDistributionPlatform = "spotify" | "apple_music" | "youtube_music" | "deezer" | "amazon_music";
export type DistributionPlatformName = DistributionPlatform | LegacyDistributionPlatform;

export type DistributionJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "DELIVERED"
  | "PUBLISHED"
  | "REJECTED"
  | "FAILED"
  | "DEAD_LETTER";

export type DistributionJob = {
  id: string;
  releaseId?: string;
  trackId?: string;
  platform: DistributionPlatformName;
  status: DistributionJobStatus;
  createdAt: Date;
  attempts?: number;
  nextRetryAt?: Date | null;
};

export type DistributionRelease = {
  id: string;
  userId: string;
  artistId?: string;
  title?: string;
  primaryArtist?: string;
  featuredArtists?: string[];
  releaseDate?: string | null;
  genre?: string | null;
  language?: string | null;
  upc?: string | null;
  copyright?: string | null;
  coverArtUrl?: string | null;
  type?: "single" | "ep" | "album";
};

export type DistributionTrack = {
  id: string;
  releaseId: string;
  userId: string;
  artistId?: string;
  title?: string;
  primaryArtist?: string;
  featuredArtists?: string[];
  audioUrl?: string | null;
  isrc?: string | null;
  explicit?: boolean;
};

export type Release = DistributionRelease;
export type Track = DistributionTrack;

export type NormalizedDistributionError = {
  errorCode: string;
  message: string;
  platform: DistributionPlatformName;
  provider: DistributionProvider;
  retryable: boolean;
};
