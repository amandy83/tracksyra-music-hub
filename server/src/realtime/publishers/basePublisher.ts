import type { EventBus, RealtimeChannel, RealtimeEvent, RealtimeEventType } from "../events";

export class BaseRealtimePublisher {
  constructor(protected eventBus: EventBus) {}

  protected publish(input: Omit<RealtimeEvent, "occurred_at" | "channels"> & {
    channels?: RealtimeChannel[];
  }) {
    const channels = input.channels ?? this.buildChannels(input);
    return this.eventBus.publish({
      ...input,
      channels,
      occurred_at: new Date().toISOString(),
    });
  }

  protected eventId(type: RealtimeEventType, id: string): string {
    return `realtime:${type}:${id}`;
  }

  private buildChannels(input: Omit<RealtimeEvent, "occurred_at" | "channels">): RealtimeChannel[] {
    const channels: RealtimeChannel[] = [];
    if (input.artist_id) channels.push(`artist:${input.artist_id}`);
    if (input.track_id) channels.push(`track:${input.track_id}`);
    if (input.release_id) channels.push(`release:${input.release_id}`);
    if (input.platform) channels.push(`platform:${input.platform}`);
    if (input.entity_type === "payout") channels.push(`payout:${input.entity_id}`);
    return channels;
  }
}
