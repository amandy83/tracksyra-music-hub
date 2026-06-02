export type MusicReleaseType = "single" | "ep" | "album";

export type MusicReleaseStatus =
  | "draft"
  | "uploaded"
  | "under_review"
  | "approved"
  | "sent_to_stores"
  | "processing"
  | "live"
  | "rejected";

export type MusicReleaseAudioFile = {
  trackId: string;
  title: string;
  audioUrl: string | null;
  isrc?: string | null;
  explicit: boolean;
  durationSec?: number | null;
  fileSizeBytes?: number | null;
  audioFormat?: string | null;
  trackNumber: number;
};

export type MusicRelease = {
  id: string;
  title: string;
  artistId: string;
  primaryArtistName?: string | null;
  featuredArtists: string[];
  genre: string;
  language: string;
  releaseDate: string | null;
  coverUrl: string | null;
  audioFiles: MusicReleaseAudioFile[];
  type: MusicReleaseType;
  status: MusicReleaseStatus;
  createdAt: string;
};

export type MusicReleaseValidationResult =
  | { ok: true; release: MusicRelease }
  | { ok: false; errors: string[] };
