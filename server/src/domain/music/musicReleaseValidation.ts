import type { MusicRelease, MusicReleaseValidationResult } from "./MusicRelease";

export function validateMusicRelease(release: MusicRelease): MusicReleaseValidationResult {
  const errors: string[] = [];
  if (!release.id) errors.push("MusicRelease.id is required");
  if (!release.title?.trim()) errors.push("MusicRelease.title is required");
  if (!release.artistId) errors.push("MusicRelease.artistId is required");
  if (!release.genre?.trim()) errors.push("MusicRelease.genre is required");
  if (!release.language?.trim()) errors.push("MusicRelease.language is required");
  if (!release.audioFiles.length) errors.push("MusicRelease requires at least one audio file");
  release.audioFiles.forEach((audio, index) => {
    if (!audio.trackId) errors.push(`audioFiles[${index}].trackId is required`);
    if (!audio.title?.trim()) errors.push(`audioFiles[${index}].title is required`);
  });

  return errors.length ? { ok: false, errors } : { ok: true, release };
}
