import type { SqlExecutor } from "../../../royalties/services/royaltyStore";
import type { NormalizedStreamEvent, StreamProcessingResult } from "../models/streamTypes";

export class StreamingStore {
  constructor(private db: SqlExecutor) {}

  async insertEvent(event: NormalizedStreamEvent): Promise<boolean> {
    const rows = await this.db.query<{ event_id: string }>(
      `INSERT INTO streaming_events (
         event_id, provider, track_id, platform, stream_count_increment,
         listener_country, occurred_at, ingestion_mode, raw_payload
       ) VALUES (
         :event_id, :provider, :track_id, :platform, :stream_count_increment,
         :listener_country, CAST(:timestamp AS timestamptz), :ingestion_mode, CAST(:raw_payload AS jsonb)
       )
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      {
        ...event,
        raw_payload: JSON.stringify(event.raw_payload ?? event),
      },
    );
    return Boolean(rows[0]);
  }

  async applyEventToStats(event: NormalizedStreamEvent): Promise<void> {
    const eventDate = event.timestamp.slice(0, 10);
    await this.db.query(
      `INSERT INTO streaming_stats (
         track_id, platform, stat_date, listener_country, streams_count, last_event_at
       ) VALUES (
         :track_id, :platform, CAST(:eventDate AS date), :listener_country,
         :stream_count_increment, CAST(:timestamp AS timestamptz)
       )
       ON CONFLICT (track_id, platform, stat_date, listener_country) DO UPDATE SET
         streams_count = streaming_stats.streams_count + EXCLUDED.streams_count,
         last_event_at = GREATEST(streaming_stats.last_event_at, EXCLUDED.last_event_at),
         updated_at = now()`,
      { ...event, eventDate },
    );

    await this.db.query(
      `WITH updated AS (
         UPDATE song_analytics
         SET streams = streams + :stream_count_increment
         WHERE song_id = :track_id
           AND platform = :platform
           AND date = CAST(:eventDate AS date)
         RETURNING id
       )
       INSERT INTO song_analytics (user_id, song_id, platform, date, streams)
       SELECT t.user_id, t.id, :platform, CAST(:eventDate AS date), :stream_count_increment
       FROM tracks t
       WHERE t.id = :track_id
         AND NOT EXISTS (SELECT 1 FROM updated)`,
      { ...event, eventDate },
    );
  }

  async appendProcessingLog(input: {
    batchId: string;
    provider: string;
    status: "PROCESSED" | "FAILED";
    result?: StreamProcessingResult | null;
    error?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO stream_processing_logs (
         batch_id, provider, status, result, error_message
       ) VALUES (
         :batchId, :provider, :status, CAST(:result AS jsonb), :error
       )`,
      {
        batchId: input.batchId,
        provider: input.provider,
        status: input.status,
        result: JSON.stringify(input.result ?? {}),
        error: input.error ?? null,
      },
    );
  }
}
