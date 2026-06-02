import type { RoyaltyPlatform } from "../models/royaltyTypes";

export type PlatformRate = {
  minUsdPerStream: string;
  maxUsdPerStream: string;
  defaultUsdPerStream: string;
};

export const DEFAULT_ROYALTY_RATE_CARD: Record<string, PlatformRate> = {
  spotify: { minUsdPerStream: "0.003", maxUsdPerStream: "0.005", defaultUsdPerStream: "0.004" },
  apple_music: { minUsdPerStream: "0.007", maxUsdPerStream: "0.01", defaultUsdPerStream: "0.0085" },
  youtube_music: { minUsdPerStream: "0.002", maxUsdPerStream: "0.004", defaultUsdPerStream: "0.003" },
};

export function getRoyaltyRate(platform: RoyaltyPlatform, rateCard = DEFAULT_ROYALTY_RATE_CARD): PlatformRate {
  return rateCard[String(platform)] ?? { minUsdPerStream: "0", maxUsdPerStream: "0", defaultUsdPerStream: "0" };
}
