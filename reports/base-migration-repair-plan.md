# Base Migration Repair Plan

## Root Cause
The migration `supabase/migrations/20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql` is the first schema step that creates the core music-release model:

- `public.releases`
- `public.tracks`
- `public.distribution_timeline`
- `public.platform_deliveries`
- `public.upload_logs`

It is structurally valid SQL, but it is not deployment-safe on a partially provisioned target because it uses raw `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `CREATE POLICY`, and `CREATE TRIGGER` statements with no existence guards. It also assumes foundational objects from earlier migrations are already present:

- `public.set_updated_at()` from `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`
- `public.has_role(uuid, public.app_role)` from `20260508014538_f2f8837a-8e88-4823-9580-b77c0a0ebc83.sql`
- `public.queue_email(...)` from `20260513062259_a820b9ab-c70c-4f6e-b4b0-42dcb172819f.sql`
- `pgcrypto` for `gen_random_uuid()` from earlier foundation setup or later extension repairs

The live target project currently exposes none of the required core tables in the REST schema cache, which means the release model never became available to downstream migrations.

## Broken SQL
The risky parts are not a single syntax error; they are unguarded DDL statements that can stop deployment on rerun or on a partially applied database.

### High-risk statements
- `CREATE TYPE public.release_status ...`
- `CREATE TYPE public.delivery_status ...`
- `CREATE TYPE public.dsp_platform ...`
- `CREATE TABLE public.releases ...`
- `CREATE TABLE public.tracks ...`
- `CREATE TABLE public.distribution_timeline ...`
- `CREATE TABLE public.platform_deliveries ...`
- `CREATE TABLE public.upload_logs ...`
- `CREATE INDEX ...`
- `CREATE POLICY ...`
- `CREATE TRIGGER ...`
- `ALTER PUBLICATION supabase_realtime ADD TABLE ...`

### Compatibility-sensitive references
- `DEFAULT gen_random_uuid()`
- `CREATE POLICY ... USING (has_role(...))`
- `CREATE TRIGGER ... EXECUTE FUNCTION public.set_updated_at()`
- `handle_release_status_change()` calling `public.queue_email(...)`

## Required SQL Fix
Repair only this migration. Do not rewrite later migrations.

### Minimal safe repair strategy
1. Add prerequisite checks at the top of the migration:
   - `public.set_updated_at()`
   - `public.has_role(uuid, public.app_role)`
   - `public.queue_email(text, text, text, text, jsonb, text, uuid)`
   - `pgcrypto` / `gen_random_uuid()`
2. Make type creation idempotent:
   - wrap `CREATE TYPE` statements in `DO $$ ... $$` blocks that skip existing types
3. Make table creation idempotent where safe:
   - change `CREATE TABLE` to `CREATE TABLE IF NOT EXISTS`
4. Make index and trigger creation idempotent:
   - `CREATE INDEX IF NOT EXISTS`
   - `DROP TRIGGER IF EXISTS ...` before `CREATE TRIGGER`
5. Make policy creation idempotent:
   - `DROP POLICY IF EXISTS ...` before each `CREATE POLICY`
6. Guard publication registration:
   - only run `ALTER PUBLICATION supabase_realtime ADD TABLE ...` if the table is not already a member
7. Keep column names, constraints, and trigger behavior unchanged so later migrations continue to match the base schema.

### Notes on compatibility
- Do not rename columns.
- Do not change the enum values.
- Do not change foreign key targets.
- Do not alter policy semantics.
- Do not move release lifecycle logic into later migrations.

## Dependency Tree

### Foundational prerequisites
- `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`
  - creates `public.profiles`
  - creates `public.set_updated_at()`
  - creates `public.songs`
- `20260508014538_f2f8837a-8e88-4823-9580-b77c0a0ebc83.sql`
  - creates `public.app_role`
  - creates `public.user_roles`
  - creates `public.has_role(...)`
- `20260513062259_a820b9ab-c70c-4f6e-b4b0-42dcb172819f.sql`
  - creates `public.queue_email(...)`
- `pgcrypto`
  - required for `gen_random_uuid()`

### First blocking migration
- `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`
  - creates `public.releases`
  - creates `public.tracks`
  - creates `public.distribution_timeline`
  - creates `public.platform_deliveries`
  - creates `public.upload_logs`

### Immediate downstream migrations that depend on `releases` and/or `tracks`
- `20260527090000_distribution_engine_phase1.sql`
- `20260527100000_distribution_intelligence_phase4.sql`
- `20260527103000_royalty_monetization_phase5.sql`
- `20260527110000_streaming_data_intelligence_phase6.sql`
- `20260527113000_fraud_detection_phase7.sql`
- `20260527120000_realtime_dashboard_phase8.sql`
- `20260527123000_unified_music_release_model.sql`
- `20260528100000_media_processing_phase10.sql`
- `20260602120000_distribution_production_hardening.sql`
- `20260603120000_fraud_protection_infrastructure.sql`
- `20260603143000_phase2_release_management.sql`
- `20260603180000_phase3_media_validation_system.sql`
- `20260603190000_phase4_admin_review_queue.sql`
- `20260603200000_phase36_promo_assets_studio.sql`
- `20260603230000_phase36_promo_assets_studio_consolidated_production.sql`
- `20260604100000_phase6_playlist_pitching_system.sql`
- `20260604110000_phase61_curator_marketplace.sql`
- `20260604120000_phase62_playlist_performance_analytics.sql`
- `20260605100000_role_hierarchy_four_tier.sql`
- `20260623120000_phase5_too_lost_distribution.sql`
- `20260623130000_too_lost_preapproval_infrastructure.sql`
- `20260623150000_phase7_royalty_payout_production.sql`
- `20260623170000_free_playlist_pitching_system.sql`
- `20260623180000_real_curator_delivery_system.sql`
- `20260623190000_phase63_curator_recruitment_verification.sql`
- `20260624091500_phase81_dsp_marketing_foundation.sql`
- `20260624093000_phase82_pre_save_builder.sql`
- `20260624102000_dsp_marketing_production_hardening.sql`
- `20260626090000_phase9_toolost_production.sql`

### Dependency tree summary
```text
20260506074939_... (profiles, set_updated_at)
  -> 20260508014538_... (app_role, user_roles, has_role)
    -> 20260513062259_... (queue_email)
      -> 20260514092104_... (releases, tracks, timeline, deliveries, upload_logs)
        -> all later release/track-dependent migrations listed above
```

## Estimated Repair Complexity
- Low to moderate
- The schema shape does not need to change.
- The repair is mostly migration-hardening:
  - guard existing objects
  - preserve foreign keys and trigger semantics
  - make publication/index/policy creation safe on rerun

## Will Downstream Migrations Work Automatically?
- Mostly yes, if the prerequisite foundation migrations already exist in the target project.
- After this base migration is repair-safe and applied, later migrations that require `public.releases` and `public.tracks` should proceed normally.
- Downstream migrations that also require additional objects, such as later role, media, or DSP tables, will still depend on their own migrations being present.

## Safe Plan
1. Patch only `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`.
2. Add existence guards for required prerequisite functions and extension.
3. Make the DDL idempotent without changing schema meaning.
4. Re-run migration validation in a dry-run environment before touching the target project.
5. Do not modify any later migrations until the base migration is confirmed clean.
