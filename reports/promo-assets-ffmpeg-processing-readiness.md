# Promo Assets FFmpeg Processing Readiness

Date: 2026-06-03

## Overall Result

FAIL

The implementation is present and compile/build verification passed, but the local runtime dependency check failed because `ffmpeg` and `ffprobe` are not installed on PATH in this environment. The worker Docker image now installs the real Alpine `ffmpeg` package. The application is designed to continue running without FFmpeg and processing jobs fail gracefully with a clear error.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| `tsc --noEmit` | PASS | Completed without TypeScript errors. |
| Server processing TypeScript spot-check | PASS | New worker/processing files compiled with strict server-oriented options. |
| `npm run build` | PASS | Vite production build completed. Existing large chunk and stale Browserslist warnings remain. |
| `ffmpeg -version` | FAIL | `ffmpeg` was not recognized on PATH. |
| `ffprobe -version` | FAIL | `ffprobe` was not recognized on PATH. |

## Missing Dependencies

- `ffmpeg`
- `ffprobe`

Production must install FFmpeg and set either:

- `FFMPEG_PATH` and `FFPROBE_PATH` to absolute executable paths, or
- ensure `ffmpeg` and `ffprobe` resolve from the worker process PATH.

`Dockerfile.worker` installs `ffmpeg`, which also provides `ffprobe`, for containerized worker deployments.

## FFmpeg Detection Status

- Environment variables supported: `FFMPEG_PATH`, `FFPROBE_PATH`
- Fallback supported: `ffmpeg`, `ffprobe` from system PATH
- Startup behavior: logs `FFmpeg unavailable. Video processing disabled.` and does not crash the worker runtime
- Job behavior when unavailable: queued jobs are claimed, marked failed, and the asset receives a clear processing error

## Implemented Scope

- Added `promo_asset_jobs` queue table with `queued`, `processing`, `completed`, and `failed` statuses.
- Added `bitrate`, `codec`, `audio_codec`, and `optimized_url` fields to `promo_assets`.
- Added real FFprobe metadata extraction for duration, dimensions, fps, bitrate, video codec, audio codec, and file size.
- Added real FFmpeg thumbnail generation at the 1-second frame with JPEG output capped at 1280x720.
- Added real FFmpeg H.264/AAC MP4 transcoding and storage upload to `optimized_url`.
- Added polling worker at `server/src/workers/promoAssetWorker.ts`.
- Added artist processing progress display and admin processing logs.

## Production Readiness Score

82 / 100

Key remaining production requirements:

- Install FFmpeg/FFprobe on non-container host runtimes.
- Apply the new Supabase migration before processing uploaded assets.
- Run an end-to-end video upload in a production-like environment with service-role storage access.
- Monitor failed job volume after launch to tune timeouts and transcode settings.
