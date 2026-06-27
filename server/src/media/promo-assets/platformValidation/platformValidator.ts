import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../../../config/envLoader";
import { logger } from "../../../observability/logger";
import { createMediaStorageAdapter, type MediaStorageAdapter } from "../../storage/mediaStorage";
import { FfmpegService } from "../processing/ffmpegService";
import { extractVideoMetadata, type PromoVideoMetadata } from "../processing/videoMetadata";
import { validateAppleMotionArtwork } from "./appleMotionValidator";
import { validateInstagramReels } from "./instagramValidator";
import { validateSpotifyCanvas } from "./spotifyCanvasValidator";
import { validateTiktokPreview } from "./tiktokValidator";
import { validateYoutubeShorts } from "./youtubeShortsValidator";

export type PromoAssetPlatform =
  | "spotify_canvas"
  | "apple_motion_artwork"
  | "youtube_shorts"
  | "tiktok_preview"
  | "instagram_reels";

export type PlatformValidationStatus = "pass" | "warning" | "fail";

export type PlatformValidationResult = {
  platform: PromoAssetPlatform;
  status: PlatformValidationStatus;
  score: number;
  validationDetails: {
    summary: string;
    reasons: string[];
    warnings: string[];
    metadata: PromoVideoMetadata;
  };
};

export type PlatformRuleFailure = {
  message: string;
  severity: "fail" | "warning";
  penalty: number;
};

type PromoAssetRow = {
  id: string;
  file_url: string;
  optimized_url: string | null;
};

type PlatformValidatorFn = (metadata: PromoVideoMetadata) => PlatformValidationResult;

const BUCKET = "promo-assets";
const validators: PlatformValidatorFn[] = [
  validateSpotifyCanvas,
  validateAppleMotionArtwork,
  validateYoutubeShorts,
  validateTiktokPreview,
  validateInstagramReels,
];
const log = logger.child({ component: "promo-asset-platform-validator" });

export class PromoAssetPlatformValidationEngine {
  constructor(
    private readonly supabase: SupabaseClient = createSupabaseServiceClient(),
    private readonly storage: MediaStorageAdapter = createMediaStorageAdapter(),
    private readonly ffmpeg: FfmpegService = new FfmpegService(),
  ) {}

  async validateAsset(assetId: string): Promise<PlatformValidationResult[]> {
    await this.ffmpeg.requireAvailable();
    const asset = await this.loadAsset(assetId);
    const sourceKey = asset.optimized_url || asset.file_url;
    const tempDir = await mkdtemp(join(tmpdir(), "tracksyra-promo-platform-validation-"));
    const inputPath = join(tempDir, sanitize(basename(sourceKey)) || `${asset.id}.mp4`);

    try {
      const bytes = await this.storage.getObject(BUCKET, sourceKey);
      await writeFile(inputPath, bytes);
      const metadata = await extractVideoMetadata(inputPath, this.ffmpeg);
      const results = validators.map((validator) => validator(metadata));
      await this.persist(asset.id, results);
      log.info("promo asset platform validation completed", { assetId: asset.id, sourceKey });
      return results;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async loadAsset(assetId: string): Promise<PromoAssetRow> {
    const { data, error } = await this.supabase
      .from("promo_assets")
      .select("id,file_url,optimized_url")
      .eq("id", assetId)
      .single<PromoAssetRow>();
    if (error) throw error;
    if (!data) throw new Error(`Promo asset ${assetId} not found.`);
    return data;
  }

  private async persist(assetId: string, results: PlatformValidationResult[]) {
    const rows = results.map((result) => ({
      promo_asset_id: assetId,
      platform: result.platform,
      status: result.status,
      score: result.score,
      validation_details: result.validationDetails,
      created_at: new Date().toISOString(),
    }));
    const { error } = await this.supabase
      .from("promo_asset_platform_validation")
      .upsert(rows as any, { onConflict: "promo_asset_id,platform" });
    if (error) throw error;
  }
}

export function buildPlatformResult(
  platform: PromoAssetPlatform,
  metadata: PromoVideoMetadata,
  failures: PlatformRuleFailure[],
): PlatformValidationResult {
  const score = clamp(100 - failures.reduce((sum, failure) => sum + failure.penalty, 0));
  const reasons = failures.filter((failure) => failure.severity === "fail").map((failure) => failure.message);
  const warnings = failures.filter((failure) => failure.severity === "warning").map((failure) => failure.message);
  const status: PlatformValidationStatus = reasons.length > 0 ? "fail" : warnings.length > 0 || score < 100 ? "warning" : "pass";

  return {
    platform,
    status,
    score,
    validationDetails: {
      summary: status === "pass" ? "Fully compatible." : [...reasons, ...warnings].join(" "),
      reasons,
      warnings,
      metadata,
    },
  };
}

export function isMp4Container(metadata: PromoVideoMetadata) {
  const container = String(metadata.container || "").toLowerCase();
  return container.split(",").some((part) => part === "mp4" || part === "mov" || part === "m4v" || part === "3gp" || part === "3g2" || part === "mj2")
    && container.includes("mp4");
}

export function isH264(metadata: PromoVideoMetadata) {
  return String(metadata.codec || "").toLowerCase() === "h264";
}

export function isVertical(metadata: PromoVideoMetadata) {
  return Number(metadata.height || 0) > Number(metadata.width || 0);
}

export function isSquare(metadata: PromoVideoMetadata) {
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  return width > 0 && height > 0 && Math.abs(width - height) <= 2;
}

export function matchesAspect(metadata: PromoVideoMetadata, expectedWidth: number, expectedHeight: number) {
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - expectedWidth / expectedHeight) <= 0.04;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createSupabaseServiceClient(): SupabaseClient {
  loadRuntimeEnv();
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for promo asset platform validation.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function sanitize(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 160);
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
