export type AnalyticsSyncInput = {
  since?: string;
  platforms?: string[];
};

export type AnalyticsSyncResult = {
  provider: string;
  mode: "sandbox" | "live";
  syncedAt: string;
  platforms: string[];
  rawResponse: unknown;
};

export interface AnalyticsSyncAdapter {
  readonly provider: string;
  syncAnalytics(input: AnalyticsSyncInput): Promise<AnalyticsSyncResult>;
}
