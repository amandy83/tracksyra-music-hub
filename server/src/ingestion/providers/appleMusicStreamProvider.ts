import { buildMockStreamEvents } from "./mockStreamData";
import { isValidStreamEvent, type StreamProviderAdapter } from "./streamProvider";
import type { StreamProviderFetchInput } from "../streams/models/streamTypes";

export class AppleMusicStreamProvider implements StreamProviderAdapter {
  readonly provider = "apple_music" as const;

  async fetchDailyStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({ provider: this.provider, platform: "apple_music", trackIds: input.trackIds, from: input.from });
  }

  async fetchRealtimeStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({
      provider: this.provider,
      platform: "apple_music",
      trackIds: input.trackIds,
      from: input.from,
      realtime: true,
    });
  }

  validatePayload(payload: unknown) {
    return isValidStreamEvent(payload);
  }
}
