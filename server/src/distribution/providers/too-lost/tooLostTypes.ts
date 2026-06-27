import type { DistributionProvider, NormalizedDistributionError, Release, Track } from "../../models/distributionTypes";

export type TooLostConfig = {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  apiUrl: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  redirectUri: string;
  tokenEncryptionKey: string;
  accountProfileUrl: string | null;
  dspTargets: string[];
  sandboxMode: boolean;
  liveApproved: boolean;
};

export type TooLostOAuthToken = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType: "Bearer";
  scope?: string | null;
};

export type TooLostOAuthStateRecord = {
  state: string;
  codeVerifier: string;
  returnToPath: string | null;
  redirectUri: string | null;
  scopes: string[];
};

export type TooLostProviderHealth = {
  provider: "too_lost";
  mode: "sandbox" | "live";
  configured: boolean;
  oauthReady: boolean;
  webhookReady: boolean;
  liveApproved: boolean;
  status: "not_configured" | "sandbox_ready" | "credentials_pending" | "live_ready" | "blocked";
  checks: Array<{ name: string; ok: boolean; message: string }>;
};

export type TooLostConnectionStatus = {
  connected: boolean;
  connectionStatus: "connected" | "disconnected" | "expired" | "refresh_failed" | "needs_authorization";
  accountStatus: string;
  distributionStatus: string;
  connectedAccount: {
    id: string | null;
    name: string | null;
    email: string | null;
  };
  lastSyncAt: string | null;
  lastRefreshAt: string | null;
  tokenExpiresAt: string | null;
  oauthStateExpiresAt: string | null;
  readyForLiveRequests: boolean;
  canRefresh: boolean;
  lastError: string | null;
  provider: "too_lost";
};

export type TooLostReleasePayload = {
  provider: "TOO_LOST";
  release: {
    title: string;
    artist: string;
    featuringArtist: string[];
    genre: string | null;
    language: string | null;
    upc: string | null;
    copyright: string;
    releaseDate: string | null;
    artwork: {
      url: string | null;
      filename: string | null;
    };
  };
  tracks: Array<{
    title: string;
    artist: string;
    featuringArtist: string[];
    genre: string | null;
    language: string | null;
    isrc: string | null;
    copyright: string;
    audioFile: {
      url: string | null;
      filename: string | null;
    };
    explicit: boolean;
  }>;
  delivery: {
    targets: string[];
    workflow: "ARTIST_UPLOAD_ADMIN_REVIEW_APPROVAL_DISTRIBUTION_QUEUE_TOO_LOST_DSP_TRACKING_LIVE_SYNC";
  };
};

export type TooLostUploadInput = {
  track: Track;
  release: Release;
};

export type TooLostAnalyticsSyncInput = {
  since?: string;
  platforms?: string[];
};

export type TooLostAnalyticsSyncResult = {
  provider: "too_lost";
  mode: "sandbox" | "live";
  syncedAt: string;
  platforms: string[];
  rawResponse: unknown;
};

export type TooLostError = NormalizedDistributionError & {
  provider: Extract<DistributionProvider, "too_lost">;
};
