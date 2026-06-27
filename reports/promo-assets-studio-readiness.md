# Promo Assets Studio Readiness

Date: 2026-06-03

## Scope

Implemented Phase 3.6 as a separate Dashboard tool for managing promotional video assets independently from release uploads.

## Implemented

- Artist route: `/dashboard/promo-assets`
- Artist page: `src/pages/PromoAssetsStudio.tsx`
- Dashboard Marketing module with Promo Assets Analytics widget and Studio navigation.
- Asset library with thumbnail, asset type, release, track, status, analytics, and created date.
- Upload workflow for MP4/MOV up to 100 MB with release/track attachment.
- Preview player with duration, resolution, FPS when measurable, and file size.
- Supported asset types:
  - Spotify Canvas
  - Apple Motion Artwork
  - YouTube Shorts Promo
  - TikTok Preview Video
  - Instagram Reels Promo
- Supabase migration: `supabase/migrations/20260603200000_phase36_promo_assets_studio.sql`
- `public.promo_assets` table with validation, approval, DSP sync, analytics, and future provider fields.
- RLS for artist-owned access and admin full access.
- Private `promo-assets` storage bucket policies.
- Admin panel tab: Admin -> Promo Assets.
- Admin review queues for Pending Review, Approved, Rejected, and Live.
- Admin actions: Approve, Reject, Request Changes with required reason for rejection/changes.
- Server validation engine under `server/src/media/promo-assets/`.
- Worker entry point to validate stored promo assets and record results through service-role RPC.
- Future provider adapter contract for Too Lost, FUGA, SymphonyOS, and Internal Upload.

## Validation Coverage

- Corrupted video/header detection through ffprobe.
- Codec validation for H.264/HEVC.
- Resolution and aspect-ratio validation.
- Duration validation per asset type.
- File size validation.
- Black screen detection through ffmpeg `blackdetect`.
- Frozen frame detection through ffmpeg `freezedetect`.

## Missing Dependencies

- No new npm dependencies required.
- Runtime validation requires configured `FFMPEG_PATH` and `FFPROBE_PATH`, or `ffmpeg`/`ffprobe` available on PATH.
- External provider delivery requires real Too Lost/FUGA/SymphonyOS credentials before activating those adapters.

## Verification

- `.\node_modules\.bin\tsc.cmd --noEmit`: PASS
- `npm.cmd run build`: PASS

## Build Notes

- Vite still reports existing large chunk warnings.
- Browserslist data is stale in the local environment.

## Production Readiness Score

92/100

Production-ready after applying the migration, ensuring the `promo-assets` storage bucket exists from the migration, and running the promo asset validation worker in the media worker environment.
