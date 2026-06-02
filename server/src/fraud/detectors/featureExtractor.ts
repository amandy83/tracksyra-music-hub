import type { NormalizedStreamEvent } from "../../ingestion/streams";
import type { FraudFeatureVector } from "../models/fraudTypes";
import type { FraudStore } from "../services/fraudStore";

export class FraudFeatureExtractor {
  constructor(private store: FraudStore) {}

  async extractStreamFeatures(event: NormalizedStreamEvent): Promise<FraudFeatureVector> {
    const raw = (event.raw_payload ?? {}) as Record<string, unknown>;
    const ipFingerprint = readOptionalString(raw, "ip_fingerprint") ?? readOptionalString(raw, "ip_hash");
    const deviceFingerprint = readOptionalString(raw, "device_fingerprint") ?? readOptionalString(raw, "device_hash");
    const listenDurationSeconds = readOptionalNumber(raw, "listen_duration_seconds");
    const [userId, previousHour, countries, sameFingerprint, shortDuration, revenueStreams, distributionFailures] = await Promise.all([
      this.store.getTrackOwner(event.track_id),
      this.store.getPreviousHourStreams(event.track_id, event.timestamp),
      this.store.getDistinctCountriesLast5m(event.track_id, event.timestamp),
      this.store.getSameFingerprintEventsLast10m({
        trackId: event.track_id,
        timestamp: event.timestamp,
        ipFingerprint,
        deviceFingerprint,
      }),
      this.store.getShortDurationEventsLast10m(event.track_id, event.timestamp),
      this.store.getRevenueAndStreamsLastDay(event.track_id, event.timestamp),
      this.store.getDistributionFailuresLastDay(event.track_id, event.timestamp),
    ]);

    return {
      event_id: event.event_id,
      track_id: event.track_id,
      user_id: userId,
      platform: String(event.platform),
      stream_count_increment: event.stream_count_increment,
      listener_country: event.listener_country,
      event_timestamp: event.timestamp,
      previous_hour_streams: previousHour,
      distinct_countries_last_5m: countries,
      same_fingerprint_events_last_10m: sameFingerprint,
      short_duration_events_last_10m: shortDuration,
      listen_duration_seconds: listenDurationSeconds,
      device_fingerprint: deviceFingerprint,
      ip_fingerprint: ipFingerprint,
      revenue_last_day: revenueStreams.revenue,
      streams_last_day: revenueStreams.streams,
      distribution_failures_last_day: distributionFailures,
    };
  }
}

function readOptionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value ? value : null;
}

function readOptionalNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return null;
}
