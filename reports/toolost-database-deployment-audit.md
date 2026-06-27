# Too Lost Database Deployment Audit

## Target Project
- Supabase project ref: `busmtpthvtugdesnamho`
- Source env: `VITE_SUPABASE_PROJECT_ID=busmtpthvtugdesnamho`
- Supabase URL: `https://busmtpthvtugdesnamho.supabase.co`

## Live Verification Summary
- Direct PostgreSQL connection: FAIL
- Supabase REST schema cache: FAIL for all required objects
- Migration history: NOT VERIFIABLE from current live access

## Object Audit

| Object | Exists / Missing | Migration that should create it | Applied | First blocking migration if missing |
| --- | --- | --- | --- | --- |
| `distribution_providers` | Missing | `supabase/migrations/20260623120000_phase5_too_lost_distribution.sql` | Not applied / not visible in live schema cache | `20260623120000_phase5_too_lost_distribution.sql` |
| `distribution_provider_credentials` | Missing | `supabase/migrations/20260623130000_too_lost_preapproval_infrastructure.sql` | Not applied / not visible in live schema cache | `20260623130000_too_lost_preapproval_infrastructure.sql` |
| `distribution_provider_oauth_states` | Missing | `supabase/migrations/20260623130000_too_lost_preapproval_infrastructure.sql` | Not applied / not visible in live schema cache | `20260623130000_too_lost_preapproval_infrastructure.sql` |
| `releases` | Missing | `supabase/migrations/20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` | Not applied / not visible in live schema cache | `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` |
| `tracks` | Missing | `supabase/migrations/20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` | Not applied / not visible in live schema cache | `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` |

## Live Responses
### Supabase REST schema cache
- `distribution_providers`: `PGRST205` - Could not find the table `public.distribution_providers` in the schema cache
- `distribution_provider_credentials`: `PGRST205` - Could not find the table `public.distribution_provider_credentials` in the schema cache
- `distribution_provider_oauth_states`: `PGRST205` - Could not find the table `public.distribution_provider_oauth_states` in the schema cache
- `releases`: `PGRST205` - Could not find the table `public.releases` in the schema cache
- `tracks`: `PGRST205` - Could not find the table `public.tracks` in the schema cache

### Direct PostgreSQL connection
- `password authentication failed for user "postgres"`

## Migration History
- The repository contains the expected create migrations:
  - `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` creates `releases` and `tracks`
  - `20260623120000_phase5_too_lost_distribution.sql` creates `distribution_providers`
  - `20260623130000_too_lost_preapproval_infrastructure.sql` creates `distribution_provider_credentials` and `distribution_provider_oauth_states`
- Live applied status could not be confirmed because:
  - direct PostgreSQL authentication failed
  - the REST schema cache does not expose the required objects

## First Blocking Migration
- `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`

## Exact Root Cause
- The target Supabase project `busmtpthvtugdesnamho` does not expose the base release schema or the Too Lost credential tables in the live PostgREST schema cache, and the direct PostgreSQL connection with the available `DATABASE_URL` fails authentication.
- Because `public.releases` and `public.tracks` are missing, the downstream Too Lost migrations cannot land cleanly in the live project.
