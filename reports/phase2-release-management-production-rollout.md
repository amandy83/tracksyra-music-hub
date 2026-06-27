# Phase 2 Release Management Production Rollout

Generated: 2026-06-03

## Failure Root Cause

Production failed with `ERROR: relation "public.releases" does not exist` because `20260603143000_phase2_release_management.sql` is an extension migration. It does not create the base release model.

`public.releases` and `public.tracks` are first created by:

- `supabase/migrations/20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`

## Dependency Tree

Phase 2 Release Management

- Requires `public.profiles`, `public.songs`, `public.set_updated_at()`
  - Created by `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`
  - Repair-safe alternatives also appear in `20260528110000_email_queue_runtime_repair.sql` and `20260531120000_auth_contact_admin_repair.sql`
- Requires `public.app_role`, `public.user_roles`, `public.has_role(uuid, app_role)`
  - Created by `20260508014538_f2f8837a-8e88-4823-9580-b77c0a0ebc83.sql`
  - Repair-safe overloads appear in `20260528110000_email_queue_runtime_repair.sql`
- Requires `public.release_status`, `public.delivery_status`, `public.dsp_platform`
  - Created by `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`
- Requires `public.releases`
  - Created by `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`
- Requires `public.tracks`
  - Created by `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`
- Requires `public.upload_logs`
  - Created by `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`
- Requires `artist_id` compatibility columns used by `music_releases`
  - Originally added by `20260527123000_unified_music_release_model.sql`
  - Also repaired idempotently in the patched Phase 2 migration
- Runtime upload path additionally requires `public.media_assets` and `public.media_processing_jobs`
  - Created by `20260528100000_media_processing_phase10.sql`

No migration creates `public.release_drafts`. Drafts are modeled as `public.releases.status = 'draft'`.

## Prerequisite Migration List

Minimum DB prerequisites before patched Phase 2:

1. `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`
2. `20260508014538_f2f8837a-8e88-4823-9580-b77c0a0ebc83.sql` or the repair-safe role/function subset from `20260528110000_email_queue_runtime_repair.sql`
3. `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`

Recommended runtime prerequisites for the current app upload flow:

4. `20260527123000_unified_music_release_model.sql` is now optional for Phase 2 because Phase 2 repairs its required `artist_id` objects.
5. `20260528100000_media_processing_phase10.sql`
6. Artist approval RPC/table migrations, especially `20260527130000_artist_onboarding_approval.sql` and `20260527133000_artist_onboarding_production_hardening.sql`, if upload gating uses `is_approved_artist()`.

## Missing Production Objects

Known missing object from failure:

- `public.releases`: MISSING

Objects to audit before retry:

```sql
SELECT
  to_regclass('public.profiles') AS profiles,
  to_regclass('public.songs') AS songs,
  to_regclass('public.user_roles') AS user_roles,
  to_regclass('public.releases') AS releases,
  to_regclass('public.tracks') AS tracks,
  to_regclass('public.upload_logs') AS upload_logs,
  to_regclass('public.release_contributors') AS release_contributors,
  to_regclass('public.release_drafts') AS release_drafts,
  to_regclass('public.media_assets') AS media_assets,
  to_regclass('public.media_processing_jobs') AS media_processing_jobs;
```

```sql
SELECT
  to_regtype('public.app_role') AS app_role,
  to_regtype('public.release_status') AS release_status,
  to_regtype('public.delivery_status') AS delivery_status,
  to_regtype('public.dsp_platform') AS dsp_platform;
```

```sql
SELECT
  to_regprocedure('public.set_updated_at()') AS set_updated_at,
  to_regprocedure('public.has_role(uuid,public.app_role)') AS has_role_user_role,
  to_regprocedure('public.has_role(public.app_role,uuid)') AS has_role_role_user,
  to_regprocedure('public.is_approved_artist()') AS is_approved_artist,
  to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') AS queue_email;
```

## Migration Conflicts

- `20260514092104_...` is not idempotent. It uses raw `CREATE TYPE`, `CREATE TABLE`, `CREATE POLICY`, and `CREATE TRIGGER`, so do not run it blindly if production has partial objects.
- `20260527123000_unified_music_release_model.sql` assumes `public.releases` and `public.tracks` already exist.
- `20260528100000_media_processing_phase10.sql` creates enum types without duplicate guards. It can conflict if partially applied.
- The original Phase 2 migration had a nullable unique constraint on `(release_id, track_id, name, role)`, which does not dedupe release-level contributors because `track_id` can be `NULL`.
- The original Phase 2 trigger only validated release track count on update and allowed direct inserted submitted releases to bypass draft lifecycle.
- Existing base `tracks` owner policies allowed track mutation after submission; patched Phase 2 replaces owner policies and adds table triggers to block post-submission mutation.

## Schema Drift Report

Expected Phase 2 tables:

- `public.releases`: must exist before Phase 2; Phase 2 adds `metadata`, `submitted_at`, `artist_id`, `release_type` check, draft default, lifecycle triggers.
- `public.tracks`: must exist before Phase 2; Phase 2 adds `metadata`, `artist_id`, file-size check, owner RLS repair, post-submission mutation trigger.
- `public.release_contributors`: created by Phase 2; partial unique indexes replace nullable unique constraint.
- `public.release_drafts`: not used and not expected. Draft state is `public.releases.status = 'draft'`.

Expected storage:

- `audio`: private, 500 MB max, audio MIME allowlist, owner-scoped upload path.
- `covers`: public read, 10 MB max, image MIME allowlist, owner-scoped upload path.

## SQL Editor Execution Order

1. Run the object audit queries above.
2. If `profiles`, `songs`, or `set_updated_at()` are missing, apply or repair the foundational schema from `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`. Do not re-run it blindly if any of its tables already exist.
3. If `app_role`, `user_roles`, or `has_role(uuid, public.app_role)` are missing, apply the repair-safe role/function subset from `20260528110000_email_queue_runtime_repair.sql` or manually create only those objects.
4. If `public.releases` or `public.tracks` are missing, apply or repair `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`. This is the migration that originally creates both tables.
5. If app uploads should work immediately, ensure `media_assets` and `media_processing_jobs` exist by applying/repairing `20260528100000_media_processing_phase10.sql`.
6. Apply patched `20260603143000_phase2_release_management.sql`.
7. Run `NOTIFY pgrst, 'reload schema';`.
8. Regenerate Supabase types and deploy the frontend/backend build.

## Output 1: Production-Safe SQL Patch

Use the patched file:

- `supabase/migrations/20260603143000_phase2_release_management.sql`

Key patch properties:

- Preflight prerequisite checks for `releases`, `tracks`, `profiles`, `songs`, and `upload_logs`.
- Idempotent column, index, policy, trigger, and function repair where possible.
- `DROP TRIGGER IF EXISTS trg_release_contributors_updated ON public.release_contributors`.
- Partial unique indexes:
  - `uq_release_contributors_release_scope`
  - `uq_release_contributors_track_scope`
- Direct submitted release inserts are rejected.
- Release track-count validation runs on release insert/update.
- Contributor and track mutations are blocked unless release status is `draft` or `rejected`.
- Owner track RLS policies are repaired to match draft/rejected workflow.

## Output 2: Prerequisite Migration List

Required before Phase 2:

1. `20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql`
2. `20260508014538_f2f8837a-8e88-4823-9580-b77c0a0ebc83.sql` or equivalent repair-safe role/function subset
3. `20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql`

Recommended for full app upload path:

4. `20260528100000_media_processing_phase10.sql`
5. `20260527130000_artist_onboarding_approval.sql`
6. `20260527133000_artist_onboarding_production_hardening.sql`

## Output 3: Exact Supabase SQL Editor Execution Order

1. Audit objects.
2. Repair foundational profile/song/helper objects if missing.
3. Repair role/has_role objects if missing.
4. Repair base release model (`releases`, `tracks`, enums, upload logs).
5. Repair media processing objects if the app upload path will be used.
6. Run patched Phase 2.
7. Reload PostgREST schema cache.
8. Regenerate types and deploy.

## Output 4: Production Readiness Score

72/100 before production object audit and base release repair.

88/100 after:

- `public.releases` exists
- `public.tracks` exists
- patched Phase 2 applies cleanly
- media processing tables exist
- Supabase types are regenerated
- one staging upload test passes

## Output 5: PASS/FAIL Checklist

| Check | Status | Notes |
| --- | --- | --- |
| Release upload | FAIL until base release and media tables exist | The failed production DB lacks `public.releases`. |
| Single/EP/Album validation | PASS after patched Phase 2 | DB rejects direct submitted inserts and validates track count on submission. |
| Contributor management | PASS after patched Phase 2 | Contributor table, partial unique indexes, RLS, and mutation trigger are present. |
| RLS security | PASS after patched Phase 2 | Contributor and owner track policies are scoped to editable releases; triggers enforce regardless of broad admin policies. |
| Draft workflow | PASS after patched Phase 2 | Release default is `draft`; submit path must promote after tracks exist. |
| Production deployment | FAIL until prerequisite audit/repair is completed | Apply prerequisites first; then run patched Phase 2. |
