import type { PlatformAdapter } from "../../adapters/platformAdapter";
import type { AnalyticsSyncAdapter, AnalyticsSyncResult } from "../../adapters/analyticsSyncAdapter";
import type { ReleaseSubmissionAdapter, ReleaseSubmissionInput, ReleaseSubmissionResult } from "../../adapters/releaseSubmissionAdapter";
import type { Release, Track } from "../../models/distributionTypes";
import { normalizeTooLostError } from "./tooLostError";
import { TooLostCredentialStore } from "./tooLostCredentialStore";
import { readTooLostConfig, refreshTooLostOAuthToken } from "./tooLostOAuth";
import type { TooLostConfig, TooLostOAuthToken, TooLostReleasePayload } from "./tooLostTypes";

type HttpClient = typeof fetch;

type TooLostAdapterOptions = {
  config?: Partial<TooLostConfig>;
  httpClient?: HttpClient;
  credentialStore?: TooLostCredentialStore;
};

export class TooLostAdapter implements PlatformAdapter, ReleaseSubmissionAdapter, AnalyticsSyncAdapter {
  readonly name = "too_lost";
  readonly provider = "too_lost";
  private readonly config: TooLostConfig;
  private readonly httpClient: HttpClient;
  private readonly credentials: TooLostCredentialStore;

  constructor(options: TooLostAdapterOptions = {}) {
    this.config = readTooLostConfig(options.config);
    this.httpClient = options.httpClient ?? fetch;
    this.credentials = options.credentialStore ?? new TooLostCredentialStore();
  }

  async authenticate(): Promise<void> {
    await this.ensureAccessToken();
  }

  async uploadTrack(input: { track: Track; release: Release }): Promise<{
    platformTrackId: string;
    status: "PUBLISHED" | "FAILED";
    rawResponse: any;
  }> {
    try {
      const payload = this.buildPayload({ release: input.release, tracks: [input.track] });
      const response = await this.requestJson("/v2/releases", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const externalReleaseId = parseExternalReleaseId(response) ?? input.release.id;
      return {
        platformTrackId: externalReleaseId,
        status: "PUBLISHED",
        rawResponse: response,
      };
    } catch (error) {
      throw normalizeTooLostError(error);
    }
  }

  async submitRelease(input: ReleaseSubmissionInput): Promise<ReleaseSubmissionResult> {
    try {
      const payload = this.buildPayload({ release: input.release, tracks: input.tracks });
      const response = await this.requestJson("/v2/releases", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const externalReleaseId = parseExternalReleaseId(response) ?? input.release.id;
      return {
        provider: this.provider,
        externalReleaseId,
        status: "SUBMITTED",
        request: payload,
        response,
      };
    } catch (error) {
      throw normalizeTooLostError(error);
    }
  }

  async syncAnalytics(input: { since?: string; platforms?: string[] }): Promise<AnalyticsSyncResult> {
    throw normalizeTooLostError({
      status: 501,
      message: "Too Lost analytics endpoint is not verified in the available API documentation.",
    });
  }

  async updateMetadata(input: { platformTrackId: string; track: Track }): Promise<void> {
    throw normalizeTooLostError({
      status: 501,
      message: "Too Lost release update endpoint is not verified in the available API documentation.",
    });
  }

  private buildPayload(input: { release: Release; tracks: Track[] }): TooLostReleasePayload {
    const release = input.release;
    const primaryTrack = input.tracks[0];
    const artist = release.primaryArtist ?? primaryTrack?.primaryArtist ?? release.artistId ?? "Unknown Artist";
    const releaseTitle = release.title ?? primaryTrack?.title ?? "Untitled Release";
    const copyright = release.copyright ?? `${new Date().getUTCFullYear()} ${artist}`;

    return {
      provider: "TOO_LOST",
      release: {
        title: releaseTitle,
        artist,
        featuringArtist: release.featuredArtists ?? primaryTrack?.featuredArtists ?? [],
        genre: release.genre ?? null,
        language: release.language ?? null,
        upc: release.upc ?? null,
        copyright,
        releaseDate: release.releaseDate ?? null,
        artwork: {
          url: release.coverArtUrl ?? null,
          filename: release.coverArtUrl ? filenameFromUrl(release.coverArtUrl, "cover.jpg") : null,
        },
      },
      tracks: input.tracks.map((track) => ({
        title: track.title ?? releaseTitle,
        artist: track.primaryArtist ?? artist,
        featuringArtist: track.featuredArtists ?? release.featuredArtists ?? [],
        genre: release.genre ?? null,
        language: release.language ?? null,
        isrc: track.isrc ?? null,
        copyright,
        audioFile: {
          url: track.audioUrl ?? null,
          filename: track.audioUrl ? filenameFromUrl(track.audioUrl, `${track.id}.wav`) : null,
        },
        explicit: track.explicit ?? false,
      })),
      delivery: {
        targets: this.config.dspTargets,
        workflow: "ARTIST_UPLOAD_ADMIN_REVIEW_APPROVAL_DISTRIBUTION_QUEUE_TOO_LOST_DSP_TRACKING_LIVE_SYNC",
      },
    };
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const accessToken = await this.ensureAccessToken();
    const response = await this.httpClient(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? safeJsonParse(text) : null;
    if (response.status === 401) {
      const refreshed = await this.refreshAccessTokenIfPossible();
      if (refreshed) return this.requestJson(path, init);
    }
    if (response.status === 429) {
      throw normalizeTooLostError({ status: 429, message: "Too Lost API rate limit exceeded" });
    }
    if (!response.ok) {
      throw { status: response.status, message: typeof body?.message === "string" ? body.message : response.statusText, body };
    }
    return body;
  }

  private async ensureAccessToken(): Promise<string> {
    const credentials = await this.credentials.loadTokenSet();
    if (!credentials?.accessToken) {
      throw normalizeTooLostError({ status: 401, message: "Too Lost account is not connected" });
    }
    if (credentials.tokenExpiresAt && new Date(credentials.tokenExpiresAt).getTime() <= Date.now()) {
      if (!credentials.refreshToken) {
        throw normalizeTooLostError({ status: 401, message: "Too Lost access token expired and no refresh token is available" });
      }
      const token = await this.refreshAccessToken(credentials.refreshToken);
      await this.persistToken(token, credentials);
      return token.accessToken;
    }
    return credentials.accessToken;
  }

  private async refreshAccessToken(refreshToken: string): Promise<TooLostOAuthToken> {
    try {
      return await refreshTooLostOAuthToken({ refreshToken, config: this.config, httpClient: this.httpClient });
    } catch (error) {
      throw normalizeTooLostError(error);
    }
  }

  private async refreshAccessTokenIfPossible(): Promise<boolean> {
    const credentials = await this.credentials.loadTokenSet();
    if (!credentials?.refreshToken) return false;
    const token = await this.refreshAccessToken(credentials.refreshToken);
    await this.persistToken(token, credentials);
    return true;
  }

  private async persistToken(token: TooLostOAuthToken, current: Awaited<ReturnType<TooLostCredentialStore["loadTokenSet"]>>) {
    await this.credentials.storeTokenSet(token, {
      connectedAccountId: current?.connectedAccountId ?? null,
      connectedAccountName: current?.connectedAccountName ?? null,
      connectedAccountEmail: current?.connectedAccountEmail ?? null,
    });
  }
}

function parseExternalReleaseId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, any>;
  return String(body.releaseId ?? body.release_id ?? body.id ?? body.data?.releaseId ?? body.data?.id ?? "").trim() || null;
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

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}
