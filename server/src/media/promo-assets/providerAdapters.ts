import type { PromoAssetType } from "./promoAssetRules";

export type PromoAssetProviderName = "too_lost" | "fuga" | "symphonyos" | "internal_upload";

export type PromoAssetProviderInput = {
  assetId: string;
  assetType: PromoAssetType;
  releaseId?: string | null;
  trackId?: string | null;
  fileUrl: string;
  title: string;
};

export type PromoAssetProviderResult = {
  externalAssetId: string;
  syncStatus: "queued" | "syncing" | "synced" | "failed";
};

export interface PromoAssetProviderAdapter {
  readonly providerName: PromoAssetProviderName;
  submit(input: PromoAssetProviderInput): Promise<PromoAssetProviderResult>;
}

export class InternalUploadPromoAssetAdapter implements PromoAssetProviderAdapter {
  readonly providerName = "internal_upload" as const;

  async submit(input: PromoAssetProviderInput): Promise<PromoAssetProviderResult> {
    return {
      externalAssetId: `internal:${input.assetId}`,
      syncStatus: "queued",
    };
  }
}

export function createPromoAssetProviderAdapter(providerName: PromoAssetProviderName): PromoAssetProviderAdapter {
  if (providerName === "internal_upload") return new InternalUploadPromoAssetAdapter();
  throw new Error(`${providerName} promo asset adapter requires provider credentials before activation.`);
}
