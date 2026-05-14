
## Reality check first

Some of what you asked for **cannot be built without paid partnerships** that TrackSyra would have to sign with each DSP. I'll be upfront so we don't ship fake features:

| Feature | Status |
|---|---|
| Audio/cover/metadata validation | ✅ Fully buildable in browser |
| Duplicate detection (hash, ISRC) | ✅ Buildable |
| Distribution timeline + admin workflow | ✅ Buildable (admin manually advances stages) |
| Per-platform delivery status (Pending → Live) | ✅ UI + DB; **status updated by admin or by you/aggregator**, not auto-fetched |
| **Auto-verify "is it live on Spotify"** | ⚠️ Spotify Search API can find it once public — possible later; needs Spotify dev creds |
| **Apple Music / JioSaavn / Wynk / Gaana / TikTok auto-verify** | ❌ No public API for delivery confirmation. Status must be entered (by admin or by your aggregator's webhook) |
| Virus/malware scanning | ❌ Not in browser — needs ClamAV server or 3rd-party scan API |
| Resume upload support | ⚠️ Real resumable uploads need tus/multipart; I'll use Supabase resumable upload (works for files >6MB) |
| Real Spotify/Apple/YouTube API ingestion | ❌ Requires partner contracts (DSPs don't accept content from any random app) |

Translation: I'll build the **complete validation + tracking + admin + dashboard system**, with the platform-status fields ready to be filled either manually by admin or via webhook from a future aggregator integration.

---

## What I'll build

### 1. Database (migration)

```text
releases               — album/single container (artist, type, release_date, status, copyright)
tracks                 — extends songs (audio_hash, bitrate, sample_rate, duration_sec, channels)
distribution_timeline  — audit trail of stage transitions (uploaded→review→approved→sent→processing→live)
platform_deliveries    — one row per (release, platform) with status + live_url + delivered_at
upload_logs            — every upload attempt with size, duration, status, error
```
Plus: 12-platform enum, audio_hash uniqueness check, ISRC uniqueness check, RLS so artists see only their own, admins see all.

### 2. Frontend validation (`src/lib/validation/`)

- **audio.ts** — decode header to read sample rate, channels, duration; reject if format ∉ {WAV, FLAC, MP3≥320}, duration <30s, sample rate <44.1kHz, file >500MB; compute SHA-256 hash for duplicate check
- **cover.ts** — load image, check ≥3000×3000, JPG/PNG only, RGB (reject CMYK via canvas pixel sampling), basic blur detection (variance of Laplacian via canvas)
- **metadata.ts** — Zod schema covering all 13 fields with explicit-flag, ISRC pattern `^[A-Z]{2}[A-Z0-9]{3}\d{7}$`, UPC 12-digit

### 3. Replacement upload dialog (`UploadReleaseDialog.tsx`)

Multi-step wizard:
1. Files (audio + cover, with live validation feedback)
2. Metadata (all required fields, with error states)
3. Rights & declarations (3 checkboxes: copyright, AI-content, ownership)
4. Review & submit

Uses Supabase resumable uploads for the audio file.

### 4. Artist dashboard additions

- **Release card** with timeline strip (6 stages, current highlighted)
- **Platform grid** (12 platforms × status badge × "Open" link when live_url exists)
- Rejection reason banner when status=rejected, with "Fix & resubmit" button

### 5. Admin review panel (new tab in `/admin`)

- Releases queue with audio preview, cover preview, full metadata
- Per-release: Approve / Reject (with reason) / Request correction
- Per-platform status dropdowns (admin sets Pending → Processing → Delivered → Live, or paste live URL)
- Advances `distribution_timeline` automatically

### 6. Email triggers (reusing existing SMTP system)

Adds 5 new templates to existing `send-emails` function: `upload_success`, `release_approved`, `distribution_started`, `release_live`, `release_rejected`. DB triggers on `releases` status change auto-queue them — same pattern as the existing trigger system.

### 7. API-ready architecture

`platform_deliveries` table is the integration surface. A future edge function (e.g. `aggregator-webhook`) can POST `{release_id, platform, status, live_url}` to update statuses — no schema rewrite needed. Documented in code.

---

## Explicitly NOT included (to be honest)

- Real virus scanning (no in-browser solution)
- Real-time auto-fetch from Spotify/Apple — admin updates manually for now; we can add Spotify Search API as Phase 2 once you have Spotify dev credentials
- Audio fingerprinting beyond hash match (Shazam-style needs AcoustID/Chromaprint server)
- Actual DSP delivery — TrackSyra still needs an aggregator deal (Believe, FUGA, Revelator, etc.) or direct DSP contracts

---

## Tech notes

- All validation client-side first (instant feedback) + server-side re-check via DB constraints (uniqueness)
- Audio metadata extracted with `music-metadata-browser` (lightweight, no native deps)
- Cover blur check uses Laplacian variance — fast, threshold-tuned
- Reuses existing pink/white design tokens, existing `email_logs` queue, existing `useRole` admin guard
- ~6 new files, ~3 edited files, 1 migration

If you say go, I'll ship it in one pass.
