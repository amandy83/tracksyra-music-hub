import { buildMockStreamEvents } from "./mockStreamData";
import { isValidStreamEvent, type StreamProviderAdapter } from "./streamProvider";
import type { StreamProviderFetchInput } from "../streams/models/streamTypes";

export class YouTubeMusicStreamProvider implements StreamProviderAdapter {
  readonly provider = "youtube_music" as const;

  async fetchDailyStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({ provider: this.provider, platform: "youtube_music", trackIds: input.trackIds, from: input.from });
  }

  async fetchRealtimeStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({
      provider: this.provider,
      platform: "youtube_music",
      trackIds: input.trackIds,
      from: input.from,
      realtime: true,
    });
  }

  validatePayload(payload: unknown) {
    return isValidStreamEvent(payload);
  }
}
