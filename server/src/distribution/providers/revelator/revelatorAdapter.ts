import type { PlatformAdapter } from "../../adapters/platformAdapter";
import type { Release, Track } from "../../models/distributionTypes";
import { mapGenreToProviderStyleId, mapLanguageToProviderId } from "../../../domain/music";
import { loadRuntimeEnv } from "../../../config/envLoader";
import { normalizeRevelatorError } from "./revelatorError";
import type { RevelatorConfig, RevelatorReleasePayload } from "./revelatorTypes";

type HttpClient = typeof fetch;

type RevelatorAdapterOptions = {
  apiKey?: string;
  apiUrl?: string;
  storeIds?: number[];
  httpClient?: HttpClient;
};

const DEFAULT_REVELATOR_API_URL = "https://api.revelator.com";
const DEFAULT_STORE_IDS = [1, 9, 13, 14, 37];

export class RevelatorAdapter implements PlatformAdapter {
  readonly name = "revelator";
  private readonly config: RevelatorConfig;
  private readonly httpClient: HttpClient;
  private sessionToken: string | null = null;

  constructor(options: RevelatorAdapterOptions = {}) {
    this.config = {
      apiKey: options.apiKey ?? readEnv("REVELATOR_API_KEY"),
      apiUrl: trimTrailingSlash(options.apiUrl ?? readEnv("REVELATOR_API_URL", DEFAULT_REVELATOR_API_URL)),
      storeIds: options.storeIds ?? parseStoreIds(readEnv("REVELATOR_STORE_IDS", "")) ?? DEFAULT_STORE_IDS,
    };
    this.httpClient = options.httpClient ?? fetch;
  }

  async authenticate(): Promise<void> {
    if (!this.config.apiKey) {
      throw normalizeRevelatorError({ status: 401, message: "Missing REVELATOR_API_KEY" });
    }

    this.sessionToken = this.config.apiKey;
  }

  async uploadTrack(input: { track: Track; release: Release }): Promise<{
    platformTrackId: string;
    status: "PUBLISHED" | "FAILED";
    rawResponse: any;
  }> {
    try {
      await this.authenticate();

      const audioFile = await this.pullExternalAudio(input.track);
      const payload = this.mapToPayload(input, audioFile);
      const releaseResponse = await this.request<any>("/content/release/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const revelatorReleaseId = String(
        releaseResponse?.releaseId ?? releaseResponse?.id ?? releaseResponse?.data?.releaseId ?? input.release.id,
      );

      const validationResponse = await this.request<any>(`/distribution/release/${encodeURIComponent(revelatorReleaseId)}/validate`, {
        method: "POST",
      });

      const retailResponse = input.release.releaseDate
        ? await this.request<any>("/content/release/retail/save", {
          method: "POST",
          body: JSON.stringify({
            releaseId: Number.isFinite(Number(revelatorReleaseId)) ? Number(revelatorReleaseId) : revelatorReleaseId,
            saleStartDate: input.release.releaseDate,
            monetizationPolicyIds: [],
            trackMonetizationPolicyIds: [],
          }),
        })
        : null;

      const queueResponse = await this.request<any>(
        `/distribution/release/addtoqueue?releaseId=${encodeURIComponent(revelatorReleaseId)}`,
        {
          method: "POST",
          body: JSON.stringify(this.config.storeIds),
        },
      );

      return {
        platformTrackId: revelatorReleaseId,
        status: "PUBLISHED",
        rawResponse: this.redactRawResponse({
          provider: "revelator",
          release: releaseResponse,
          validation: validationResponse,
          retail: retailResponse,
          queue: queueResponse,
          submittedStoreIds: this.config.storeIds,
        }),
      };
    } catch (error) {
      throw normalizeRevelatorError(error);
    }
  }

  async updateMetadata(input: { platformTrackId: string; track: Track }): Promise<void> {
    try {
      await this.authenticate();
      await this.request<any>("/content/release/save", {
        method: "POST",
        body: JSON.stringify({
          releaseId: input.platformTrackId,
          tracks: [
            {
              id: input.track.id,
              title: input.track.title,
              isrc: input.track.isrc,
              explicit: input.track.explicit ?? false,
            },
          ],
        }),
      });
    } catch (error) {
      throw normalizeRevelatorError(error);
    }
  }

  private mapToPayload(
    input: { track: Track; release: Release },
    audioFile: { fileId?: string; filename: string; externalUrl?: string; format: "wav" | "flac" } | null,
  ): RevelatorReleasePayload {
    const nowYear = new Date().getUTCFullYear();
    const artistName = input.release.primaryArtist ?? input.track.primaryArtist ?? input.release.artistId ?? "Unknown Artist";
    const title = input.release.title ?? input.track.title ?? "Untitled Release";
    const languageId = mapLanguageToProviderId(input.release.language);
    const musicStyleId = mapGenreToProviderStyleId(input.release.genre);
    const contributors = (input.release.featuredArtists ?? input.track.featuredArtists ?? []).map((name) => ({
      name,
      role: "featured_artist",
    }));
    const artistExternalIds = input.release.artistId ? [{ id: input.release.artistId, type: "tracksyra_artist_id" }] : [];
    const audioObject = audioFile
      ? {
          fileId: audioFile.fileId,
          filename: audioFile.filename,
          externalUrl: audioFile.externalUrl,
        }
      : undefined;

    return {
      name: title,
      artistName,
      contributors,
      artistExternalIds,
      copyrightC: `${nowYear} ${artistName}`,
      copyrightP: `${nowYear} ${artistName}`,
      hasRecordLabel: false,
      previouslyReleased: false,
      languageId,
      primaryMusicStyleId: musicStyleId,
      releasesLocals: [],
      isCompilation: false,
      image: input.release.coverArtUrl
        ? {
            filename: filenameFromUrl(input.release.coverArtUrl, "cover.jpg"),
            externalUrl: input.release.coverArtUrl,
          }
        : undefined,
      tracks: [
        {
          name: input.track.title ?? title,
          artistName: input.track.primaryArtist ?? artistName,
          languageId,
          contributors,
          artistExternalIds,
          explicit: input.track.explicit ?? false,
          isrc: input.track.isrc || undefined,
          wav: audioFile?.format === "wav" ? audioObject : undefined,
          flac: audioFile?.format === "flac" ? audioObject : undefined,
        },
      ],
    };
  }

  private async pullExternalAudio(track: Track): Promise<{ fileId?: string; filename: string; externalUrl?: string; format: "wav" | "flac" } | null> {
    const audioUrl = track.audioUrl;
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) return null;

    const filename = filenameFromUrl(audioUrl, `${track.id}.wav`);
    const format = filename.toLowerCase().endsWith(".flac") ? "flac" : "wav";
    const response = await this.request<{ fileId?: string; filename?: string }>(`/media/audio/pullexternal/${format}`, {
      method: "POST",
      body: JSON.stringify({
        externalUrl: audioUrl,
        filename,
      }),
    });

    return {
      fileId: response?.fileId,
      filename: response?.filename ?? filename,
      externalUrl: audioUrl,
      format,
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.sessionToken) throw normalizeRevelatorError({ status: 401, message: "Revelator adapter is not authenticated" });

    const response = await this.httpClient(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : response.statusText;
      throw { status: response.status, message, body: this.redactRawResponse(body) };
    }

    return body as T;
  }

  private redactRawResponse<T>(value: T): T {
    if (!value || typeof value !== "object") return value;
    return JSON.parse(
      JSON.stringify(value, (key, val) => {
        if (/token|authorization|api[-_]?key|secret/i.test(key)) return "[REDACTED]";
        return val;
      }),
    );
  }
}

function readEnv(key: string, fallback = ""): string {
  loadRuntimeEnv();
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key] ?? fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseStoreIds(value: string): number[] | null {
  if (!value.trim()) return null;
  const ids = value.split(",").map((part) => Number(part.trim())).filter((id) => Number.isInteger(id));
  return ids.length ? ids : null;
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function filenameFromUrl(value: string, fallback: string): string {
  try {
    const url = new URL(value);
    const last = url.pathname.split("/").filter(Boolean).pop();
    return last || fallback;
  } catch {
    return fallback;
  }
}
