import type { RoyaltyPlatform } from "../../royalties/models/royaltyTypes";
import type { StreamEvent } from "../streams/models/streamTypes";

export function buildMockStreamEvents(input: {
  provider: string;
  platform: RoyaltyPlatform;
  trackIds: string[];
  from?: string | null;
  realtime?: boolean;
}): StreamEvent[] {
  const timestamp = input.from ?? new Date().toISOString();
  return input.trackIds.flatMap((trackId, index) => {
    const seed = deterministicSeed(`${input.provider}:${trackId}:${timestamp}:${input.realtime ? "rt" : "daily"}`);
    const count = input.realtime ? (seed % 7) + 1 : (seed % 900) + 100;
    const country = ["US", "IN", "GB", "BR", "DE"][seed % 5];
    return [{
      event_id: `${input.provider}:${input.realtime ? "realtime" : "daily"}:${trackId}:${timestamp}:${index}`,
      track_id: trackId,
      platform: input.platform,
      stream_count_increment: count,
      listener_country: country,
      timestamp,
    }];
  });
}

function deterministicSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
