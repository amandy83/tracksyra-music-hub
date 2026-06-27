import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Disc3, FileAudio, ImageIcon, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { validateAudio, type AudioMeta } from "@/lib/validation/audio";
import { validateCover, type CoverMeta } from "@/lib/validation/cover";
import {
  buildCopyrightFlags,
  declarationsSchema,
  findDuplicateIsrcs,
  isValidIsrc,
  normalizeIsrc,
  releaseMetadataSchema,
  validateReleaseMetadata,
} from "@/lib/validation/metadata";
import { DSP_PLATFORMS } from "@/lib/validation/platforms";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; onSuccess?: () => void };
type ReleaseType = "single" | "ep" | "album";
type ContributorRole = "primary_artist" | "featured_artist" | "producer" | "composer" | "lyricist" | "songwriter" | "engineer" | "label";

type TrackDraft = {
  id: string;
  title: string;
  primary_artist: string;
  featured_artists: string;
  composer: string;
  lyrics: string;
  isrc: string;
  explicit: boolean;
  file: File | null;
  meta: AudioMeta | null;
  errors: string[];
  waveform: number[];
};

type ContributorDraft = {
  id: string;
  name: string;
  role: ContributorRole;
  share_percent: string;
  trackIndex: string;
};

type MediaProcessingStage = {
  label: string;
  status: "pending" | "active" | "done" | "warning" | "error";
};

type ValidationRpcClient = typeof supabase & {
  rpc(fn: "record_release_validation", args: {
    p_release_id: string;
    p_results: unknown[];
    p_copyright_flags?: unknown[];
    p_duplicates?: unknown[];
  }): Promise<{ data: { blocked?: boolean; status?: string } | null; error: { message?: string } | null }>;
  rpc(fn: "submit_release_for_admin_review", args: { p_release_id: string }): Promise<{ error: { message?: string } | null }>;
};

const client = supabase as any;
const releaseTypeRules: Record<ReleaseType, { label: string; min: number; max: number }> = {
  single: { label: "Single", min: 1, max: 1 },
  ep: { label: "EP", min: 2, max: 6 },
  album: { label: "Album", min: 7, max: 40 },
};

const initialRelease = {
  title: "",
  primary_artist: "",
  release_type: "single" as ReleaseType,
  genre: "Pop",
  language: "English",
  release_date: new Date().toISOString().slice(0, 10),
  upc: "",
  copyright_owner: "",
};

const blankTrack = (primaryArtist = "", index = 1): TrackDraft => ({
  id: crypto.randomUUID(),
  title: "",
  primary_artist: primaryArtist,
  featured_artists: "",
  composer: "",
  lyrics: "",
  isrc: "",
  explicit: false,
  file: null,
  meta: null,
  errors: [],
  waveform: [],
});

const blankContributor = (name = "", role: ContributorRole = "primary_artist"): ContributorDraft => ({
  id: crypto.randomUUID(),
  name,
  role,
  share_percent: "",
  trackIndex: "release",
});

function updateStage(items: MediaProcessingStage[], doneIndex: number, doneStatus: MediaProcessingStage["status"], nextIndex?: number): MediaProcessingStage[] {
  return items.map((item, index) => {
    if (index === doneIndex) return { ...item, status: doneStatus };
    if (index === nextIndex) return { ...item, status: "active" };
    return item;
  });
}

async function buildWaveformPreview(file: File): Promise<number[]> {
  try {
    const buf = await file.arrayBuffer();
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const channel = audio.getChannelData(0);
    const bars = 48;
    const bucket = Math.max(1, Math.floor(channel.length / bars));
    return Array.from({ length: bars }, (_, index) => {
      let peak = 0;
      const start = index * bucket;
      for (let i = start; i < Math.min(start + bucket, channel.length); i += 1) peak = Math.max(peak, Math.abs(channel[i]));
      return Math.max(0.08, Math.min(1, peak));
    });
  } catch {
    return [];
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 140);
}

function fileTitle(name: string) {
  return name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

async function buildReleaseValidationPayload(input: {
  releaseId: string;
  release: typeof initialRelease;
  tracks: TrackDraft[];
  trackIds: string[];
  coverFile: File;
  coverMeta: CoverMeta;
}) {
  const results: any[] = [];
  const duplicates: any[] = [];
  const copyrightFlags = buildCopyrightFlags({
    release: input.release,
    tracks: input.tracks.map((track) => ({
      title: track.title,
      primary_artist: track.primary_artist,
      composer: track.composer,
      isrc: track.isrc,
    })),
  });

  input.tracks.forEach((track, index) => {
    results.push({
      track_id: input.trackIds[index],
      validation_type: "audio",
      status: track.meta ? "passed" : "failed",
      validation_status: track.meta ? "passed" : "failed",
      details: track.meta
        ? {
            format: track.meta.format,
            sample_rate_hz: track.meta.sample_rate_hz,
            bit_depth: track.meta.bit_depth,
            channels: track.meta.channels,
            duration_sec: track.meta.duration_sec,
            file_size_bytes: track.meta.file_size_bytes,
            hash: track.meta.hash,
          }
        : { errors: track.errors },
    });
  });

  results.push({
    validation_type: "artwork",
    status: "passed",
    validation_status: "passed",
    width: input.coverMeta.width,
    height: input.coverMeta.height,
    mime_type: input.coverMeta.format,
    details: {
      width: input.coverMeta.width,
      height: input.coverMeta.height,
      mime_type: input.coverMeta.format,
      file_size_bytes: input.coverFile.size,
      hash: input.coverMeta.hash,
      color_profile: input.coverMeta.colorProfile,
      has_transparency: input.coverMeta.hasTransparency,
    },
  });

  const metadataErrors = validateReleaseMetadata({
    release: input.release,
    tracks: input.tracks.map((track) => ({
      title: track.title,
      primary_artist: track.primary_artist,
      composer: track.composer,
      isrc: track.isrc,
    })),
  });
  results.push({
    validation_type: "metadata",
    status: metadataErrors.length ? "failed" : "passed",
    validation_status: metadataErrors.length ? "failed" : "passed",
    details: metadataErrors.length ? { errors: metadataErrors } : { checked_fields: ["title", "primary_artist", "genre", "language", "track_title", "track_artist", "composer"] },
  });

  const isrcErrors: string[] = [];
  const duplicateFormIsrcs = findDuplicateIsrcs(input.tracks.map((track) => track.isrc));
  duplicateFormIsrcs.forEach((isrc) => isrcErrors.push(`Duplicate ISRC in this release: ${isrc}.`));
  input.tracks.forEach((track, index) => {
    const normalized = track.isrc ? normalizeIsrc(track.isrc) : "";
    if (normalized && !isValidIsrc(normalized)) isrcErrors.push(`Track ${index + 1} ISRC format is invalid.`);
  });

  const normalizedIsrcs = input.tracks.map((track) => track.isrc ? normalizeIsrc(track.isrc) : "").filter(Boolean);
  if (normalizedIsrcs.length) {
    const { data: existingIsrcs } = await supabase
      .from("tracks")
      .select("id,release_id,isrc")
      .in("isrc", normalizedIsrcs);
    (existingIsrcs || []).filter((row: any) => !input.trackIds.includes(row.id)).forEach((row: any) => {
      const matchedIndex = input.tracks.findIndex((track) => normalizeIsrc(track.isrc || "") === normalizeIsrc(row.isrc || ""));
      isrcErrors.push(`ISRC ${normalizeIsrc(row.isrc || "")} already exists in TrackSyra.`);
      duplicates.push({
        matched_release_id: row.release_id,
        track_id: input.trackIds[matchedIndex] || null,
        matched_track_id: row.id,
        duplicate_type: "isrc",
        severity: "blocker",
        details: { isrc: normalizeIsrc(row.isrc || "") },
      });
    });
  }

  results.push({
    validation_type: "isrc",
    status: isrcErrors.length ? "failed" : "passed",
    validation_status: isrcErrors.length ? "failed" : "passed",
    details: isrcErrors.length ? { errors: [...new Set(isrcErrors)] } : { checked_isrc_count: normalizedIsrcs.length },
  });

  const copyrightStatus = copyrightFlags.length ? "warning" : "passed";
  results.push({
    validation_type: "copyright",
    status: copyrightStatus,
    validation_status: copyrightStatus,
    details: copyrightFlags.length ? { warnings: copyrightFlags.map((flag) => flag.reason) } : { flags: 0 },
  });

  const { data: titleMatches } = await supabase
    .from("releases")
    .select("id,title,primary_artist")
    .ilike("title", input.release.title.trim())
    .ilike("primary_artist", input.release.primary_artist.trim());
  (titleMatches || []).filter((row: any) => row.id !== input.releaseId).forEach((row: any) => {
    duplicates.push({
      matched_release_id: row.id,
      duplicate_type: "title_artist",
      severity: "warning",
      details: { title: row.title, primary_artist: row.primary_artist },
    });
  });

  const { data: artworkMatches } = await client
    .from("releases")
    .select("id,artwork_hash")
    .eq("artwork_hash", input.coverMeta.hash);
  (artworkMatches || []).filter((row: any) => row.id !== input.releaseId).forEach((row: any) => {
    duplicates.push({
      matched_release_id: row.id,
      duplicate_type: "artwork_hash",
      severity: "warning",
      details: { artwork_hash: row.artwork_hash },
    });
  });

  const audioHashes = input.tracks.map((track) => track.meta?.hash).filter(Boolean) as string[];
  const duplicateAudioInRelease = new Set(audioHashes.filter((hash, index) => audioHashes.indexOf(hash) !== index));
  duplicateAudioInRelease.forEach((hash) => {
    input.tracks.forEach((track, index) => {
      if (track.meta?.hash === hash) {
        duplicates.push({
          track_id: input.trackIds[index],
          duplicate_type: "audio_hash",
          severity: "blocker",
          details: { audio_hash: hash, reason: "Duplicate audio inside release package." },
        });
      }
    });
  });

  if (audioHashes.length) {
    const { data: audioMatches } = await supabase.from("tracks").select("id,release_id,audio_hash").in("audio_hash", audioHashes);
    (audioMatches || []).filter((row: any) => !input.trackIds.includes(row.id)).forEach((row: any) => {
      const matchedIndex = input.tracks.findIndex((track) => track.meta?.hash === row.audio_hash);
      duplicates.push({
        matched_release_id: row.release_id,
        track_id: input.trackIds[matchedIndex] || null,
        matched_track_id: row.id,
        duplicate_type: "audio_hash",
        severity: "blocker",
        details: { audio_hash: row.audio_hash },
      });
    });
  }

  results.push({
    validation_type: "duplicate",
    status: duplicates.some((duplicate) => duplicate.severity === "blocker") ? "failed" : duplicates.length ? "warning" : "passed",
    validation_status: duplicates.some((duplicate) => duplicate.severity === "blocker") ? "failed" : duplicates.length ? "warning" : "passed",
    details: { duplicate_count: duplicates.length, blocker_count: duplicates.filter((duplicate) => duplicate.severity === "blocker").length },
  });

  return { results, copyrightFlags, duplicates };
}

export default function UploadReleaseDialog({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [release, setRelease] = useState(initialRelease);
  const [tracks, setTracks] = useState<TrackDraft[]>([blankTrack()]);
  const [contributors, setContributors] = useState<ContributorDraft[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverMeta, setCoverMeta] = useState<CoverMeta | null>(null);
  const [coverErrors, setCoverErrors] = useState<string[]>([]);
  const [coverPreview, setCoverPreview] = useState("");
  const [decl, setDecl] = useState({ copyright_declared: false, ai_content_declared: false, rights_owned: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStages, setProcessingStages] = useState<MediaProcessingStage[]>([]);

  const rules = releaseTypeRules[release.release_type];
  const validTracks = tracks.filter((track) => track.file && track.meta && !track.errors.length);
  const trackCountOk = tracks.length >= rules.min && tracks.length <= rules.max;
  const canAddTrack = tracks.length < rules.max;
  const canSubmit = coverMeta && validTracks.length === tracks.length && trackCountOk && decl.copyright_declared && decl.rights_owned;
  const contributorTotal = useMemo(
    () => contributors.reduce((sum, item) => sum + (Number(item.share_percent) || 0), 0),
    [contributors],
  );

  const reset = () => {
    setStep(1);
    setRelease(initialRelease);
    setTracks([blankTrack()]);
    setContributors([]);
    setCoverFile(null);
    setCoverMeta(null);
    setCoverErrors([]);
    setCoverPreview("");
    setDecl({ copyright_declared: false, ai_content_declared: false, rights_owned: false });
    setFieldErrors({});
    setProgress(0);
    setProcessingStages([]);
  };

  const setReleaseType = (release_type: ReleaseType) => {
    const nextRules = releaseTypeRules[release_type];
    setRelease((value) => ({ ...value, release_type }));
    setTracks((items) => {
      const trimmed = items.slice(0, nextRules.max);
      while (trimmed.length < nextRules.min) trimmed.push(blankTrack(release.primary_artist, trimmed.length + 1));
      return trimmed;
    });
  };

  const updateTrack = (index: number, patch: Partial<TrackDraft>) => {
    setTracks((items) => items.map((track, i) => (i === index ? { ...track, ...patch } : track)));
  };

  const handleAudio = async (index: number, file: File) => {
    updateTrack(index, { file, meta: null, errors: [], waveform: [] });
    setValidating(true);
    const result = await validateAudio(file);
    if (result.ok === true) {
      updateTrack(index, {
        title: tracks[index].title || fileTitle(file.name),
        primary_artist: tracks[index].primary_artist || release.primary_artist,
        meta: result.meta,
        waveform: await buildWaveformPreview(file),
      });
    } else {
      updateTrack(index, { errors: result.errors });
    }
    setValidating(false);
  };

  const handleCover = async (file: File) => {
    setCoverFile(file);
    setCoverMeta(null);
    setCoverErrors([]);
    setCoverPreview("");
    setValidating(true);
    const result = await validateCover(file);
    if (result.ok === true) {
      setCoverMeta(result.meta);
      setCoverPreview(result.previewUrl);
    } else {
      setCoverErrors(result.errors);
    }
    setValidating(false);
  };

  const validateMetadata = (requireFiles: boolean) => {
    const parsed = releaseMetadataSchema.safeParse({
      title: release.title,
      primary_artist: release.primary_artist,
      featured_artists: "",
      genre: release.genre,
      language: release.language,
      release_date: release.release_date,
      explicit: tracks.some((track) => track.explicit),
      isrc: "",
      upc: release.upc,
      composer: tracks[0]?.composer || "Draft contributor",
      lyrics: "",
      copyright_owner: release.copyright_owner,
    });
    const errors: Record<string, string> = {};
    if (!parsed.success) parsed.error.issues.forEach((issue) => { errors[issue.path[0] as string] = issue.message; });
    if (!trackCountOk) errors.release_type = `${rules.label} requires ${rules.min === rules.max ? rules.min : `${rules.min}-${rules.max}`} track${rules.max === 1 ? "" : "s"}.`;
    tracks.forEach((track, index) => {
      if (!track.title.trim()) errors[`track_${index}_title`] = "Required";
      if (!track.primary_artist.trim()) errors[`track_${index}_primary_artist`] = "Required";
      if (!track.composer.trim()) errors[`track_${index}_composer`] = "Required";
      if (requireFiles && (!track.file || !track.meta || track.errors.length)) errors[`track_${index}_file`] = "Valid audio required";
    });
    const productionMetadataErrors = validateReleaseMetadata({
      release,
      tracks: tracks.map((track) => ({
        title: track.title,
        primary_artist: track.primary_artist,
        composer: track.composer,
        isrc: track.isrc,
      })),
    });
    if (productionMetadataErrors.length) errors.production_metadata = productionMetadataErrors.join(" ");
    if (requireFiles && !coverMeta) errors.cover = "Valid artwork required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createReleaseRecord = async (status: "draft" | "uploaded", coverUrl: string | null, artworkHash?: string | null) => {
    if (!user) throw new Error("You must be signed in.");
    const { data, error } = await supabase.from("releases").insert({
      user_id: user.id,
      artist_id: user.id,
      title: release.title,
      primary_artist: release.primary_artist,
      release_type: release.release_type,
      release_date: release.release_date || null,
      genre: release.genre,
      language: release.language,
      upc: release.upc || null,
      copyright_owner: release.copyright_owner,
      copyright_declared: decl.copyright_declared,
      ai_content_declared: decl.ai_content_declared,
      rights_owned: decl.rights_owned,
      cover_art_url: coverUrl,
      artwork_hash: artworkHash || null,
      metadata: { phase: "release-management-v2", draft_saved_at: status === "draft" ? new Date().toISOString() : null },
      status,
    } as any).select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  const insertContributors = async (releaseId: string, trackIds: string[] = []) => {
    if (!user) return;
    const explicitRows = contributors
      .filter((item) => item.name.trim())
      .map((item) => ({
        user_id: user.id,
        release_id: releaseId,
        track_id: item.trackIndex === "release" ? null : trackIds[Number(item.trackIndex)] || null,
        name: item.name.trim(),
        role: item.role,
        share_percent: item.share_percent ? Number(item.share_percent) : null,
      }));
    const rows = explicitRows.length ? explicitRows : [{
      user_id: user.id,
      release_id: releaseId,
      track_id: null,
      name: release.primary_artist,
      role: "primary_artist",
      share_percent: null,
    }];
    const { error } = await client.from("release_contributors").insert(rows);
    if (error) throw error;
  };

  const saveDraft = async () => {
    if (!validateMetadata(false)) return;
    setSubmitting(true);
    try {
      const releaseId = await createReleaseRecord("draft", null, null);
      await insertContributors(releaseId);
      await supabase.from("upload_logs").insert({
        user_id: user?.id,
        release_id: releaseId,
        file_name: "release-draft",
        status: "draft",
      } as any);
      toast.success("Draft saved.");
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (error: any) {
      toast.error(error.message || "Draft save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!user || !coverFile || !coverMeta || !validateMetadata(true)) return;
    const declarations = declarationsSchema.safeParse(decl);
    if (!declarations.success) {
      toast.error("Please confirm all required declarations.");
      return;
    }

    setSubmitting(true);
    setProgress(0);
    try {
      const { data: approved, error: approvalError } = await client.rpc("is_approved_artist");
      if (approvalError) throw approvalError;
      if (!approved) throw new Error("Your artist request must be approved before uploading releases.");

      setProcessingStages([
        { label: "Uploading artwork", status: "active" },
        { label: "Uploading private audio", status: "pending" },
        { label: "Creating release metadata", status: "pending" },
        { label: "Creating contributors", status: "pending" },
        { label: "Queueing media processing", status: "pending" },
      ]);

      const timestamp = Date.now();
      const coverPath = `${user.id}/artwork/${timestamp}-${sanitizeFileName(coverFile.name)}`;
      const coverUpload = await supabase.storage.from("covers").upload(coverPath, coverFile, {
        upsert: false,
        contentType: coverFile.type,
      });
      if (coverUpload.error) throw coverUpload.error;
      const coverUrl = supabase.storage.from("covers").getPublicUrl(coverPath).data.publicUrl;
      setProgress(15);
      setProcessingStages((items) => updateStage(items, 0, "done", 1));

      const audioUploads = [];
      for (const [index, track] of tracks.entries()) {
        if (!track.file || !track.meta) throw new Error(`Track ${index + 1} is missing valid audio.`);
        const audioPath = `${user.id}/audio/${timestamp}-${index + 1}-${sanitizeFileName(track.file.name)}`;
        const upload = await supabase.storage.from("audio").upload(audioPath, track.file, {
          upsert: false,
          contentType: track.file.type || `audio/${track.meta.format}`,
        });
        if (upload.error) throw upload.error;
        audioUploads.push({ path: audioPath, file: track.file, meta: track.meta });
        setProgress(15 + Math.round(((index + 1) / tracks.length) * 35));
      }
      setProcessingStages((items) => updateStage(items, 1, "done", 2));

      const releaseId = await createReleaseRecord("draft", coverUrl, coverMeta.hash);
      const trackIds: string[] = [];
      const mediaAssetRows = [];
      for (const [index, track] of tracks.entries()) {
        const upload = audioUploads[index];
        const { data: trackRow, error: trackError } = await supabase.from("tracks").insert({
          release_id: releaseId,
          user_id: user.id,
          artist_id: user.id,
          title: track.title,
          primary_artist: track.primary_artist,
          featured_artists: track.featured_artists || null,
          composer: track.composer,
          lyrics: track.lyrics || null,
          isrc: track.isrc || null,
          explicit: track.explicit,
          audio_url: upload.path,
          audio_hash: upload.meta.hash,
          bitrate_kbps: upload.meta.bitrate_kbps,
          sample_rate_hz: upload.meta.sample_rate_hz,
          channels: upload.meta.channels,
          duration_sec: upload.meta.duration_sec,
          file_size_bytes: upload.meta.file_size_bytes,
          audio_format: upload.meta.format,
          track_number: index + 1,
        } as any).select("id").single();
        if (trackError) throw trackError;
        trackIds.push(trackRow.id);
        mediaAssetRows.push({
          user_id: user.id,
          release_id: releaseId,
          track_id: trackRow.id,
          asset_type: "audio",
          status: "uploaded",
          original_filename: upload.file.name,
          original_mime_type: upload.file.type || `audio/${upload.meta.format}`,
          original_file_size_bytes: upload.file.size,
          source_bucket: "audio",
          source_key: upload.path,
          metadata: {
            client_hash: upload.meta.hash,
            bitrate_kbps: upload.meta.bitrate_kbps,
            sample_rate_hz: upload.meta.sample_rate_hz,
            channels: upload.meta.channels,
            duration_sec: upload.meta.duration_sec,
            track_number: index + 1,
          },
        });
      }
      mediaAssetRows.push({
        user_id: user.id,
        release_id: releaseId,
        track_id: null,
        asset_type: "artwork",
        status: "uploaded",
        original_filename: coverFile.name,
        original_mime_type: coverFile.type,
        original_file_size_bytes: coverFile.size,
        source_bucket: "covers",
        source_key: coverPath,
        metadata: { width: coverMeta.width, height: coverMeta.height, client_hash: coverMeta.hash, color_profile: coverMeta.colorProfile },
      });
      setProgress(60);
      setProcessingStages((items) => updateStage(items, 2, "done", 3));

      await insertContributors(releaseId, trackIds);
      setProcessingStages((items) => updateStage(items, 3, "done", 4));

      const { data: mediaAssets, error: mediaAssetError } = await client.from("media_assets").insert(mediaAssetRows).select("id,asset_type");
      if (mediaAssetError) throw mediaAssetError;
      const jobs = (mediaAssets || []).flatMap((asset: any) => {
        if (asset.asset_type === "audio") {
          return [
            { asset_id: asset.id, job_type: "AUDIO_PROCESSING", status: "queued" },
            { asset_id: asset.id, job_type: "WAVEFORM_GENERATION", status: "queued" },
            { asset_id: asset.id, job_type: "FINGERPRINT_ANALYSIS", status: "queued" },
          ];
        }
        return [{ asset_id: asset.id, job_type: "ARTWORK_PROCESSING", status: "queued" }];
      });
      if (jobs.length) {
        const { error: jobError } = await client.from("media_processing_jobs").insert(jobs);
        if (jobError) throw jobError;
      }
      setProcessingStages((items) => updateStage(items, 4, "done"));

      const { error: submitError } = await supabase.from("releases").update({
        status: "uploaded",
        copyright_declared: decl.copyright_declared,
        ai_content_declared: decl.ai_content_declared,
        rights_owned: decl.rights_owned,
      }).eq("id", releaseId).eq("user_id", user.id);
      if (submitError) throw submitError;

      const validationPayload = await buildReleaseValidationPayload({
        releaseId,
        release,
        tracks,
        trackIds,
        coverFile,
        coverMeta,
      });
      const validationClient = supabase as unknown as ValidationRpcClient;
      const { data: validationData, error: validationError } = await validationClient.rpc("record_release_validation", {
        p_release_id: releaseId,
        p_results: validationPayload.results,
        p_copyright_flags: validationPayload.copyrightFlags,
        p_duplicates: validationPayload.duplicates,
      });
      if (validationError) throw validationError;
      if (validationData?.blocked) {
        throw new Error("Release uploaded but failed validation. Review the validation summary for exact failure reasons.");
      }

      const { error: reviewError } = await validationClient.rpc("submit_release_for_admin_review", { p_release_id: releaseId });
      if (reviewError) throw reviewError;

      await supabase.from("upload_logs").insert({
        user_id: user.id,
        release_id: releaseId,
        file_name: `${release.title} (${tracks.length} tracks)`,
        file_size_bytes: tracks.reduce((sum, track) => sum + (track.file?.size || 0), coverFile.size),
        file_type: "release-package",
        status: "success",
      });

      setProgress(100);
      toast.success("Release passed validation and entered admin review.");
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
      if (user) await supabase.from("upload_logs").insert({
        user_id: user.id,
        file_name: release.title || "release-upload",
        status: "error",
        error_message: String(error.message || error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!submitting) { onOpenChange(value); if (!value) reset(); } }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Release - Step {step} of 5</DialogTitle>
        </DialogHeader>

        {fieldErrors.production_metadata && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{fieldErrors.production_metadata}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Release title *</Label>
              <Input value={release.title} onChange={(event) => setRelease({ ...release, title: event.target.value })} />
              {fieldErrors.title && <p className="text-xs text-destructive mt-1">{fieldErrors.title}</p>}
            </div>
            <div>
              <Label>Primary artist *</Label>
              <Input value={release.primary_artist} onChange={(event) => {
                const primary_artist = event.target.value;
                setRelease({ ...release, primary_artist });
                setTracks((items) => items.map((track) => ({ ...track, primary_artist: track.primary_artist || primary_artist })));
              }} />
              {fieldErrors.primary_artist && <p className="text-xs text-destructive mt-1">{fieldErrors.primary_artist}</p>}
            </div>
            <div>
              <Label>Release type *</Label>
              <Select value={release.release_type} onValueChange={(value: ReleaseType) => setReleaseType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single (1 track)</SelectItem>
                  <SelectItem value="ep">EP (2-6 tracks)</SelectItem>
                  <SelectItem value="album">Album (7-40 tracks)</SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.release_type && <p className="text-xs text-destructive mt-1">{fieldErrors.release_type}</p>}
            </div>
            <div>
              <Label>Release date *</Label>
              <Input type="date" value={release.release_date} onChange={(event) => setRelease({ ...release, release_date: event.target.value })} />
            </div>
            <div>
              <Label>Genre *</Label>
              <Select value={release.genre} onValueChange={(value) => setRelease({ ...release, genre: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Indie", "Bollywood", "Punjabi", "Classical", "Jazz", "Folk", "Other"].map((genre) => <SelectItem key={genre} value={genre}>{genre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language *</Label>
              <Select value={release.language} onValueChange={(value) => setRelease({ ...release, language: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["English", "Hindi", "Punjabi", "Tamil", "Telugu", "Spanish", "Other"].map((language) => <SelectItem key={language} value={language}>{language}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>UPC</Label>
              <Input value={release.upc} onChange={(event) => setRelease({ ...release, upc: event.target.value })} />
              {fieldErrors.upc && <p className="text-xs text-destructive mt-1">{fieldErrors.upc}</p>}
            </div>
            <div>
              <Label>Copyright owner *</Label>
              <Input value={release.copyright_owner} onChange={(event) => setRelease({ ...release, copyright_owner: event.target.value })} />
              {fieldErrors.copyright_owner && <p className="text-xs text-destructive mt-1">{fieldErrors.copyright_owner}</p>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Artwork (JPG/PNG, square, 3000-10000px, no transparency)</Label>
              <Input type="file" accept="image/jpeg,image/png" onChange={(event) => event.target.files?.[0] && handleCover(event.target.files[0])} />
              {validating && <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />Validating...</p>}
              {coverPreview && <img src={coverPreview} className="mt-2 w-32 h-32 rounded object-cover border" alt="cover" />}
              {coverMeta && <Alert className="mt-2 border-green-200 bg-green-50"><CheckCircle2 className="w-4 h-4 text-green-700" /><AlertDescription>{coverMeta.width}x{coverMeta.height} artwork accepted.</AlertDescription></Alert>}
              {[...coverErrors, fieldErrors.cover].filter(Boolean).map((error, index) => <Alert key={index} variant="destructive" className="mt-2"><AlertCircle className="w-4 h-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Tracks</h3>
                <p className="text-sm text-muted-foreground">{rules.label} requires {rules.min === rules.max ? rules.min : `${rules.min}-${rules.max}`} track{rules.max === 1 ? "" : "s"}.</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={!canAddTrack} onClick={() => setTracks((items) => [...items, blankTrack(release.primary_artist, items.length + 1)])}>
                <Plus className="w-4 h-4 mr-2" />Track
              </Button>
            </div>

            <div className="space-y-3">
              {tracks.map((track, index) => (
                <Card key={track.id} className="p-3">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline">Track {index + 1}</Badge>
                    {tracks.length > rules.min && (
                      <Button type="button" size="icon" variant="ghost" onClick={() => setTracks((items) => items.filter((_, i) => i !== index))}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Audio *</Label>
                      <Input type="file" accept=".wav,.flac,audio/wav,audio/flac" onChange={(event) => event.target.files?.[0] && handleAudio(index, event.target.files[0])} />
                      {fieldErrors[`track_${index}_file`] && <p className="text-xs text-destructive mt-1">{fieldErrors[`track_${index}_file`]}</p>}
                    </div>
                    <div>
                      <Label>Track title *</Label>
                      <Input value={track.title} onChange={(event) => updateTrack(index, { title: event.target.value })} />
                      {fieldErrors[`track_${index}_title`] && <p className="text-xs text-destructive mt-1">{fieldErrors[`track_${index}_title`]}</p>}
                    </div>
                    <div>
                      <Label>Track primary artist *</Label>
                      <Input value={track.primary_artist} onChange={(event) => updateTrack(index, { primary_artist: event.target.value })} />
                      {fieldErrors[`track_${index}_primary_artist`] && <p className="text-xs text-destructive mt-1">{fieldErrors[`track_${index}_primary_artist`]}</p>}
                    </div>
                    <div>
                      <Label>Featured artists</Label>
                      <Input value={track.featured_artists} onChange={(event) => updateTrack(index, { featured_artists: event.target.value })} />
                    </div>
                    <div>
                      <Label>Composer *</Label>
                      <Input value={track.composer} onChange={(event) => updateTrack(index, { composer: event.target.value })} />
                      {fieldErrors[`track_${index}_composer`] && <p className="text-xs text-destructive mt-1">{fieldErrors[`track_${index}_composer`]}</p>}
                    </div>
                    <div>
                      <Label>ISRC</Label>
                      <Input value={track.isrc} onChange={(event) => updateTrack(index, { isrc: event.target.value })} />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <Checkbox id={`explicit-${track.id}`} checked={track.explicit} onCheckedChange={(value) => updateTrack(index, { explicit: !!value })} />
                      <Label htmlFor={`explicit-${track.id}`}>Contains explicit content</Label>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Lyrics</Label>
                      <Textarea rows={3} value={track.lyrics} onChange={(event) => updateTrack(index, { lyrics: event.target.value })} />
                    </div>
                  </div>
                  {track.meta && <Alert className="mt-3 border-green-200 bg-green-50"><FileAudio className="w-4 h-4 text-green-700" /><AlertDescription>{track.meta.format.toUpperCase()} - {track.meta.sample_rate_hz} Hz - {track.meta.duration_sec}s - {(track.meta.file_size_bytes / 1024 / 1024).toFixed(1)} MB</AlertDescription></Alert>}
                  {track.waveform.length > 0 && (
                    <div className="mt-2 h-12 rounded border bg-muted/40 px-2 py-2 flex items-center gap-[2px]">
                      {track.waveform.map((value, barIndex) => <span key={barIndex} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(6, value * 40)}px` }} />)}
                    </div>
                  )}
                  {track.errors.map((error, errorIndex) => <Alert key={errorIndex} variant="destructive" className="mt-2"><AlertCircle className="w-4 h-4" /><AlertDescription>{error}</AlertDescription></Alert>)}
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Contributors</h3>
                <p className="text-sm text-muted-foreground">Add release-level or track-level contributors and optional royalty splits.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setContributors((items) => [...items, blankContributor()])}>
                <Plus className="w-4 h-4 mr-2" />Contributor
              </Button>
            </div>
            {contributors.length === 0 ? (
              <Card className="p-6 text-center border-dashed">
                <Disc3 className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No contributors added. The primary artist will be recorded automatically.</p>
              </Card>
            ) : contributors.map((contributor, index) => (
              <Card key={contributor.id} className="p-3 grid grid-cols-1 sm:grid-cols-[1fr_150px_110px_140px_40px] gap-2 items-end">
                <div>
                  <Label>Name</Label>
                  <Input value={contributor.name} onChange={(event) => setContributors((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={contributor.role} onValueChange={(value: ContributorRole) => setContributors((items) => items.map((item, i) => i === index ? { ...item, role: value } : item))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["primary_artist", "featured_artist", "producer", "composer", "lyricist", "songwriter", "engineer", "label"].map((role) => <SelectItem key={role} value={role}>{role.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Split %</Label>
                  <Input type="number" min="0" max="100" value={contributor.share_percent} onChange={(event) => setContributors((items) => items.map((item, i) => i === index ? { ...item, share_percent: event.target.value } : item))} />
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={contributor.trackIndex} onValueChange={(value) => setContributors((items) => items.map((item, i) => i === index ? { ...item, trackIndex: value } : item))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="release">Release</SelectItem>
                      {tracks.map((track, trackIndex) => <SelectItem key={track.id} value={String(trackIndex)}>Track {trackIndex + 1}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setContributors((items) => items.filter((_, i) => i !== index))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </Card>
            ))}
            {contributorTotal > 100 && <Alert variant="destructive"><AlertCircle className="w-4 h-4" /><AlertDescription>Contributor split total is over 100%.</AlertDescription></Alert>}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Alert><AlertCircle className="w-4 h-4" /><AlertDescription>You must own or control every recording, composition, artwork file, and contributor permission in this release.</AlertDescription></Alert>
            {[
              ["copyright_declared", "I own or control the copyright to this release."],
              ["rights_owned", "I confirm I have all distribution rights for every territory."],
              ["ai_content_declared", "This release contains AI-generated content."],
            ].map(([key, label]) => (
              <div key={key} className="flex items-start gap-2 p-3 border rounded-md">
                <Checkbox id={key} checked={(decl as any)[key]} onCheckedChange={(value) => setDecl({ ...decl, [key]: !!value })} />
                <Label htmlFor={key} className="text-sm leading-relaxed">{label}</Label>
              </div>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-semibold">Review</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded bg-muted">
              <div><span className="text-muted-foreground">Title:</span> {release.title}</div>
              <div><span className="text-muted-foreground">Artist:</span> {release.primary_artist}</div>
              <div><span className="text-muted-foreground">Type:</span> {rules.label}</div>
              <div><span className="text-muted-foreground">Tracks:</span> {tracks.length}</div>
              <div><span className="text-muted-foreground">Release:</span> {release.release_date}</div>
              <div><span className="text-muted-foreground">Artwork:</span> {coverMeta ? `${coverMeta.width}x${coverMeta.height}` : "missing"}</div>
            </div>
            <div className="rounded border divide-y">
              {tracks.map((track, index) => (
                <div key={track.id} className="p-2 flex items-center justify-between gap-3">
                  <span className="font-medium truncate">{index + 1}. {track.title || "Untitled"}</span>
                  <span className="text-muted-foreground">{track.meta?.format.toUpperCase() || "No audio"}</span>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground">Will be delivered to {DSP_PLATFORMS.length} platforms after review.</p>
            {submitting && (
              <div className="space-y-2">
                <Progress value={progress} />
                <div className="grid gap-2">
                  {processingStages.map((stage) => (
                    <div key={stage.label} className="flex items-center justify-between rounded border px-3 py-2">
                      <span>{stage.label}</span>
                      <span className="text-xs uppercase text-muted-foreground">{stage.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={submitting}>
            <Save className="w-4 h-4 mr-2" />Save Draft
          </Button>
          {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>Back</Button>}
          {step < 5 && (
            <Button
              variant="hero"
              onClick={() => {
                if (step === 1 && !validateMetadata(false)) return;
                if (step === 2 && !validateMetadata(true)) return;
                if (step === 3 && contributorTotal > 100) { toast.error("Contributor split total cannot exceed 100%."); return; }
                setStep(step + 1);
              }}
              disabled={submitting}
            >
              <Upload className="w-4 h-4 mr-2" />Next
            </Button>
          )}
          {step === 5 && (
            <Button variant="hero" onClick={submit} disabled={!canSubmit || submitting || contributorTotal > 100}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : <><ImageIcon className="w-4 h-4 mr-2" />Submit Release</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
