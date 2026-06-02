const LANGUAGE_IDS: Record<string, number> = {
  english: 1,
  hindi: 2,
  punjabi: 3,
  tamil: 4,
  telugu: 5,
  spanish: 6,
};

const MUSIC_STYLE_IDS: Record<string, number> = {
  pop: 60,
  "hip-hop": 71,
  hiphop: 71,
  "r&b": 15,
  rock: 21,
  electronic: 42,
  indie: 85,
  bollywood: 91,
  punjabi: 92,
  classical: 31,
  jazz: 32,
  folk: 33,
};

export function mapLanguageToProviderId(language: string | null | undefined): number {
  return LANGUAGE_IDS[normalize(language)] ?? LANGUAGE_IDS.english;
}

export function mapGenreToProviderStyleId(genre: string | null | undefined): number {
  return MUSIC_STYLE_IDS[normalize(genre)] ?? MUSIC_STYLE_IDS.pop;
}

export function splitFeaturedArtists(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}
