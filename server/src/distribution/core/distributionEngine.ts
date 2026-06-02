import {
  DISTRIBUTION_PLATFORMS,
  type DistributionJob,
  type DistributionPlatformName,
  type DistributionTrack,
} from "../models/distributionTypes";
import type { DistributionQueue } from "../queue/distributionQueue";
import type { DistributionStore } from "../services/distributionStore";
import type { PlatformAdapterRegistry } from "../adapters/platformAdapterRegistry";
import { DistributionIntelligenceStore, DistributionStatus } from "../intelligence";

export type DistributionLogger = {
  info(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
};

export type DistributionEngineDeps = {
  store: DistributionStore;
  queue: DistributionQueue;
  logger?: DistributionLogger;
  platforms?: readonly DistributionPlatformName[];
  adapterRegistry?: PlatformAdapterRegistry;
  intelligenceStore?: DistributionIntelligenceStore;
};

export class DistributionEngine {
  private readonly platforms: readonly DistributionPlatformName[];
  private readonly logger: DistributionLogger;

  constructor(private deps: DistributionEngineDeps) {
    this.platforms = deps.platforms ?? DISTRIBUTION_PLATFORMS;
    this.logger = deps.logger ?? console;
  }

  async distributeRelease(releaseId: string): Promise<DistributionJob[]> {
    const result = await this.deps.store.getReleaseWithTracks(releaseId);
    if (!result) throw new Error(`Release not found: ${releaseId}`);

    const jobs: DistributionJob[] = [];
    for (const track of result.tracks) {
      jobs.push(...(await this.createJobsForTrack(track)));
    }

    this.logger.info("[distribution] release queued", {
      releaseId,
      trackCount: result.tracks.length,
      jobCount: jobs.length,
    });

    return jobs;
  }

  async distributeTrack(trackId: string): Promise<DistributionJob[]> {
    const result = await this.deps.store.getTrackWithRelease(trackId);
    if (!result) throw new Error(`Track not found: ${trackId}`);

    const jobs = await this.createJobsForTrack(result.track);
    this.logger.info("[distribution] track queued", {
      releaseId: result.release.id,
      trackId,
      jobCount: jobs.length,
    });

    return jobs;
  }

  private async createJobsForTrack(track: DistributionTrack): Promise<DistributionJob[]> {
    const jobs: DistributionJob[] = [];

    for (const platform of this.platforms) {
      if (this.deps.adapterRegistry && !this.deps.adapterRegistry.validateSupported(platform)) {
        this.logger.error("[distribution] unsupported platform skipped", { platform, trackId: track.id });
        continue;
      }

      await this.deps.store.ensurePlatformDelivery({
        releaseId: track.releaseId,
        trackId: track.id,
        userId: track.userId,
        platform,
      });

      const job = await this.deps.store.createDistributionJob({
        releaseId: track.releaseId,
        trackId: track.id,
        platform,
      });

      if (!job) continue;
      await this.deps.intelligenceStore?.appendStateHistory({
        jobId: job.id,
        releaseId: track.releaseId,
        trackId: track.id,
        platform,
        nextStatus: DistributionStatus.PENDING,
        source: "ENGINE",
        metadata: { queuedAt: job.createdAt.toISOString() },
      });
      await this.deps.queue.enqueue(job);
      jobs.push(job);
    }

    return jobs;
  }
}
