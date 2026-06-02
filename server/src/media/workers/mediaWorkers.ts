import { createWorker } from "../../queue/queueFactory";
import { queueNames } from "../../queue/queueNames";
import { logger } from "../../observability/logger";
import { MediaProcessingEngine } from "../services/MediaProcessingEngine";

export function registerMediaProcessingWorker(engine = new MediaProcessingEngine(), options: { concurrency?: number } = {}) {
  return createWorker(queueNames.mediaProcessing, async (job) => {
    logger.info("media processing job started", { component: "media-worker", jobId: job.id, assetId: job.data.input.assetId });
    return engine.processAudio(job.data.input);
  }, options);
}

export function registerArtworkProcessingWorker(engine = new MediaProcessingEngine(), options: { concurrency?: number } = {}) {
  return createWorker(queueNames.artworkProcessing, async (job) => {
    logger.info("artwork processing job started", { component: "media-worker", jobId: job.id, assetId: job.data.input.assetId });
    return engine.processArtwork(job.data.input);
  }, options);
}

export function registerWaveformGenerationWorker(engine = new MediaProcessingEngine(), options: { concurrency?: number } = {}) {
  return createWorker(queueNames.waveformGeneration, async (job) => {
    logger.info("waveform generation job started", { component: "media-worker", jobId: job.id, assetId: job.data.input.assetId });
    return engine.generateWaveform(job.data.input);
  }, options);
}

export function registerFingerprintAnalysisWorker(engine = new MediaProcessingEngine(), options: { concurrency?: number } = {}) {
  return createWorker(queueNames.fingerprintAnalysis, async (job) => {
    logger.info("fingerprint analysis job started", { component: "media-worker", jobId: job.id, assetId: job.data.input.assetId });
    return engine.analyzeFingerprint(job.data.input);
  }, options);
}
