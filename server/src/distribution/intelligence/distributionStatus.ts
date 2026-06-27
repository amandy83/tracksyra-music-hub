export enum DistributionStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  SUBMITTED = "SUBMITTED",
  IN_REVIEW = "IN_REVIEW",
  APPROVED = "APPROVED",
  DELIVERED = "DELIVERED",
  PUBLISHED = "PUBLISHED",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
  DEAD_LETTER = "DEAD_LETTER",
}

const transitions: Record<DistributionStatus, readonly DistributionStatus[]> = {
  [DistributionStatus.PENDING]: [DistributionStatus.PROCESSING, DistributionStatus.FAILED, DistributionStatus.DEAD_LETTER],
  [DistributionStatus.PROCESSING]: [
    DistributionStatus.SUBMITTED,
    DistributionStatus.IN_REVIEW,
    DistributionStatus.APPROVED,
    DistributionStatus.DELIVERED,
    DistributionStatus.FAILED,
    DistributionStatus.REJECTED,
    DistributionStatus.DEAD_LETTER,
  ],
  [DistributionStatus.SUBMITTED]: [
    DistributionStatus.IN_REVIEW,
    DistributionStatus.APPROVED,
    DistributionStatus.DELIVERED,
    DistributionStatus.FAILED,
    DistributionStatus.REJECTED,
    DistributionStatus.DEAD_LETTER,
  ],
  [DistributionStatus.IN_REVIEW]: [
    DistributionStatus.APPROVED,
    DistributionStatus.DELIVERED,
    DistributionStatus.FAILED,
    DistributionStatus.REJECTED,
    DistributionStatus.DEAD_LETTER,
  ],
  [DistributionStatus.APPROVED]: [DistributionStatus.DELIVERED, DistributionStatus.PUBLISHED, DistributionStatus.FAILED, DistributionStatus.DEAD_LETTER],
  [DistributionStatus.DELIVERED]: [DistributionStatus.PUBLISHED],
  [DistributionStatus.PUBLISHED]: [],
  [DistributionStatus.REJECTED]: [DistributionStatus.PROCESSING, DistributionStatus.DEAD_LETTER],
  [DistributionStatus.FAILED]: [DistributionStatus.PROCESSING, DistributionStatus.DEAD_LETTER],
  [DistributionStatus.DEAD_LETTER]: [DistributionStatus.PROCESSING],
};

export function canTransitionDistributionStatus(
  previous: DistributionStatus | null | undefined,
  next: DistributionStatus,
): boolean {
  if (!previous) return next !== DistributionStatus.DEAD_LETTER;
  if (previous === next) return true;
  return transitions[previous]?.includes(next) ?? false;
}

export function assertDistributionStatusTransition(
  previous: DistributionStatus | null | undefined,
  next: DistributionStatus,
): void {
  if (!canTransitionDistributionStatus(previous, next)) {
    throw new Error(`Invalid distribution transition ${previous ?? "null"} -> ${next}`);
  }
}

export function mapProviderStatus(value: string): DistributionStatus {
  const normalized = value.trim().toUpperCase();
  if (normalized in DistributionStatus) return DistributionStatus[normalized as keyof typeof DistributionStatus];
  if (normalized === "LIVE") return DistributionStatus.PUBLISHED;
  if (normalized === "PUBLISHED") return DistributionStatus.PUBLISHED;
  if (normalized === "DELIVERY_FAILED") return DistributionStatus.FAILED;
  return DistributionStatus.PROCESSING;
}
