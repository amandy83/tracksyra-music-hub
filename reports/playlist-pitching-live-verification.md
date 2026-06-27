# Playlist Pitching Live Verification

Run ID: 20260623124130169gd5f
Started: 2026-06-23T12:41:30.212Z
Completed: 2026-06-23T12:41:32.452Z

## Final Status

- LIVE DATABASE: FAIL
- CURATOR ROUTING: FAIL
- ARTIST DASHBOARD: FAIL
- ADMIN DASHBOARD: FAIL
- ANALYTICS: FAIL
- RLS: FAIL

Final Production Score: 0/6

## Evidence IDs

```json
{}
```

## Step Evidence

- tables: FAIL - {"playlist_pitches":false,"playlist_pitches_error":"Could not find the table 'public.playlist_pitches' in the schema cache","curator_deliveries":false,"curator_deliveries_error":"Could not find the table 'public.curator_deliveries' in the schema cache","curator_responses":false,"curator_responses_error":"Could not find the table 'public.curator_responses' in the schema cache","curator_playlist_additions":false,"curator_playlist_additions_error":"Could not find the table 'public.curator_playlist_additions' in the schema cache","curator_verification_requests":false,"curator_verification_requests_error":"Could not find the table 'public.curator_verification_requests' in the schema cache","curator_quality_scores":false,"curator_quality_scores_error":"Could not find the table 'public.curator_quality_scores' in the schema cache"}
- realPitch: FAIL - skipped because required playlist pitching tables are missing from the live Supabase schema cache
- playlistPitchesRow: FAIL - playlist_pitches table is not available
- curatorSetup: FAIL - skipped because required curator tables are missing
- deliveryRpc: FAIL - skipped because required tables are missing
- curatorDeliveries: FAIL - curator_deliveries table is not available
- curatorRouting: FAIL - cannot verify routing because curator marketplace/delivery tables are not available
- curatorResponses: FAIL - curator_responses table is not available
- playlistAdditionEvidence: FAIL - curator_playlist_additions table is not available
- artistDashboard: FAIL - cannot verify dashboard because playlist pitch tables/views are unavailable
- adminDashboard: FAIL - cannot verify admin dashboard because playlist pitch tables/views are unavailable
- analytics: FAIL - cannot verify analytics because playlist pitch tables/views are unavailable
- rls: FAIL - cannot verify RLS because role and playlist pitching tables are unavailable

## Error

Required Phase 6 playlist pitching tables are missing from the live Supabase schema cache.
