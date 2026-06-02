import type { SqlExecutor } from "../../royalties/services/royaltyStore";
import type { PublishedRealtimeEvent, RealtimeChannel, RealtimeEvent, RealtimeSnapshot } from "./realtimeTypes";

export class RealtimeEventStore {
  constructor(private db: SqlExecutor) {}

  async appendEvent(event: RealtimeEvent): Promise<PublishedRealtimeEvent> {
    const rows = await this.db.query<PublishedRealtimeEvent>(
      `WITH next_sequence AS (
         INSERT INTO realtime_entity_sequences (sequence_key, last_sequence)
         VALUES (:sequence_key, 1)
         ON CONFLICT (sequence_key) DO UPDATE SET
           last_sequence = realtime_entity_sequences.last_sequence + 1
         RETURNING last_sequence
       )
       INSERT INTO realtime_event_log (
         event_id, event_type, entity_type, entity_id, artist_id, track_id, release_id,
         platform, channels, sequence_key, sequence_number, payload, occurred_at
       )
       SELECT
         :event_id, :event_type, :entity_type, :entity_id, :artist_id, :track_id, :release_id,
         :platform, CAST(:channels AS jsonb), :sequence_key, last_sequence,
         CAST(:payload AS jsonb), CAST(:occurred_at AS timestamptz)
       FROM next_sequence
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id, event_type, entity_type, entity_id, artist_id, track_id, release_id,
         platform, channels, sequence_key, sequence_number, payload, occurred_at`,
      {
        ...event,
        channels: JSON.stringify(event.channels),
        payload: JSON.stringify(event.payload),
      },
    );

    if (rows[0]) return rows[0];

    const existing = await this.db.query<PublishedRealtimeEvent>(
      `SELECT event_id, event_type, entity_type, entity_id, artist_id, track_id, release_id,
         platform, channels, sequence_key, sequence_number, payload, occurred_at
       FROM realtime_event_log
       WHERE event_id = :event_id
       LIMIT 1`,
      { event_id: event.event_id },
    );
    if (!existing[0]) throw new Error(`Realtime event not found after idempotent append: ${event.event_id}`);
    return existing[0];
  }

  async replayChannel(channel: RealtimeChannel, sinceSequence = 0, limit = 100): Promise<PublishedRealtimeEvent[]> {
    return this.db.query<PublishedRealtimeEvent>(
      `SELECT event_id, event_type, entity_type, entity_id, artist_id, track_id, release_id,
         platform, channels, sequence_key, sequence_number, payload, occurred_at
       FROM realtime_event_log
       WHERE channels ? :channel
         AND sequence_number > :sinceSequence
       ORDER BY sequence_number ASC, occurred_at ASC
       LIMIT :limit`,
      { channel, sinceSequence, limit },
    );
  }

  async recordSubscription(input: {
    userId: string;
    channel: RealtimeChannel;
    socketId: string;
    status: "ACTIVE" | "CLOSED";
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO realtime_subscriptions (user_id, channel, socket_id, status)
       VALUES (:userId, :channel, :socketId, :status)`,
      input,
    );
  }

  async persistSnapshot(snapshot: RealtimeSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO live_dashboard_snapshots (
         artist_id, stream_counts, revenue_updates, fraud_alerts,
         distribution_statuses, payout_updates, rolling_metrics
       ) VALUES (
         :artist_id, CAST(:stream_counts AS jsonb), CAST(:revenue_updates AS jsonb),
         CAST(:fraud_alerts AS jsonb), CAST(:distribution_statuses AS jsonb),
         CAST(:payout_updates AS jsonb), CAST(:rolling_metrics AS jsonb)
       )`,
      {
        artist_id: snapshot.artist_id,
        stream_counts: JSON.stringify(snapshot.stream_counts),
        revenue_updates: JSON.stringify(snapshot.revenue_updates),
        fraud_alerts: JSON.stringify(snapshot.fraud_alerts),
        distribution_statuses: JSON.stringify(snapshot.distribution_statuses),
        payout_updates: JSON.stringify(snapshot.payout_updates),
        rolling_metrics: JSON.stringify(snapshot.rolling_metrics),
      },
    );
  }
}
