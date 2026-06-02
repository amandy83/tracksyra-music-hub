import type { FraudDetectionEngine, FraudScore } from "../../fraud";
import type { NormalizedStreamEvent } from "../../ingestion/streams";
import type {
  DistributionEventPublisher,
  FraudEventPublisher,
  StreamEventPublisher,
} from "../publishers";

export type DomainEventSubscriberDeps = {
  streamPublisher: StreamEventPublisher;
  fraudPublisher: FraudEventPublisher;
  distributionPublisher: DistributionEventPublisher;
  fraudDetectionEngine?: Pick<FraudDetectionEngine, "analyzeStreamEvent">;
  resolveArtistIdForTrack?: (trackId: string) => Promise<string | null>;
};

export class DomainEventSubscriber {
  constructor(private deps: DomainEventSubscriberDeps) {}

  async onStreamAccepted(event: NormalizedStreamEvent): Promise<void> {
    const artistId = await this.deps.resolveArtistIdForTrack?.(event.track_id);
    await this.deps.streamPublisher.publishStreamReceived(event, artistId ?? null);
  }

  async onFraudScored(event: NormalizedStreamEvent, score: FraudScore): Promise<void> {
    if (score.decision !== "CLEAN") {
      await this.deps.fraudPublisher.publishFraudFlagged(event, score);
    }
  }

  async onDistributionStatusChanged(input: Parameters<DistributionEventPublisher["publishDistributionStatusChanged"]>[0]) {
    await this.deps.distributionPublisher.publishDistributionStatusChanged(input);
  }
}
