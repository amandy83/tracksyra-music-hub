# DSP Migration Deployment Status

Generated: 2026-06-24

Target project: `busmtpthvtugdesnamho`

## Scope

Audited the following migrations:

- `20260624091500_phase81_dsp_marketing_foundation.sql`
- `20260624093000_phase82_pre_save_builder.sql`
- `20260624094000_phase83_campaign_center.sql`
- `20260624095000_phase84_dsp_analytics.sql`
- `20260624100000_phase85_ai_dsp_assistant.sql`
- `20260624102000_dsp_marketing_production_hardening.sql`

## Registry Access

I could not read `supabase_migrations.schema_migrations` directly from this workspace.

Direct PostgreSQL attempts against the live project failed with:

- `password authentication failed for user "postgres"`
- `connect ETIMEDOUT 2406:da12:557:f802:3ce1:6c8d:f7c6:6925:5432`

Because of that, the `schema_migrations` registry status is not directly verifiable here.

## Local Migration Inventory

All six requested migration files exist locally under `supabase/migrations/`.

## Deployment Summary

| Migration | Local File Exists | In `schema_migrations` | Live REST Objects Present | Status |
| --- | --- | --- | --- | --- |
| `20260624091500_phase81_dsp_marketing_foundation.sql` | Yes | Not verifiable | No | Missing |
| `20260624093000_phase82_pre_save_builder.sql` | Yes | Not verifiable | No | Missing |
| `20260624094000_phase83_campaign_center.sql` | Yes | Not verifiable | No | Missing |
| `20260624095000_phase84_dsp_analytics.sql` | Yes | Not verifiable | No | Missing |
| `20260624100000_phase85_ai_dsp_assistant.sql` | Yes | Not verifiable | No | Missing |
| `20260624102000_dsp_marketing_production_hardening.sql` | Yes | Not verifiable | No | Missing |

## Applied Migrations

None of the six DSP migrations can be confirmed as applied in the live project from the available evidence.

## Missing Migrations

All six requested DSP migrations are missing from live REST evidence and could not be confirmed in `supabase_migrations.schema_migrations`:

- `20260624091500_phase81_dsp_marketing_foundation.sql`
- `20260624093000_phase82_pre_save_builder.sql`
- `20260624094000_phase83_campaign_center.sql`
- `20260624095000_phase84_dsp_analytics.sql`
- `20260624100000_phase85_ai_dsp_assistant.sql`
- `20260624102000_dsp_marketing_production_hardening.sql`

## Missing Tables

None of the requested DSP tables are visible in live REST:

- `public.dsp_release_readiness`
- `public.dsp_marketing_tasks`
- `public.dsp_pre_save_campaigns`
- `public.dsp_pre_save_events`
- `public.dsp_campaigns`
- `public.dsp_campaign_metrics`
- `public.dsp_analytics_snapshots`
- `public.dsp_audience_metrics`
- `public.dsp_ai_recommendations`

## Missing Views

No DSP views are defined in the six audited migrations, and no DSP views were confirmed in the live project from the available evidence.

## Missing Functions

The only DSP RPC functions defined by the audited migration set are:

- `public.upsert_dsp_release_readiness(...)`
- `public.upsert_dsp_marketing_task(...)`

Neither could be confirmed as present in the live project from the available evidence.

## First Failed Migration

`20260624091500_phase81_dsp_marketing_foundation.sql`

## Exact Blocking Error

The first migration is blocked by the missing base release relation required by its foreign key:

- `Could not find the table 'public.releases' in the schema cache`

The hardening migration also contains an explicit prerequisite guard for the same dependency:

- `DSP Marketing hardening prerequisite missing: public.releases`

## Conclusion

The DSP migration set is not deployed in the live `busmtpthvtugdesnamho` project from the evidence available here. The first blocked step is Phase 8.1, and the blocking dependency is `public.releases`.
