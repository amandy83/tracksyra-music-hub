import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadRuntimeEnv } from "../../config/envLoader";
import { createMediaStorageAdapter, type MediaStorageAdapter } from "../storage/mediaStorage";
import { PromoAssetValidationService } from "./PromoAssetValidationService";
import { isPromoAssetType } from "./promoAssetRules";

type PromoAssetRow = {
  id: string;
  asset_type: string;
  file_url: string;
  title: string;
  mime_type: string;
  file_size: number;
};

export class PromoAssetValidationWorker {
  constructor(
    private readonly supabase: SupabaseClient = createSupabaseServiceClient(),
    private readonly storage: MediaStorageAdapter = createMediaStorageAdapter(),
    private readonly validator = new PromoAssetValidationService(),
  ) {}

  async validateAsset(assetId: string) {
    const { data: asset, error } = await this.supabase
      .from("promo_assets")
      .select("id,asset_type,file_url,title,mime_type,file_size")
      .eq("id", assetId)
      .single<PromoAssetRow>();
    if (error) throw error;
    if (!asset) throw new Error(`Promo asset ${assetId} not found.`);
    if (!isPromoAssetType(asset.asset_type)) throw new Error(`Unsupported promo asset type ${asset.asset_type}.`);

    const bytes = await this.storage.getObject("promo-assets", asset.file_url);
    const tempDir = await mkdtemp(join(tmpdir(), "tracksyra-promo-validation-"));
    const tempPath = join(tempDir, basename(asset.file_url).replace(/[^a-zA-Z0-9._-]+/g, "-"));

    try {
      await writeFile(tempPath, bytes);
      const result = await this.validator.validate({
        path: tempPath,
        filename: asset.title,
        mimeType: asset.mime_type,
        sizeBytes: Number(asset.file_size),
        assetType: asset.asset_type,
      });

      const { error: recordError } = await this.supabase.rpc("record_promo_asset_validation", {
        p_asset_id: asset.id,
        p_validation_status: result.status,
        p_validation_details: {
          summary: result.ok ? "Promo asset validation passed." : result.errors.join(" "),
          errors: result.errors,
          warnings: result.warnings,
          metadata: result.metadata || null,
        },
        p_duration_seconds: result.metadata?.durationSeconds ?? null,
        p_width: result.metadata?.width ?? null,
        p_height: result.metadata?.height ?? null,
        p_fps: result.metadata?.fps ?? null,
      });
      if (recordError) throw recordError;
      return result;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

function createSupabaseServiceClient(): SupabaseClient {
  loadRuntimeEnv();
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for promo asset validation.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function readEnv(name: string): string | undefined {
  loadRuntimeEnv();
  return (globalThis as any).process?.env?.[name];
}
