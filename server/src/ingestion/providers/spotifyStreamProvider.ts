import { buildMockStreamEvents } from "./mockStreamData";
import { isValidStreamEvent, type StreamProviderAdapter } from "./streamProvider";
import type { StreamProviderFetchInput } from "../streams/models/streamTypes";

export class SpotifyStreamProvider implements StreamProviderAdapter {
  readonly provider = "spotify" as const;

  async fetchDailyStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({ provider: this.provider, platform: "spotify", trackIds: input.trackIds, from: input.from });
  }

  async fetchRealtimeStreams(input: StreamProviderFetchInput) {
    return buildMockStreamEvents({
      provider: this.provider,
      platform: "spotify",
      trackIds: input.trackIds,
      from: input.from,
      realtime: true,
    });
  }

  validatePayload(payload: unknown) {
    return isValidStreamEvent(payload);
  }
}
