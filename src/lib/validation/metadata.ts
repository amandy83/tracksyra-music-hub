import { z } from "zod";

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const UPC_RE = /^\d{12,13}$/;

export const releaseMetadataSchema = z.object({
  title: z.string().trim().min(1, "Required").max(200),
  primary_artist: z.string().trim().min(1, "Required").max(200),
  featured_artists: z.string().trim().max(300).optional().or(z.literal("")),
  genre: z.string().trim().min(1, "Required"),
  language: z.string().trim().min(1, "Required"),
  release_date: z.string().min(1, "Required"),
  explicit: z.boolean(),
  isrc: z.string().regex(ISRC_RE, "ISRC must look like USABC2400001").optional().or(z.literal("")),
  upc: z.string().regex(UPC_RE, "UPC must be 12–13 digits").optional().or(z.literal("")),
  composer: z.string().trim().min(1, "Required").max(300),
  lyrics: z.string().trim().optional().or(z.literal("")),
  copyright_owner: z.string().trim().min(1, "Required").max(300),
});

export const declarationsSchema = z.object({
  copyright_declared: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
  ai_content_declared: z.boolean(),
  rights_owned: z.literal(true, { errorMap: () => ({ message: "Required" }) }),
});

export type ReleaseMetadata = z.infer<typeof releaseMetadataSchema>;
export type Declarations = z.infer<typeof declarationsSchema>;
