import type { Release, Track } from "../models/distributionTypes";

export interface PlatformAdapter {
  name: string;

  authenticate(): Promise<void>;

  uploadTrack(input: {
    track: Track;
    release: Release;
  }): Promise<{
    platformTrackId: string;
    status: "PUBLISHED" | "FAILED";
    rawResponse: any;
  }>;

  updateMetadata?(input: {
    platformTrackId: string;
    track: Track;
  }): Promise<void>;
}
