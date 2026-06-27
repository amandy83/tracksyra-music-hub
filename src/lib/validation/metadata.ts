import { z } from "zod";

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const UPC_RE = /^\d{12,13}$/;
const RESERVED_KEYWORDS = [
  "spotify",
  "apple music",
  "youtube music",
  "tiktok",
  "instagram",
  "facebook",
  "official audio",
  "official video",
  "copyright free",
  "royalty free",
  "public domain",
  "remix",
  "karaoke",
] as const;

export const releaseMetadataSchema = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  primary_artist: z.string().trim().min(1, "Required").max(200),
  featured_artists: z.string().trim().max(300).optional().or(z.literal("")),
  genre: z.string().trim().min(1, "Required"),
  language: z.string().trim().min(1, "Required"),
  release_date: z.string().min(1, "Required"),
  explicit: z.boolean(),
  isrc: z.string().regex(ISRC_RE, "ISRC must look like USABC2400001").optional().or(z.literal("")),
  upc: z.string().regex(UPC_RE, "UPC must be 12-13 digits").optional().or(z.literal("")),
  composer: z.string().trim().min(1, "Required").max(300),
  lyrics: z.string().trim().optional().or(z.literal("")),
  copyright_owner: z.string().trim().min(1, "Required").max(300),
});

export const declarationsSchema = z.object({
  copyright_declared: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
  ai_content_declared: z.boolean(),
  rights_owned: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
});

export type ReleaseMetadata = z.infer<typeof releaseMetadataSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;

export type MetadataValidationInput = {
  release: {
    title: string;
    primary_artist: string;
    genre: string;
    language: string;
  };
  tracks: Array<{
    title: string;
    primary_artist: string;
    composer: string;
    isrc?: string | null;
  }>;
};

export function normalizeIsrc(value: string) {
  return value.trim().replace(/[-\s]/g, "").toUpperCase();
}

export function isValidIsrc(value: string) {
  return ISRC_RE.test(normalizeIsrc(value));
}

export function validateReleaseMetadata(input: MetadataValidationInput): string[] {
  const errors: string[] = [];
  const requiredReleaseFields = [
    ["Release title", input.release.title],
    ["Primary artist", input.release.primary_artist],
    ["Genre", input.release.genre],
    ["Language", input.release.language],
  ] as const;

  requiredReleaseFields.forEach(([label, value]) => {
    if (!value.trim()) errors.push(`${label} is required.`);
  });

  input.tracks.forEach((track, index) => {
    if (!track.title.trim()) errors.push(`Track ${index + 1} title is required.`);
    if (!track.primary_artist.trim()) errors.push(`Track ${index + 1} artist is required.`);
    if (!track.composer.trim()) errors.push(`Track ${index + 1} composer is required.`);
  });

  const duplicateTrackNames = findDuplicates(input.tracks.map((track) => normalizedText(track.title)));
  duplicateTrackNames.forEach((name) => errors.push(`Duplicate track title in release: ${name}.`));

  const allText = [
    input.release.title,
    input.release.primary_artist,
    input.release.genre,
    input.release.language,
    ...input.tracks.flatMap((track) => [track.title, track.primary_artist, track.composer]),
  ];
  allText.forEach((value) => {
    const excessive = hasExcessiveSpecialCharacters(value);
    if (excessive) errors.push(`Excessive special characters detected in "${value}".`);
    const reserved = RESERVED_KEYWORDS.find((keyword) => normalizedText(value).includes(keyword));
    if (reserved) errors.push(`Reserved platform keyword "${reserved}" is not allowed in metadata.`);
  });

  input.tracks.forEach((track, index) => {
    if (track.isrc?.trim() && !isValidIsrc(track.isrc)) {
      errors.push(`Track ${index + 1} ISRC must look like USABC2400001.`);
    }
  });

  return [...new Set(errors)];
}

export function findDuplicateIsrcs(values: Array<string | null | undefined>) {
  return findDuplicates(values.filter(Boolean).map((value) => normalizeIsrc(String(value))));
}

export function buildCopyrightFlags(input: MetadataValidationInput) {
  const flags: Array<{
    track_id?: string;
    suspicious_title: boolean;
    suspicious_artist: boolean;
    suspicious_metadata: boolean;
    reason: string;
    details: Record<string, unknown>;
  }> = [];
  const suspiciousTitle = /(?:cover|tribute|soundtrack|theme from|remix|karaoke|sped up|slowed|nightcore)/i;
  const suspiciousArtist = /(?:various artists|unknown artist|spotify|youtube|vevo|official)/i;

  if (suspiciousTitle.test(input.release.title) || suspiciousArtist.test(input.release.primary_artist)) {
    flags.push({
      suspicious_title: suspiciousTitle.test(input.release.title),
      suspicious_artist: suspiciousArtist.test(input.release.primary_artist),
      suspicious_metadata: true,
      reason: "Release metadata contains terms that require copyright review.",
      details: { title: input.release.title, artist: input.release.primary_artist },
    });
  }

  input.tracks.forEach((track, index) => {
    const titleHit = suspiciousTitle.test(track.title);
    const artistHit = suspiciousArtist.test(track.primary_artist);
    if (titleHit || artistHit) {
      flags.push({
        suspicious_title: titleHit,
        suspicious_artist: artistHit,
        suspicious_metadata: true,
        reason: `Track ${index + 1} metadata contains terms that require copyright review.`,
        details: { title: track.title, artist: track.primary_artist },
      });
    }
  });

  return flags;
}

function hasExcessiveSpecialCharacters(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const specialCount = [...trimmed].filter((char) => !/[a-z0-9\s.'&,()[\]-]/i.test(char)).length;
  return specialCount > 3 || specialCount / trimmed.length > 0.25;
}

function normalizedText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.filter(Boolean).forEach((value) => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}
