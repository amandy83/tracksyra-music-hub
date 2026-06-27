import type { RoyaltyPlatform } from "../models/royaltyTypes";

export type RevenueImportSource = "too_lost" | "spotify_analytics" | "apple_music_analytics" | "csv_import";

export type RevenueImportRow = {
  source: RevenueImportSource;
  dsp: RoyaltyPlatform | string;
  releaseId?: string | null;
  trackId?: string | null;
  userId?: string | null;
  units: number;
  grossAmount: string;
  currency: "USD" | "INR";
  periodStart: string;
  periodEnd: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type RevenueImportResult = {
  source: RevenueImportSource;
  rows: RevenueImportRow[];
  grossRevenue: string;
  validationErrors: string[];
};

export interface RevenueSourceAdapter {
  readonly source: RevenueImportSource;
  parse(input: unknown): Promise<RevenueImportResult>;
}

export function sumGrossRevenue(rows: RevenueImportRow[]): string {
  const cents = rows.reduce((sum, row) => sum + Math.round(Number(row.grossAmount || 0) * 100), 0);
  return (cents / 100).toFixed(2);
}
