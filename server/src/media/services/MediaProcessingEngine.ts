import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { incrementMetric } from "../../queue/metrics";
import { logger, serializeError } from "../../observability/logger";
import type { AudioProcessingInput, ArtworkProcessingInput, MediaVariantType, StoredMediaObject } from "../models";
import type { MediaStorageAdapter } from "../storage/mediaStorage";
import { createMediaStorageAdapter } from "../storage/mediaStorage";
import { AudioFingerprintService } from "./AudioFingerprintService";
import { AudioTranscodingService } from "./AudioTranscodingService";
import { ArtworkOptimizationService } from "./ArtworkOptimizationService";
import { FfmpegRunner } from "./ffmpeg";
import { MediaValidationService } from "./MediaValidationService";
import { PreviewClipGenerator } from "./PreviewClipGenerator";
import { WaveformGenerator } from "./WaveformGenerator";

export type MediaProcessingEngineDeps = {
  db?: SupabaseClient;
  storage?: MediaStorageAdapter;
};

export class MediaProcessingEngine {
  private readonly storage: MediaStorageAdapter;
  private readonly ffmpeg = new FfmpegRunner();
  private readonly validation = new MediaValidationService(this.ffmpeg);
  private readonly transcoder: AudioTranscodingService;
  private readonly waveform: WaveformGenerator;
  private readonly preview: PreviewClipGenerator;
  private readonly artwork: ArtworkOptimizationService;
  private readonly fingerprint: AudioFingerprintService;
  private readonly log = logger.child({ component: "media-processing" });

  constructor(private readonly deps: MediaProcessingEngineDeps = {}) {
    this.storage = deps.storage || createMediaStorageAdapter();
    this.transcoder = new AudioTranscodingService(this.storage, this.ffmpeg);
    this.waveform = new WaveformGenerator(this.storage, this.ffmpeg);
    this.preview = new PreviewClipGenerator(this.storage, this.ffmpeg);
    this.artwork = new ArtworkOptimizationService(this.storage, this.ffmpeg);
    this.fingerprint = new AudioFingerprintService(deps.db, this.ffmpeg);
  }

  async processAudio(input: AudioProcessingInput) {
    const started = Date.now();
    const workDir = await mkdtemp(join(tmpdir(), `tracksyra-audio-${input.assetId}-`));
    const sourcePath = join(workDir, sanitizeFilename(input.originalFilename));
    await this.markAsset(input.assetId, "processing");
    await this.markJob(input.assetId, "AUDIO_PROCESSING", "processing");
    try {
      await writeFile(sourcePath, await this.storage.getObject(input.sourceBucket, input.sourceKey));
      const validation = await this.validation.validateAudioFile(sourcePath, {
        filename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.fileSizeBytes,
      });
      if (!validation.ok || !validation.metadata) {
        await this.reject(input.assetId, validation.issues.map((issue) => issue.message).join("; "));
        incrementMetric("tracksyra_media_rejected_total", { reason: validation.issues[0]?.code || "validation" });
        return { status: "rejected" as const, validation };
      }

      await this.persistAssetMetadata(input.assetId, validation.metadata);
      const variants = await this.transcoder.transcode({ ...input, sourcePath, workDir });
      const waveform = await this.waveform.generate({ sourcePath, userId: input.userId, assetId: input.assetId, workDir });
      const preview = await this.preview.generate({ sourcePath, userId: input.userId, assetId: input.assetId, workDir });
      const fingerprint = await this.fingerprint.fingerprint({
        sourcePath,
        assetId: input.assetId,
        trackId: input.trackId,
        workDir,
        waveformHash: waveform.hash,
      });

      await this.persistVariant(input.assetId, "master_archive", variants.masterArchive);
      await this.persistVariant(input.assetId, "mp3_320", variants.mp3_320);
      await this.persistVariant(input.assetId, "mp3_128", variants.mp3_128);
      await this.persistVariant(input.assetId, "aac_preview", variants.aacPreview);
      await this.persistVariant(input.assetId, "preview_clip", preview);
      await this.persistVariant(input.assetId, "waveform_json", waveform.object, { points: waveform.points.length });
      await this.persistWaveform(input, waveform);
      await this.persistFingerprint(input, fingerprint);

      if (fingerprint.duplicateAssetId) {
        await this.markAsset(input.assetId, "duplicate");
        incrementMetric("tracksyra_media_duplicate_uploads_total", { type: "audio" });
        await this.markJob(input.assetId, "FINGERPRINT_ANALYSIS", "completed", { duplicateAssetId: fingerprint.duplicateAssetId });
        return { status: "duplicate" as const, validation, fingerprint };
      }

      await this.markAsset(input.assetId, "ready");
      await this.markJob(input.assetId, "AUDIO_PROCESSING", "completed", { durationMs: Date.now() - started });
      incrementMetric("tracksyra_media_processing_completed_total", { type: "audio" });
      incrementMetric("tracksyra_media_processing_latency_ms_total", { type: "audio" }, Date.now() - started);
      return { status: "ready" as const, validation, fingerprint };
    } catch (error) {
      await this.markAsset(input.assetId, "failed").catch(() => undefined);
      await this.markJob(input.assetId, "AUDIO_PROCESSING", "failed", { error: serializeError(error) }).catch(() => undefined);
      incrementMetric("tracksyra_media_processing_failed_total", { type: "audio" });
      this.log.error("audio processing failed", { assetId: input.assetId, error: serializeError(error) });
      throw error;
    } finally {
      await this.ffmpeg.remove(workDir).catch(() => undefined);
    }
  }

  async processArtwork(input: ArtworkProcessingInput) {
    const workDir = await mkdtemp(join(tmpdir(), `tracksyra-artwork-${input.assetId}-`));
    const sourcePath = join(workDir, sanitizeFilename(input.originalFilename));
    await this.markAsset(input.assetId, "processing");
    await this.markJob(input.assetId, "ARTWORK_PROCESSING", "processing");
    try {
      await writeFile(sourcePath, await this.storage.getObject(input.sourceBucket, input.sourceKey));
      const moderation = await this.artwork.moderationHook({ assetId: input.assetId, path: sourcePath });
      if (moderation.nsfw) {
        await this.reject(input.assetId, "Artwork moderation rejected this image.");
        return { status: "rejected" as const, moderation };
      }
      const result = await this.artwork.optimize({ sourcePath, userId: input.userId, assetId: input.assetId, workDir });
      await this.persistVariant(input.assetId, "artwork_thumbnail", result.thumbnail, result.validation);
      await this.persistVariant(input.assetId, "artwork_webp", result.webp, result.validation);
      await this.persistVariant(input.assetId, "artwork_retina", result.retina, result.validation);
      await this.markAsset(input.assetId, "ready");
      await this.markJob(input.assetId, "ARTWORK_PROCESSING", "completed");
      incrementMetric("tracksyra_media_processing_completed_total", { type: "artwork" });
      return { status: "ready" as const, validation: result.validation };
    } catch (error) {
      await this.markAsset(input.assetId, "failed").catch(() => undefined);
      await this.markJob(input.assetId, "ARTWORK_PROCESSING", "failed", { error: serializeError(error) }).catch(() => undefined);
      incrementMetric("tracksyra_media_processing_failed_total", { type: "artwork" });
      throw error;
    } finally {
      await this.ffmpeg.remove(workDir).catch(() => undefined);
    }
  }

  async generateWaveform(input: AudioProcessingInput) {
    const workDir = await mkdtemp(join(tmpdir(), `tracksyra-waveform-${input.assetId}-`));
    const sourcePath = join(workDir, sanitizeFilename(input.originalFilename));
    await this.markJob(input.assetId, "WAVEFORM_GENERATION", "processing");
    try {
      await writeFile(sourcePath, await this.storage.getObject(input.sourceBucket, input.sourceKey));
      const waveform = await this.waveform.generate({ sourcePath, userId: input.userId, assetId: input.assetId, workDir });
      await this.persistVariant(input.assetId, "waveform_json", waveform.object, { points: waveform.points.length });
      await this.persistWaveform(input, waveform);
      await this.markJob(input.assetId, "WAVEFORM_GENERATION", "completed");
      incrementMetric("tracksyra_media_waveform_ready_total", { type: "audio" });
      return waveform;
    } finally {
      await this.ffmpeg.remove(workDir).catch(() => undefined);
    }
  }

  async analyzeFingerprint(input: AudioProcessingInput) {
    const workDir = await mkdtemp(join(tmpdir(), `tracksyra-fingerprint-${input.assetId}-`));
    const sourcePath = join(workDir, sanitizeFilename(input.originalFilename));
    await this.markJob(input.assetId, "FINGERPRINT_ANALYSIS", "processing");
    try {
      await writeFile(sourcePath, await this.storage.getObject(input.sourceBucket, input.sourceKey));
      const fingerprint = await this.fingerprint.fingerprint({ sourcePath, assetId: input.assetId, trackId: input.trackId, workDir });
      await this.persistFingerprint(input, fingerprint);
      await this.markJob(input.assetId, "FINGERPRINT_ANALYSIS", "completed", { duplicateAssetId: fingerprint.duplicateAssetId ?? null });
      if (fingerprint.duplicateAssetId) await this.markAsset(input.assetId, "duplicate");
      return fingerprint;
    } finally {
      await this.ffmpeg.remove(workDir).catch(() => undefined);
    }
  }

  private async persistVariant(assetId: string, variantType: MediaVariantType, object: StoredMediaObject, metadata: Record<string, unknown> = {}) {
    if (!this.deps.db) return;
    await this.deps.db.from("media_variants").upsert({
      asset_id: assetId,
      variant_type: variantType,
      storage_provider: object.provider,
      storage_bucket: object.bucket,
      storage_key: object.key,
      mime_type: object.contentType,
      file_size_bytes: object.sizeBytes,
      metadata,
      status: "ready",
    }, { onConflict: "asset_id,variant_type" });
  }

  private async persistWaveform(input: AudioProcessingInput, waveform: { hash: string; points: unknown[]; object: StoredMediaObject }) {
    if (!this.deps.db) return;
    await this.deps.db.from("waveform_data").upsert({
      asset_id: input.assetId,
      track_id: input.trackId ?? null,
      waveform_hash: waveform.hash,
      storage_bucket: waveform.object.bucket,
      storage_key: waveform.object.key,
      point_count: waveform.points.length,
      version: 1,
    }, { onConflict: "asset_id" });
  }

  private async persistFingerprint(input: AudioProcessingInput, fingerprint: { acousticFingerprintHash: string; waveformHash: string; similarityScore: number; duplicateAssetId?: string | null; duplicateTrackId?: string | null; nearMatches: unknown[] }) {
    if (!this.deps.db) return;
    await this.deps.db.from("audio_fingerprints").upsert({
      asset_id: input.assetId,
      track_id: input.trackId ?? null,
      fingerprint_hash: fingerprint.acousticFingerprintHash,
      waveform_hash: fingerprint.waveformHash,
      similarity_score: fingerprint.similarityScore,
      duplicate_asset_id: fingerprint.duplicateAssetId ?? null,
      duplicate_track_id: fingerprint.duplicateTrackId ?? null,
      duplicate_references: fingerprint.nearMatches,
    }, { onConflict: "asset_id" });
  }

  private async persistAssetMetadata(assetId: string, metadata: Record<string, unknown>) {
    if (!this.deps.db) return;
    await this.deps.db.from("media_assets").update({ metadata }).eq("id", assetId);
  }

  private async markAsset(assetId: string, status: string) {
    if (!this.deps.db) return;
    await this.deps.db.from("media_assets").update({ status, updated_at: new Date().toISOString() }).eq("id", assetId);
  }

  private async markJob(assetId: string, jobType: string, status: string, metadata: Record<string, unknown> = {}) {
    if (!this.deps.db) return;
    await this.deps.db.from("media_processing_jobs").upsert({
      asset_id: assetId,
      job_type: jobType,
      status,
      metadata,
      updated_at: new Date().toISOString(),
      completed_at: status === "completed" ? new Date().toISOString() : null,
    }, { onConflict: "asset_id,job_type" });
  }

  private async reject(assetId: string, reason: string) {
    await this.markAsset(assetId, "rejected");
    await this.markJob(assetId, "AUDIO_PROCESSING", "rejected", { reason });
  }
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}
