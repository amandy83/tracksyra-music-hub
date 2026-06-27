import type { Release, Track } from "../models/distributionTypes";

export type ReleaseSubmissionInput = {
  release: Release;
  tracks: Track[];
};

export type ReleaseSubmissionResult = {
  provider: string;
  externalReleaseId: string;
  status: "SANDBOX_ACCEPTED" | "SUBMITTED" | "FAILED";
  request: unknown;
  response: unknown;
};

export interface ReleaseSubmissionAdapter {
  readonly provider: string;
  submitRelease(input: ReleaseSubmissionInput): Promise<ReleaseSubmissionResult>;
}
