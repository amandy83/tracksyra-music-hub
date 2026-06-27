import { createHash } from "crypto";

import type { RevenueImportResult, RevenueImportRow, RevenueSourceAdapter, RevenueImportSource } from "./revenueSourceAdapter";
import { sumGrossRevenue } from "./revenueSourceAdapter";

type ProviderRow = Record<string, unknown>;

export class TooLostRevenueAdapter implements RevenueSourceAdapter {
  readonly source = "too_lost" as const;
  async parse(input: unknown): Promise<RevenueImportResult> {
    return parseProviderRows(this.source, input);
  }
}

export class SpotifyAnalyticsRevenueAdapter implements RevenueSourceAdapter {
  readonly source = "spotify_analytics" as const;
  async parse(input: unknown): Promise<RevenueImportResult> {
    return parseProviderRows(this.source, input, "spotify");
  }
}

export class AppleMusicAnalyticsRevenueAdapter implements RevenueSourceAdapter {
  readonly source = "apple_music_analytics" as const;
  async parse(input: unknown): Promise<RevenueImportResult> {
    return parseProviderRows(this.source, input, "apple_music");
  }
}

export class CsvRevenueImportAdapter implements RevenueSourceAdapter {
  readonly source = "csv_import" as const;

  async parse(input: unknown): Promise<RevenueImportResult> {
    const text = String(input || "");
    const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim());
    if (!headerLine) return emptyResult(this.source, ["CSV import is empty"]);
    const headers = splitCsvLine(headerLine).map((header) => header.trim());
    const rows = lines.map((line) => {
      const cells = splitCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });
    return parseProviderRows(this.source, rows);
  }
}

function parseProviderRows(source: RevenueImportSource, input: unknown, fallbackDsp?: string): RevenueImportResult {
  const rawRows = Array.isArray(input) ? input as ProviderRow[] : input && typeof input === "object" && Array.isArray((input as any).rows) ? (input as any).rows as ProviderRow[] : [];
  const validationErrors: string[] = [];
  const rows: RevenueImportRow[] = rawRows.map((row, index) => {
    const grossAmount = stringValue(row.grossAmount ?? row.gross_revenue ?? row.revenue ?? row.amount);
    const periodStart = stringValue(row.periodStart ?? row.period_start ?? row.month ?? row.date);
    const periodEnd = stringValue(row.periodEnd ?? row.period_end ?? row.month ?? row.date);
    const normalized: RevenueImportRow = {
      source,
      dsp: stringValue(row.dsp ?? row.platform ?? fallbackDsp ?? source),
      releaseId: nullableString(row.releaseId ?? row.release_id),
      trackId: nullableString(row.trackId ?? row.track_id ?? row.isrc),
      userId: nullableString(row.userId ?? row.user_id ?? row.artist_id),
      units: Number(row.units ?? row.streams ?? row.quantity ?? 0),
      grossAmount,
      currency: stringValue(row.currency || "USD").toUpperCase() === "INR" ? "INR" : "USD",
      periodStart,
      periodEnd,
      idempotencyKey: stringValue(row.idempotencyKey ?? row.idempotency_key) || hashRow(source, row, index),
      metadata: { raw: row },
    };
    if (!normalized.grossAmount || Number.isNaN(Number(normalized.grossAmount))) validationErrors.push(`Row ${index + 1}: invalid gross amount`);
    if (!normalized.periodStart || !normalized.periodEnd) validationErrors.push(`Row ${index + 1}: missing period dates`);
    return normalized;
  });
  return { source, rows, grossRevenue: sumGrossRevenue(rows), validationErrors };
}

function emptyResult(source: RevenueImportSource, validationErrors: string[]): RevenueImportResult {
  return { source, rows: [], grossRevenue: "0.00", validationErrors };
}

function stringValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function hashRow(source: string, row: unknown, index: number): string {
  return `${source}:${createHash("sha256").update(JSON.stringify(row)).update(String(index)).digest("hex")}`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"" && line[i + 1] === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quote = !quote;
    } else if (char === "," && !quote) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}
