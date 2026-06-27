# DSP Marketing Deployment Mismatch Audit

Generated: 2026-06-24

## Summary

The DSP Marketing frontend is pointed at one Supabase project, while the local Supabase CLI state points at a different project ref. The live REST project currently queried by the frontend does not expose the DSP tables/views in its schema cache.

## Project Refs

- Frontend project ref: `busmtpthvtugdesnamho`
- Migration project ref: `yunasnnycedmexvbogbf`
- Live REST project ref: `busmtpthvtugdesnamho`
- Deployment mismatch found: `YES`

## Evidence Sources

- Runtime `.env`:
  - `SUPABASE_URL=https://busmtpthvtugdesnamho.supabase.co`
  - `VITE_SUPABASE_URL=https://busmtpthvtugdesnamho.supabase.co`
- Supabase CLI link state:
  - `supabase/.temp/project-ref=yunasnnycedmexvbogbf`
  - `supabase/.temp/linked-project.json.ref=yunasnnycedmexvbogbf`
- Stale local config:
  - `supabase/config.toml project_id=konlvaogrijyhrtgueom`

## Verification

### `public.dsp_release_readiness`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_release_readiness' in the schema cache`

### `public.dsp_marketing_tasks`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_marketing_tasks' in the schema cache`

### `public.dsp_pre_save_campaigns`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_pre_save_campaigns' in the schema cache`

### `public.dsp_pre_save_events`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_pre_save_events' in the schema cache`

### `public.dsp_campaigns`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_campaigns' in the schema cache`

### `public.dsp_campaign_metrics`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_campaign_metrics' in the schema cache`

### `public.dsp_analytics_snapshots`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_analytics_snapshots' in the schema cache`

### `public.dsp_audience_metrics`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_audience_metrics' in the schema cache`

### `public.dsp_ai_recommendations`

- Status: `404`
- Error: `PGRST205`
- Message: `Could not find the table 'public.dsp_ai_recommendations' in the schema cache`

## Findings

1. The frontend is using `busmtpthvtugdesnamho`.
2. The CLI-linked migration target is `yunasnnycedmexvbogbf`.
3. The live REST project queried by the frontend is `busmtpthvtugdesnamho`.
4. All DSP tables checked return `PGRST205` from PostgREST.
5. No DSP object was visible through the live REST schema cache.
6. The repo also contains a stale `supabase/config.toml` project id of `konlvaogrijyhrtgueom`, which does not match either runtime or CLI-linked ref.

## Exact Root Cause

The deployment target is split across three different Supabase refs:

- Runtime frontend env points to `busmtpthvtugdesnamho`
- Supabase CLI link state points to `yunasnnycedmexvbogbf`
- `supabase/config.toml` still points to `konlvaogrijyhrtgueom`

The frontend is querying `busmtpthvtugdesnamho`, but the local migration link state is not aligned with that runtime project. As a result, the DSP migrations are not present in the live REST schema cache for the project the frontend is actually using.

## Conclusion

The deployment mismatch is real and blocks DSP Marketing production verification.

