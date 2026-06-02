export const queueNames = {
  email: "emailQueue",
  distribution: "distributionQueue",
  royalty: "royaltyQueue",
  fraud: "fraudQueue",
  analytics: "analyticsQueue",
  realtime: "realtimeQueue",
  payout: "payoutQueue",
  mediaProcessing: "media-processing",
  artworkProcessing: "artwork-processing",
  waveformGeneration: "waveform-generation",
  fingerprintAnalysis: "fingerprint-analysis",
  deadLetter: {
    email: "emailDeadLetterQueue",
    distribution: "distributionDeadLetterQueue",
    royalty: "royaltyDeadLetterQueue",
    fraud: "fraudDeadLetterQueue",
    analytics: "analyticsDeadLetterQueue",
    realtime: "realtimeDeadLetterQueue",
    payout: "payoutDeadLetterQueue",
    mediaProcessing: "media-processing.dlq",
    artworkProcessing: "artwork-processing.dlq",
    waveformGeneration: "waveform-generation.dlq",
    fingerprintAnalysis: "fingerprint-analysis.dlq",
  },
} as const;

export type QueueName = typeof queueNames[keyof Omit<typeof queueNames, "deadLetter">];
export type DeadLetterQueueName = typeof queueNames.deadLetter[keyof typeof queueNames.deadLetter];
