import type { StreamProviderAdapter } from "../../providers";
import type {
  NormalizedStreamEvent,
  StreamEvent,
  StreamIngestionMode,
  StreamProcessingResult,
  StreamProviderFetchInput,
} from "../models/streamTypes";
import type { StreamProcessingEngine } from "./streamProcessingEngine";

export type StreamingIngestionEngineDeps = {
  providers: StreamProviderAdapter[];
  processingEngine: StreamProcessingEngine;
};

export class StreamingIngestionEngine {
  private providers: Map<string, StreamProviderAdapter>;

  constructor(private deps: StreamingIngestionEngineDeps) {
    this.providers = new Map(deps.providers.map((provider) => [provider.provider, provider]));
  }

  async ingestRealtime(input: StreamProviderFetchInput & { provider: string }): Promise<StreamProcessingResult> {
    const provider = this.getProvider(input.provider);
    const events = await provider.fetchRealtimeStreams(input);
    return this.ingestEvents({
      provider: provider.provider,
      mode: "REALTIME",
      events,
      batchId: this.buildBatchId(provider.provider, "REALTIME", events),
    });
  }

  async ingestDailyBatch(input: StreamProviderFetchInput & { provider: string }): Promise<StreamProcessingResult> {
    const provider = this.getProvider(input.provider);
    const events = await provider.fetchDailyStreams(input);
    return this.ingestEvents({
      provider: provider.provider,
      mode: "DAILY_BATCH",
      events,
      batchId: this.buildBatchId(provider.provider, "DAILY_BATCH", events),
    });
  }

  async ingestEvents(input: {
    provider: string;
    mode: StreamIngestionMode;
    events: StreamEvent[];
    batchId?: string;
  }): Promise<StreamProcessingResult> {
    const provider = this.getProvider(input.provider);
    const normalized = input.events.map((event) => {
      if (!provider.validatePayload(event)) throw new Error(`Invalid stream payload for provider ${input.provider}`);
      return this.normalizeEvent(event, provider.provider, input.mode);
    });

    return this.deps.processingEngine.processEvents({
      batchId: input.batchId ?? this.buildBatchId(provider.provider, input.mode, normalized),
      provider: provider.provider,
      events: normalized,
    });
  }

  private normalizeEvent(event: StreamEvent, provider: string, mode: StreamIngestionMode): NormalizedStreamEvent {
    return {
      event_id: event.event_id,
      track_id: event.track_id,
      platform: event.platform,
      stream_count_increment: event.stream_count_increment,
      listener_country: event.listener_country.toUpperCase(),
      timestamp: new Date(event.timestamp).toISOString(),
      provider,
      ingestion_mode: mode,
      received_at: new Date().toISOString(),
      raw_payload: event,
    };
  }

  private getProvider(providerName: string): StreamProviderAdapter {
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Stream provider not registered: ${providerName}`);
    return provider;
  }

  private buildBatchId(provider: string, mode: StreamIngestionMode, events: Array<StreamEvent | NormalizedStreamEvent>): string {
    const ids = events.map((event) => event.event_id).sort().join(",");
    return `stream-batch:${provider}:${mode}:${hash(ids)}`;
  }
}

function hash(value: string): string {
  let hashValue = 0;
  for (let index = 0; index < value.length; index += 1) {
    hashValue = ((hashValue << 5) - hashValue + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hashValue).toString(36);
}
