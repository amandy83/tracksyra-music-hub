# Supabase Project Alignment Fix

Generated: 2026-06-24

## Target Project

`busmtpthvtugdesnamho`

## Files Requiring Updates

- `supabase/config.toml`
- `supabase/.temp/project-ref`
- `supabase/.temp/linked-project.json`
- `supabase/.temp/pooler-url`

## Incorrect Project Refs Found

- `supabase/config.toml` contained `konlvaogrijyhrtgueom`
- `supabase/.temp/project-ref` contained `yunasnnycedmexvbogbf`
- `supabase/.temp/linked-project.json` contained `yunasnnycedmexvbogbf`
- `supabase/.temp/pooler-url` contained `postgres.yunasnnycedmexvbogbf`
- `server/.env` does not exist
- `server/.env.local` does not exist
- `.env.local` does not exist

## Correct Project Ref

- `busmtpthvtugdesnamho`

## Reference Audit

### Already Aligned

- `.env` points to `busmtpthvtugdesnamho`
- `VITE_SUPABASE_PROJECT_ID` is `busmtpthvtugdesnamho`
- `SUPABASE_URL` is `https://busmtpthvtugdesnamho.supabase.co`
- `VITE_SUPABASE_URL` is `https://busmtpthvtugdesnamho.supabase.co`
- `DATABASE_URL` points to `db.busmtpthvtugdesnamho.supabase.co`
- `PAYMENT_DATABASE_URL` points to `db.busmtpthvtugdesnamho.supabase.co`
- `render.yaml` has no embedded project ref values, only sync:false runtime variables

### Standardized In This Fix

- `supabase/config.toml` now points to `busmtpthvtugdesnamho`
- `supabase/.temp/project-ref` now points to `busmtpthvtugdesnamho`
- `supabase/.temp/linked-project.json` now points to `busmtpthvtugdesnamho`
- `supabase/.temp/pooler-url` now uses `postgres.busmtpthvtugdesnamho`

## DSP Marketing Migration Deployment Order

1. `supabase/migrations/20260624091500_phase81_dsp_marketing_foundation.sql`
2. `supabase/migrations/20260624093000_phase82_pre_save_builder.sql`
3. `supabase/migrations/20260624094000_phase83_campaign_center.sql`
4. `supabase/migrations/20260624095000_phase84_dsp_analytics.sql`
5. `supabase/migrations/20260624100000_phase85_ai_dsp_assistant.sql`
6. `supabase/migrations/20260624102000_dsp_marketing_production_hardening.sql`

## Migration Verification

Live REST requests against the target Supabase project returned `PGRST205` for every DSP object checked.

### Phase 8.1

- `public.dsp_release_readiness`: not applied in target project
- `public.dsp_marketing_tasks`: not applied in target project

### Phase 8.2

- `public.dsp_pre_save_campaigns`: not applied in target project
- `public.dsp_pre_save_events`: not applied in target project

### Phase 8.3

- `public.dsp_campaigns`: not applied in target project
- `public.dsp_campaign_metrics`: not applied in target project

### Phase 8.4

- `public.dsp_analytics_snapshots`: not applied in target project
- `public.dsp_audience_metrics`: not applied in target project

### Phase 8.5

- `public.dsp_ai_recommendations`: not applied in target project

## Deployment Status

- Migration deployment mismatch found: `YES`
- Target project live REST query ref: `busmtpthvtugdesnamho`
- Local Supabase CLI link state had been pointing at a different project ref before alignment

## Readiness After Alignment

`NOT READY`

Local configuration is now aligned to `busmtpthvtugdesnamho`, but the live target project still does not expose the DSP tables through PostgREST, so the DSP migrations must still be deployed to the target database.

## Exact Root Cause

The frontend runtime was already pointed at `busmtpthvtugdesnamho`, but the local Supabase CLI link state and generated temp metadata were out of sync and had been targeting `yunasnnycedmexvbogbf` or the stale `konlvaogrijyhrtgueom` config. The live target project `busmtpthvtugdesnamho` does not currently expose any of the DSP Marketing tables/views in its PostgREST schema cache, so the DSP migration set is not deployed there yet.

