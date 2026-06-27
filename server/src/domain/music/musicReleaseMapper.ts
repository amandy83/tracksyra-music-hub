import type { DistributionRelease, DistributionTrack } from "../../distribution/models/distributionTypes";
import type { TrackRoyaltyContext } from "../../royalties/models/royaltyTypes";
import type { MusicRelease, MusicReleaseAudioFile, MusicReleaseStatus, MusicReleaseType } from "./MusicRelease";
import { splitFeaturedArtists } from "./musicMetadataMappings";
import { validateMusicRelease } from "./musicReleaseValidation";

export type LegacySongRow = {
  id: string;
  user_id: string;
  title: string;
  primary_artist: string;
  featured_artists?: string | null;
  genre?: string | null;
  language?: string | null;
  release_date?: string | null;
  cover_art_url?: string | null;
  audio_url?: string | null;
  isrc?: string | null;
  explicit?: boolean | null;
  status?: string | null;
  created_at?: string | null;
};

export type ReleaseTrackRows = {
  release: {
    id: string;
    user_id: string;
    title: string;
    primary_artist?: string | null;
    release_type?: string | null;
    release_date?: string | null;
    genre?: string | null;
    language?: string | null;
    upc?: string | null;
    copyright_owner?: string | null;
    cover_art_url?: string | null;
    status?: string | null;
    created_at?: string | null;
  };
  tracks: Array<{
    id: string;
    release_id: string;
    user_id: string;
    title: string;
    primary_artist?: string | null;
    featured_artists?: string | null;
    audio_url?: string | null;
    isrc?: string | null;
    explicit?: boolean | null;
    duration_sec?: number | string | null;
    file_size_bytes?: number | string | null;
    audio_format?: string | null;
    track_number?: number | null;
  }>;
};

export function mapLegacySongToMusicRelease(song: LegacySongRow): MusicRelease {
  return assertValidMusicRelease({
    id: song.id,
    title: song.title,
    artistId: song.user_id,
    primaryArtistName: song.primary_artist,
    featuredArtists: splitFeaturedArtists(song.featured_artists),
    genre: song.genre || "Unknown",
    language: song.language || "Unknown",
    releaseDate: song.release_date ?? null,
    coverUrl: song.cover_art_url ?? null,
    audioFiles: [{
      trackId: song.id,
      title: song.title,
      audioUrl: song.audio_url ?? null,
      isrc: song.isrc ?? null,
      explicit: song.explicit ?? false,
      trackNumber: 1,
    }],
    type: "single",
    status: normalizeStatus(song.status),
    createdAt: song.created_at ?? new Date(0).toISOString(),
  });
}

export function mapReleaseAndTracksToMusicRelease(input: ReleaseTrackRows): MusicRelease {
  const firstTrack = input.tracks[0];
  return assertValidMusicRelease({
    id: input.release.id,
    title: input.release.title,
    artistId: input.release.user_id,
    primaryArtistName: input.release.primary_artist ?? firstTrack?.primary_artist ?? null,
    featuredArtists: splitFeaturedArtists(firstTrack?.featured_artists),
    genre: input.release.genre || "Unknown",
    language: input.release.language || "Unknown",
    upc: input.release.upc ?? null,
    copyright: input.release.copyright_owner ?? null,
    releaseDate: input.release.release_date ?? null,
    coverUrl: input.release.cover_art_url ?? null,
    audioFiles: input.tracks.map(mapTrackToAudioFile),
    type: normalizeType(input.release.release_type),
    status: normalizeStatus(input.release.status),
    createdAt: input.release.created_at ?? new Date(0).toISOString(),
  });
}

export function mapMusicReleaseToDistribution(input: {
  release: MusicRelease;
  trackId: string;
}): { release: DistributionRelease; track: DistributionTrack } {
  const audio = input.release.audioFiles.find((item) => item.trackId === input.trackId) ?? input.release.audioFiles[0];
  if (!audio) throw new Error(`MusicRelease ${input.release.id} has no audio file for distribution`);

  return {
    release: {
      id: input.release.id,
      userId: input.release.artistId,
      title: input.release.title,
      primaryArtist: input.release.primaryArtistName ?? input.release.artistId,
      artistId: input.release.artistId,
      featuredArtists: input.release.featuredArtists,
      releaseDate: input.release.releaseDate,
      genre: input.release.genre,
      language: input.release.language,
      upc: input.release.upc,
      copyright: input.release.copyright,
      coverArtUrl: input.release.coverUrl,
      type: input.release.type,
    },
    track: {
      id: audio.trackId,
      releaseId: input.release.id,
      userId: input.release.artistId,
      title: audio.title,
      primaryArtist: input.release.primaryArtistName ?? input.release.artistId,
      artistId: input.release.artistId,
      featuredArtists: input.release.featuredArtists,
      audioUrl: audio.audioUrl,
      isrc: audio.isrc,
      explicit: audio.explicit,
    },
  };
}

export function mapMusicReleaseToRoyaltyInput(release: MusicRelease, trackId: string): TrackRoyaltyContext {
  return {
    track_id: trackId,
    release_id: release.id,
    artist_id: release.artistId,
  };
}

function mapTrackToAudioFile(track: ReleaseTrackRows["tracks"][number]): MusicReleaseAudioFile {
  return {
    trackId: track.id,
    title: track.title,
    audioUrl: track.audio_url ?? null,
    isrc: track.isrc ?? null,
    explicit: track.explicit ?? false,
    durationSec: track.duration_sec == null ? null : Number(track.duration_sec),
    fileSizeBytes: track.file_size_bytes == null ? null : Number(track.file_size_bytes),
    audioFormat: track.audio_format ?? null,
    trackNumber: track.track_number ?? 1,
  };
}

function assertValidMusicRelease(release: MusicRelease): MusicRelease {
  const validation = validateMusicRelease(release);
  if (validation.ok === false) throw new Error(`Invalid MusicRelease: ${validation.errors.join("; ")}`);
  return validation.release;
}

function normalizeType(type?: string | null): MusicReleaseType {
  if (type === "ep" || type === "album") return type;
  return "single";
}

function normalizeStatus(status?: string | null): MusicReleaseStatus {
  const value = status ?? "uploaded";
  if (["draft", "uploaded", "under_review", "approved", "sent_to_stores", "processing", "live", "rejected"].includes(value)) {
    return value as MusicReleaseStatus;
  }
  if (value === "submitted") return "uploaded";
  return "uploaded";
}
