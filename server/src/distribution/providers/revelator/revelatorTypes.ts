import type { NormalizedDistributionError, Release, Track } from "../../models/distributionTypes";

export type RevelatorConfig = {
  apiKey: string;
  apiUrl: string;
  storeIds: number[];
};

export type RevelatorReleasePayload = {
  name: string;
  artistName: string;
  contributors: unknown[];
  artistExternalIds: unknown[];
  copyrightC: string;
  copyrightP: string;
  hasRecordLabel: false;
  previouslyReleased: false;
  languageId: number;
  primaryMusicStyleId: number;
  releasesLocals: unknown[];
  isCompilation: false;
  image?: {
    fileId?: string;
    filename: string;
    externalUrl?: string;
  };
  tracks: Array<{
    name: string;
    artistName: string;
    languageId: number;
    contributors: unknown[];
    artistExternalIds: unknown[];
    explicit: boolean;
    isrc?: string;
    wav?: {
      fileId?: string;
      filename: string;
      externalUrl?: string;
    };
    flac?: {
      fileId?: string;
      filename: string;
      externalUrl?: string;
    };
  }>;
};

export type RevelatorUploadInput = {
  track: Track;
  release: Release;
};

export type RevelatorError = NormalizedDistributionError & {
  provider: "revelator";
};
