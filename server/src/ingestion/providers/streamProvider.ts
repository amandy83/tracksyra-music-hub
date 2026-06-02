import type { StreamEvent, StreamProviderFetchInput, StreamProviderName } from "../streams/models/streamTypes";

export type StreamProviderAdapter = {
  readonly provider: StreamProviderName;
  fetchDailyStreams(input: StreamProviderFetchInput): Promise<StreamEvent[]>;
  fetchRealtimeStreams(input: StreamProviderFetchInput): Promise<StreamEvent[]>;
  validatePayload(payload: unknown): payload is StreamEvent;
};

export function isValidStreamEvent(payload: any): payload is StreamEvent {
  return Boolean(
    payload
      && typeof payload.event_id === "string"
      && typeof payload.track_id === "string"
      && typeof payload.platform === "string"
      && Number.isInteger(payload.stream_count_increment)
      && payload.stream_count_increment >= 0
      && typeof payload.listener_country === "string"
      && typeof payload.timestamp === "string",
  );
}
