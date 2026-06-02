import type { SqlExecutor } from "../../royalties/services/royaltyStore";
import type { NormalizedStreamEvent } from "../../ingestion/streams";
import type { FraudDecision, FraudEventRecord, FraudFeatureVector, FraudRuleResult, FraudReviewDecision } from "../models/fraudTypes";

export class FraudStore {
  constructor(private db: SqlExecutor) {}

  async getTrackOwner(trackId: string): Promise<string | null> {
    const rows = await this.db.query<{ user_id: string }>(
      `SELECT user_id FROM tracks WHERE id = :trackId LIMIT 1`,
      { trackId },
    );
    return rows[0]?.user_id ?? null;
  }

  async getPreviousHourStreams(trackId: string, timestamp: string): Promise<number> {
    const rows = await this.db.query<{ streams_count: number }>(
      `SELECT COALESCE(SUM(stream_count_increment), 0)::int AS streams_count
       FROM streaming_events
       WHERE track_id = :trackId
         AND occurred_at >= CAST(:timestamp AS timestamptz) - INTERVAL '1 hour'
         AND occurred_at < CAST(:timestamp AS timestamptz)`,
      { trackId, timestamp },
    );
    return rows[0]?.streams_count ?? 0;
  }

  async getDistinctCountriesLast5m(trackId: string, timestamp: string): Promise<number> {
    const rows = await this.db.query<{ country_count: number }>(
      `SELECT COUNT(DISTINCT listener_country)::int AS country_count
       FROM streaming_events
       WHERE track_id = :trackId
         AND occurred_at >= CAST(:timestamp AS timestamptz) - INTERVAL '5 minutes'
         AND occurred_at <= CAST(:timestamp AS timestamptz)`,
      { trackId, timestamp },
    );
    return rows[0]?.country_count ?? 0;
  }

  async getSameFingerprintEventsLast10m(input: {
    trackId: string;
    timestamp: string;
    ipFingerprint?: string | null;
    deviceFingerprint?: string | null;
  }): Promise<number> {
    if (!input.ipFingerprint && !input.deviceFingerprint) return 0;
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM streaming_events
       WHERE track_id = :trackId
         AND occurred_at >= CAST(:timestamp AS timestamptz) - INTERVAL '10 minutes'
         AND occurred_at <= CAST(:timestamp AS timestamptz)
         AND (
           (:ipFingerprint IS NOT NULL AND raw_payload->>'ip_fingerprint' = :ipFingerprint)
           OR (:deviceFingerprint IS NOT NULL AND raw_payload->>'device_fingerprint' = :deviceFingerprint)
         )`,
      input,
    );
    return rows[0]?.count ?? 0;
  }

  async getShortDurationEventsLast10m(trackId: string, timestamp: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM streaming_events
       WHERE track_id = :trackId
         AND occurred_at >= CAST(:timestamp AS timestamptz) - INTERVAL '10 minutes'
         AND occurred_at <= CAST(:timestamp AS timestamptz)
         AND COALESCE((raw_payload->>'listen_duration_seconds')::numeric, 999999) < 15`,
      { trackId, timestamp },
    );
    return rows[0]?.count ?? 0;
  }

  async getRevenueAndStreamsLastDay(trackId: string, timestamp: string): Promise<{ revenue: number; streams: number }> {
    const rows = await this.db.query<{ revenue: string; streams: number }>(
      `SELECT
         COALESCE((SELECT SUM(total_revenue) FROM royalty_records
           WHERE track_id = :trackId
             AND created_at >= CAST(:timestamp AS timestamptz) - INTERVAL '1 day'
             AND created_at <= CAST(:timestamp AS timestamptz)), 0)::text AS revenue,
         COALESCE((SELECT SUM(stream_count_increment) FROM streaming_events
           WHERE track_id = :trackId
             AND occurred_at >= CAST(:timestamp AS timestamptz) - INTERVAL '1 day'
             AND occurred_at <= CAST(:timestamp AS timestamptz)), 0)::int AS streams`,
      { trackId, timestamp },
    );
    return { revenue: Number(rows[0]?.revenue ?? 0), streams: rows[0]?.streams ?? 0 };
  }

  async getDistributionFailuresLastDay(trackId: string, timestamp: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM distribution_state_history
       WHERE track_id = :trackId
         AND next_status IN ('FAILED', 'REJECTED', 'DEAD_LETTER')
         AND created_at >= CAST(:timestamp AS timestamptz) - INTERVAL '1 day'
         AND created_at <= CAST(:timestamp AS timestamptz)`,
      { trackId, timestamp },
    );
    return rows[0]?.count ?? 0;
  }

  async appendFraudEvent(input: {
    event: NormalizedStreamEvent;
    userId?: string | null;
    decision: FraudDecision;
    score: number;
    reasons: FraudRuleResult[];
    featureVector: FraudFeatureVector;
  }): Promise<FraudEventRecord> {
    const rows = await this.db.query<FraudEventRecord>(
      `INSERT INTO fraud_events (
         event_id, track_id, user_id, platform, decision, fraud_score,
         reasons, feature_vector, raw_event
       ) VALUES (
         :event_id, :track_id, :user_id, :platform, :decision, :fraud_score,
         CAST(:reasons AS jsonb), CAST(:feature_vector AS jsonb), CAST(:raw_event AS jsonb)
       )
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id, event_id, track_id, user_id, platform, decision, fraud_score,
         reasons, raw_event, created_at`,
      {
        event_id: input.event.event_id,
        track_id: input.event.track_id,
        user_id: input.userId ?? null,
        platform: input.event.platform,
        decision: input.decision,
        fraud_score: input.score,
        reasons: JSON.stringify(input.reasons),
        feature_vector: JSON.stringify(input.featureVector),
        raw_event: JSON.stringify(input.event),
      },
    );
    if (rows[0]) return rows[0];

    const existing = await this.db.query<FraudEventRecord>(
      `SELECT id, event_id, track_id, user_id, platform, decision, fraud_score,
         reasons, raw_event, created_at
       FROM fraud_events
       WHERE event_id = :eventId
       LIMIT 1`,
      { eventId: input.event.event_id },
    );
    return existing[0];
  }

  async createReview(fraudEventId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO fraud_reviews (fraud_event_id, decision, reviewer_id, notes)
       VALUES (:fraudEventId, 'PENDING', NULL, NULL)
       ON CONFLICT (fraud_event_id) WHERE decision = 'PENDING' DO NOTHING`,
      { fraudEventId },
    );
  }

  async getFraudEventByReview(reviewId: string): Promise<{ fraud_event_id: string; user_id: string | null; raw_event: NormalizedStreamEvent } | null> {
    const rows = await this.db.query<{ fraud_event_id: string; user_id: string | null; raw_event: NormalizedStreamEvent }>(
      `SELECT fe.id AS fraud_event_id, fe.user_id, fe.raw_event
       FROM fraud_reviews fr
       JOIN fraud_events fe ON fe.id = fr.fraud_event_id
       WHERE fr.id = :reviewId
       LIMIT 1`,
      { reviewId },
    );
    return rows[0] ?? null;
  }

  async appendReviewDecision(input: {
    fraudEventId: string;
    decision: FraudReviewDecision;
    reviewerId: string;
    notes?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO fraud_reviews (fraud_event_id, decision, reviewer_id, notes)
       VALUES (:fraudEventId, :decision, :reviewerId, :notes)`,
      input,
    );
  }

  async upsertUserRiskScore(input: {
    userId: string;
    scoreDelta: number;
    reason: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO fraud_user_risk_scores (user_id, risk_score, reason)
       VALUES (:userId, LEAST(100, GREATEST(0, :scoreDelta)), :reason)
       ON CONFLICT (user_id) DO UPDATE SET
         risk_score = LEAST(100, GREATEST(0, fraud_user_risk_scores.risk_score + :scoreDelta)),
         reason = :reason,
         updated_at = now()`,
      input,
    );
  }
}
