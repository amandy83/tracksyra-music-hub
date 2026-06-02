import type { PublishedRealtimeEvent, RealtimeChannel, RealtimeEvent } from "./realtimeTypes";
import type { RealtimeEventStore } from "./realtimeEventStore";

export type RealtimeEventHandler = (event: PublishedRealtimeEvent) => Promise<void> | void;

export class EventBus {
  private handlers = new Set<RealtimeEventHandler>();

  constructor(private store: RealtimeEventStore) {}

  subscribe(handler: RealtimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async publish(event: RealtimeEvent): Promise<PublishedRealtimeEvent> {
    const published = await this.store.appendEvent(this.sanitize(event));
    await Promise.all([...this.handlers].map((handler) => handler(published)));
    return published;
  }

  async replay(channel: RealtimeChannel, sinceSequence = 0, limit = 100): Promise<PublishedRealtimeEvent[]> {
    return this.store.replayChannel(channel, sinceSequence, limit);
  }

  private sanitize(event: RealtimeEvent): RealtimeEvent {
    return {
      ...event,
      payload: sanitizePayload(event.payload),
      channels: [...new Set(event.channels)],
    };
  }
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["access_token", "refresh_token", "password", "raw_payload", "raw_event"]);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !blocked.has(key.toLowerCase())),
  );
}
