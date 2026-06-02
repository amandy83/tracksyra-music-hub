import { enqueueWithDefaults } from "./queueFactory";
import { createJobTrace, type AnalyticsJob, type ArtworkProcessingJob, type DistributionJob, type FingerprintAnalysisJob, type FraudJob, type JobTrace, type MediaProcessingJob, type RealtimeJob, type RoyaltyJob, type WaveformGenerationJob } from "./jobTypes";
import { queueNames } from "./queueNames";

export const QueueDispatcher = {
  enqueueDistribution(job: Omit<DistributionJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `distribution:${job.distributionJob.id}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId,
      sourceSystem: job.sourceSystem || "distribution",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.distribution, "distribution.execute", { ...job, ...trace });
  },

  enqueueRoyalty(job: Omit<RoyaltyJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `royalty:${job.input.trackId}:${job.input.eventId || "snapshot"}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId,
      sourceSystem: job.sourceSystem || "royalties",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.royalty, "royalty.recalculate", { ...job, ...trace });
  },

  enqueueFraud(job: Omit<FraudJob, keyof JobTrace> & Partial<JobTrace>) {
    const entity = job.streamEvent?.event_id || job.royaltySpike?.trackId || job.distributionAnomaly?.trackId || "unknown";
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `fraud:${job.type}:${entity}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId,
      sourceSystem: job.sourceSystem || "fraud",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.fraud, "fraud.score", { ...job, ...trace });
  },

  enqueueAnalytics(job: Omit<AnalyticsJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `analytics:${job.type}:${job.artistId || job.platform || "global"}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId,
      sourceSystem: job.sourceSystem || "analytics",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.analytics, "analytics.refresh", { ...job, ...trace });
  },

  enqueueRealtime(job: Omit<RealtimeJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `realtime:${job.type}:${job.event?.event_id || job.artistId || "global"}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId,
      sourceSystem: job.sourceSystem || "realtime",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.realtime, "realtime.publish", { ...job, ...trace });
  },

  enqueueMediaProcessing(job: Omit<MediaProcessingJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `media:audio:${job.input.assetId}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId ?? job.input.userId,
      sourceSystem: job.sourceSystem || "media",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.mediaProcessing, "media.audio.process", { ...job, ...trace });
  },

  enqueueArtworkProcessing(job: Omit<ArtworkProcessingJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `media:artwork:${job.input.assetId}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId ?? job.input.userId,
      sourceSystem: job.sourceSystem || "media",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.artworkProcessing, "media.artwork.process", { ...job, ...trace });
  },

  enqueueWaveformGeneration(job: Omit<WaveformGenerationJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `media:waveform:${job.input.assetId}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId ?? job.input.userId,
      sourceSystem: job.sourceSystem || "media",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.waveformGeneration, "media.waveform.generate", { ...job, ...trace });
  },

  enqueueFingerprintAnalysis(job: Omit<FingerprintAnalysisJob, keyof JobTrace> & Partial<JobTrace>) {
    const trace = createJobTrace({
      idempotencyKey: job.idempotencyKey || `media:fingerprint:${job.input.assetId}`,
      traceId: job.traceId,
      correlationId: job.correlationId,
      actorUserId: job.actorUserId ?? job.input.userId,
      sourceSystem: job.sourceSystem || "media",
      createdAt: job.createdAt,
    });
    return enqueueWithDefaults(queueNames.fingerprintAnalysis, "media.fingerprint.analyze", { ...job, ...trace });
  },
};
