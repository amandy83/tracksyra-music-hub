# DSP Marketing Root Cause Audit

## Why The Audit Showed FAIL For Phases 8.1 to 8.3

The earlier production audit did not fail because tables, routes, or migrations were missing. It failed because the module checks were evaluating production behavior, and the Phase 8.1 to 8.3 database objects were created without authenticated access hardening.

The frontend uses real Supabase queries and real insert/update/delete paths, but the matching migrations for those three phases do not enable RLS or grant authenticated privileges. That makes read/write/persistence checks fail in production, even though the schema and routes exist.

## Phase 8.1

### Exact Failure Reason

The DSP Foundation dashboard reads real data from `dsp_release_readiness` and `dsp_marketing_tasks`, but `supabase/migrations/20260624091500_phase81_dsp_marketing_foundation.sql` only creates the tables. It does not enable RLS or grant authenticated access, and there is no client-side write path for these tables. In production, authenticated access is therefore incomplete and persistence depends on an external writer that is not part of the audited app surface.

### Verification

- Database reads: PASS for code path, FAIL for production access hardening
- Database writes: FAIL, no app write path for readiness/tasks
- RLS access: FAIL, no RLS or grants
- Dashboard rendering: PASS
- Data persistence: FAIL
- Real queries vs mock/static data: Real queries, no mock/static fallback

## Phase 8.2

### Exact Failure Reason

The Pre-Save Builder uses real CRUD against `dsp_pre_save_campaigns` and `dsp_pre_save_events` through `src/pages/preSaveCampaignData.ts`, including `loadPreSaveWorkspace`, `createPreSaveCampaign`, and `trackPreSaveEvent`. The UI renders from those live queries in `PreSaveCampaignHub`, `PreSaveCampaignCreate`, `PreSaveCampaignList`, and `PreSaveSmartLink`, but `supabase/migrations/20260624093000_phase82_pre_save_builder.sql` does not enable RLS or grant authenticated permissions. In production, reads and writes are blocked for the authenticated client.

### Verification

- Database reads: PASS for code path, FAIL for production access hardening
- Database writes: PASS for code path, FAIL for production access hardening
- RLS access: FAIL, no RLS or grants
- Dashboard rendering: PASS
- Data persistence: FAIL
- Real queries vs mock/static data: Real queries, no mock/static fallback

## Phase 8.3

### Exact Failure Reason

The Campaign Center uses real reads and writes against `dsp_campaigns` and `dsp_campaign_metrics` through `src/pages/campaignCenterData.ts`, including `loadCampaignCenterWorkspace`, `createCampaign`, `updateCampaign`, and `updateCampaignStatus`. The hub, creation page, detail page, and list page all render from those live queries. However, `supabase/migrations/20260624094000_phase83_campaign_center.sql` creates only the tables and constraints; it does not enable RLS or grant authenticated permissions. Production reads/writes therefore fail for the authenticated client.

### Verification

- Database reads: PASS for code path, FAIL for production access hardening
- Database writes: PASS for code path, FAIL for production access hardening
- RLS access: FAIL, no RLS or grants
- Dashboard rendering: PASS
- Data persistence: FAIL
- Real queries vs mock/static data: Real queries, no mock/static fallback

## Affected Files

- [src/pages/DspMarketingHub.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/DspMarketingHub.tsx)
- [src/pages/preSaveCampaignData.ts](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/preSaveCampaignData.ts)
- [src/pages/PreSaveCampaignHub.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/PreSaveCampaignHub.tsx)
- [src/pages/PreSaveCampaignCreate.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/PreSaveCampaignCreate.tsx)
- [src/pages/PreSaveCampaignList.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/PreSaveCampaignList.tsx)
- [src/pages/PreSaveSmartLink.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/PreSaveSmartLink.tsx)
- [src/pages/campaignCenterData.ts](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/campaignCenterData.ts)
- [src/pages/CampaignCenterHub.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/CampaignCenterHub.tsx)
- [src/pages/CampaignCenterCreate.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/CampaignCenterCreate.tsx)
- [src/pages/CampaignCenterDetail.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/CampaignCenterDetail.tsx)
- [src/pages/CampaignCenterList.tsx](/E:/Track%20Syra%20Nw/tracksyra-music-hub/src/pages/CampaignCenterList.tsx)
- [supabase/migrations/20260624091500_phase81_dsp_marketing_foundation.sql](/E:/Track%20Syra%20Nw/tracksyra-music-hub/supabase/migrations/20260624091500_phase81_dsp_marketing_foundation.sql)
- [supabase/migrations/20260624093000_phase82_pre_save_builder.sql](/E:/Track%20Syra%20Nw/tracksyra-music-hub/supabase/migrations/20260624093000_phase82_pre_save_builder.sql)
- [supabase/migrations/20260624094000_phase83_campaign_center.sql](/E:/Track%20Syra%20Nw/tracksyra-music-hub/supabase/migrations/20260624094000_phase83_campaign_center.sql)

## Required Fixes

- Phase 8.1: add authenticated access controls for foundation tables and define the production writer path for readiness/task rows.
- Phase 8.2: add RLS policies and authenticated grants for pre-save campaigns and events.
- Phase 8.3: add RLS policies and authenticated grants for campaign center tables.

## Estimated Fix Complexity

- Phase 8.1: Medium
- Phase 8.2: Low
- Phase 8.3: Low
