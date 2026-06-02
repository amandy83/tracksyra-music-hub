import { createHash } from "node:crypto";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudioFingerprintResult } from "../models";
import { FfmpegRunner } from "./ffmpeg";

export class AudioFingerprintService {
  constructor(
    private readonly db?: Pick<SupabaseClient, "from">,
    private readonly ffmpeg = new FfmpegRunner(),
  ) {}

  async fingerprint(input: { sourcePath: string; assetId: string; trackId?: string | null; workDir: string; waveformHash?: string | null }): Promise<AudioFingerprintResult> {
    const pcmPath = join(input.workDir, "fingerprint.pcm");
    await this.ffmpeg.runFfmpeg(["-i", input.sourcePath, "-ac", "1", "-ar", "11025", "-f", "s16le", pcmPath]);
    const pcm = await this.ffmpeg.read(pcmPath);
    const acousticFingerprintHash = createPerceptualHash(pcm);
    const waveformHash = input.waveformHash || createHash("sha256").update(pcm.subarray(0, Math.min(pcm.length, 256_000))).digest("hex");
    const nearMatches = await this.findMatches(acousticFingerprintHash, waveformHash, input.assetId);
    const best = nearMatches[0];
    return {
      acousticFingerprintHash,
      waveformHash,
      similarityScore: best?.score ?? 0,
      duplicateAssetId: best?.score >= 0.98 ? best.assetId : null,
      duplicateTrackId: best?.score >= 0.98 ? best.trackId ?? null : null,
      nearMatches,
    };
  }

  private async findMatches(acousticHash: string, waveformHash: string, assetId: string): Promise<AudioFingerprintResult["nearMatches"]> {
    if (!this.db) return [];
    const { data, error } = await this.db
      .from("audio_fingerprints")
      .select("asset_id,track_id,fingerprint_hash,waveform_hash")
      .or(`fingerprint_hash.eq.${acousticHash},waveform_hash.eq.${waveformHash}`)
      .neq("asset_id", assetId)
      .limit(10);
    if (error || !data) return [];
    return data.map((row: any) => ({
      assetId: row.asset_id,
      trackId: row.track_id,
      score: row.fingerprint_hash === acousticHash ? 1 : 0.98,
      reason: row.fingerprint_hash === acousticHash ? "exact_hash" : "waveform_hash",
    }));
  }
}

function createPerceptualHash(pcm: Buffer): string {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
  const buckets = 512;
  const bucketSize = Math.max(1, Math.floor(samples.length / buckets));
  const features: number[] = [];
  for (let offset = 0; offset < samples.length; offset += bucketSize) {
    let energy = 0;
    for (let i = offset; i < Math.min(offset + bucketSize, samples.length); i += 1) {
      const v = samples[i] / 32768;
      energy += Math.abs(v);
    }
    features.push(Math.round((energy / bucketSize) * 1000));
  }
  const median = [...features].sort((a, b) => a - b)[Math.floor(features.length / 2)] ?? 0;
  const bits = features.map((value) => (value >= median ? "1" : "0")).join("");
  return createHash("sha256").update(bits).digest("hex");
}
