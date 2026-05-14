export const DSP_PLATFORMS = [
  { key: "spotify", label: "Spotify" },
  { key: "apple_music", label: "Apple Music" },
  { key: "youtube_music", label: "YouTube Music" },
  { key: "amazon_music", label: "Amazon Music" },
  { key: "jiosaavn", label: "JioSaavn" },
  { key: "gaana", label: "Gaana" },
  { key: "wynk", label: "Wynk" },
  { key: "deezer", label: "Deezer" },
  { key: "tidal", label: "Tidal" },
  { key: "pandora", label: "Pandora" },
  { key: "instagram_facebook", label: "Instagram / Facebook" },
  { key: "tiktok", label: "TikTok" },
] as const;

export type DspKey = typeof DSP_PLATFORMS[number]["key"];

export const DELIVERY_STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  delivered: "bg-purple-100 text-purple-800 border-purple-200",
  live: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

export const RELEASE_STAGES: { key: string; label: string }[] = [
  { key: "uploaded", label: "Uploaded" },
  { key: "under_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
  { key: "sent_to_stores", label: "Sent to Stores" },
  { key: "processing", label: "Processing" },
  { key: "live", label: "Live" },
];
