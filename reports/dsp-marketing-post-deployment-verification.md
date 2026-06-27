# DSP Marketing Post-Deployment Verification

Generated: 2026-06-24 11:13 UTC

## Scope

Verified against the live Supabase project configured in `.env`:

- REST base: `https://busmtpthvtugdesnamho.supabase.co/rest/v1`
- Live project ref: `busmtpthvtugdesnamho`

## Overall Result

- Overall readiness score: `0/100`
- Final verdict: `NOT READY`

## Module Results

| Module | Result | Notes |
| --- | --- | --- |
| DSP Foundation | FAIL | Live REST returned `PGRST205` for `dsp_release_readiness` and `dsp_marketing_tasks`. |
| Pre-Save Builder | FAIL | Live REST returned `PGRST205` for `dsp_pre_save_campaigns` and `dsp_pre_save_events`. |
| Campaign Center | FAIL | Live REST returned `PGRST205` for `dsp_campaigns` and `dsp_campaign_metrics`. |
| DSP Analytics | FAIL | Live REST returned `PGRST205` for `dsp_analytics_snapshots` and `dsp_audience_metrics`. |
| AI DSP Assistant | FAIL | Live REST returned `PGRST205` for `dsp_ai_recommendations`. |
| REST access | FAIL | The live PostgREST schema cache does not expose any of the requested DSP tables. |
| Authenticated CRUD | FAIL | CRUD could not be exercised because the requested tables are not available through REST. |
| RLS | FAIL | RLS could not be validated without REST exposure for the target tables. |
| Dashboard rendering | FAIL | The local Vite app boots, but interactive browser rendering could not be completed in this environment. |

## Table Existence And Row Counts

All requested DSP tables returned `404 PGRST205` from live REST, so row counts were not available.

| Table | REST Status | Row Count | Table Existence in Live REST Cache |
| --- | --- | --- | --- |
| `public.dsp_release_readiness` | `404` | `N/A` | Not found |
| `public.dsp_marketing_tasks` | `404` | `N/A` | Not found |
| `public.dsp_pre_save_campaigns` | `404` | `N/A` | Not found |
| `public.dsp_pre_save_events` | `404` | `N/A` | Not found |
| `public.dsp_campaigns` | `404` | `N/A` | Not found |
| `public.dsp_campaign_metrics` | `404` | `N/A` | Not found |
| `public.dsp_analytics_snapshots` | `404` | `N/A` | Not found |
| `public.dsp_audience_metrics` | `404` | `N/A` | Not found |
| `public.dsp_ai_recommendations` | `404` | `N/A` | Not found |

## Live REST Evidence

### `public.dsp_release_readiness`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_release_readiness' in the schema cache`
- Row count: `N/A`

### `public.dsp_marketing_tasks`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_marketing_tasks' in the schema cache`
- Row count: `N/A`

### `public.dsp_pre_save_campaigns`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_pre_save_campaigns' in the schema cache`
- Row count: `N/A`

### `public.dsp_pre_save_events`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_pre_save_events' in the schema cache`
- Row count: `N/A`

### `public.dsp_campaigns`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_campaigns' in the schema cache`
- Row count: `N/A`

### `public.dsp_campaign_metrics`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_campaign_metrics' in the schema cache`
- Row count: `N/A`

### `public.dsp_analytics_snapshots`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_analytics_snapshots' in the schema cache`
- Row count: `N/A`

### `public.dsp_audience_metrics`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_audience_metrics' in the schema cache`
- Row count: `N/A`

### `public.dsp_ai_recommendations`

- Status: `404`
- Error code: `PGRST205`
- Message: `Could not find the table 'public.dsp_ai_recommendations' in the schema cache`
- Row count: `N/A`

## Notes

- The live Supabase REST layer does not expose the DSP Marketing tables, so authenticated CRUD and RLS cannot be proven.
- Direct PostgreSQL authentication from this workspace was not usable for catalog verification.
- The local Vite server can start, but a full interactive browser-render check was not completed in this environment.

## Final Verdict

The deployment is not ready for production verification. None of the requested DSP Marketing tables are exposed in the live REST schema cache, so the backend-facing modules cannot be validated end-to-end from live evidence.
