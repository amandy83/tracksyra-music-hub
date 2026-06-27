export type MediaAssetType = "audio" | "artwork";

export type MediaAssetStatus =
  | "uploaded"
  | "validating"
  | "processing"
  | "ready"
  | "rejected"
  | "duplicate"
  | "failed";

export type MediaVariantType =
  | "master_archive"
  | "mp3_320"
  | "mp3_128"
  | "aac_preview"
  | "preview_clip"
  | "waveform_json"
  | "artwork_thumbnail"
  | "artwork_webp"
  | "artwork_retina";

export type MediaProcessingJobType =
  | "AUDIO_PROCESSING"
  | "ARTWORK_PROCESSING"
  | "WAVEFORM_GENERATION"
  | "FINGERPRINT_ANALYSIS";

export type MediaProcessingStatus = "queued" | "processing" | "completed" | "failed" | "rejected";

export type AudioCodec = "wav" | "mp3" | "flac" | "aiff" | "aac" | "ogg" | "wma" | "unknown";

export type AudioQualityMetadata = {
  bitrateKbps: number | null;
  durationSec: number;
  codec: AudioCodec;
  sampleRateHz: number;
  channels: number;
  bitDepth: number | null;
  lufs: number | null;
  bpm: number | null;
  peakDb: number | null;
  hasClipping: boolean;
  silenceRatio: number;
  corruptedFrames: number;
};

export type MediaValidationIssue = {
  code: string;
  severity: "warning" | "error";
  message: string;
};

export type MediaValidationResult = {
  ok: boolean;
  issues: MediaValidationIssue[];
  metadata?: AudioQualityMetadata;
};

export type AudioFingerprintResult = {
  acousticFingerprintHash: string;
  waveformHash: string;
  similarityScore: number;
  duplicateAssetId?: string | null;
  duplicateTrackId?: string | null;
  nearMatches: Array<{
    assetId: string;
    trackId?: string | null;
    score: number;
    reason: "exact_hash" | "waveform_hash" | "near_match";
  }>;
};

export type MediaStorageProvider = "supabase" | "r2" | "s3";

export type StoredMediaObject = {
  provider: MediaStorageProvider;
  bucket: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  etag?: string | null;
};

export type AudioProcessingInput = {
  assetId: string;
  userId: string;
  releaseId?: string | null;
  trackId?: string | null;
  sourceBucket: string;
  sourceKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type ArtworkProcessingInput = {
  assetId: string;
  userId: string;
  releaseId?: string | null;
  sourceBucket: string;
  sourceKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
};

export type WaveformPoint = {
  t: number;
  min: number;
  max: number;
  rms: number;
};
