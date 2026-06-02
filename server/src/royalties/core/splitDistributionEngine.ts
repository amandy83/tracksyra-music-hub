import { applyBasisPoints, decimalUsdToMicros, microsToDecimalUsd, percentageToBasisPoints } from "./money";
import type { RoyaltyRecord, SplitDistributionResult } from "../models/royaltyTypes";
import type { RoyaltyStore } from "../services/royaltyStore";
import type { PayoutWalletService } from "../../payments/payouts/services/payoutWalletService";

export type SplitDistributionEngineDeps = {
  royaltyStore: RoyaltyStore;
  walletService: PayoutWalletService;
};

export class SplitDistributionEngine {
  constructor(private deps: SplitDistributionEngineDeps) {}

  async calculateSplitDistribution(royaltyRecord: RoyaltyRecord): Promise<SplitDistributionResult> {
    const splits = await this.deps.royaltyStore.getSplits(royaltyRecord.track_id);
    const effectiveSplits = splits.length
      ? splits
      : [{ track_id: royaltyRecord.track_id, user_id: royaltyRecord.artist_id, percentage_share: "100" }];

    const totalBasisPoints = effectiveSplits.reduce(
      (sum, split) => sum + percentageToBasisPoints(split.percentage_share),
      0n,
    );
    if (totalBasisPoints !== 10_000n) {
      throw new Error(`Royalty splits for track ${royaltyRecord.track_id} must total 100%`);
    }

    const totalMicros = decimalUsdToMicros(royaltyRecord.total_revenue);
    const lines = [];
    let allocated = 0n;

    for (let index = 0; index < effectiveSplits.length; index += 1) {
      const split = effectiveSplits[index];
      const basisPoints = percentageToBasisPoints(split.percentage_share);
      const amountMicros = index === effectiveSplits.length - 1
        ? totalMicros - allocated
        : applyBasisPoints(totalMicros, basisPoints);
      allocated += amountMicros;
      const payableAmount = microsToDecimalUsd(amountMicros);

      await this.deps.walletService.creditRevenue({
        userId: split.user_id,
        amount: payableAmount,
        royaltyRecordId: royaltyRecord.id,
        idempotencyKey: `royalty-credit:${royaltyRecord.id}:${split.user_id}`,
        metadata: {
          track_id: royaltyRecord.track_id,
          platform: royaltyRecord.platform,
          percentage_share: split.percentage_share,
        },
      });

      lines.push({
        user_id: split.user_id,
        payable_amount: payableAmount,
        percentage_share: split.percentage_share,
        track_id: royaltyRecord.track_id,
        royalty_record_id: royaltyRecord.id,
      });
    }

    return {
      royalty_record_id: royaltyRecord.id,
      track_id: royaltyRecord.track_id,
      total_revenue: royaltyRecord.total_revenue,
      lines,
    };
  }
}
