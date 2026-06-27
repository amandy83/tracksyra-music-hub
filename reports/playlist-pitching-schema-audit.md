# Playlist Pitching Schema Audit

Generated: 2026-06-23T12:57:38.691Z
Live Supabase project: `busmtpthvtugdesnamho`

This audit used the live Supabase REST/RPC API with the local service-role configuration. No mock data was used.

## 1. Existing Tables

| Requested object | Live status | Detail |
| --- | --- | --- |
| none |

## 2. Missing Tables

| Requested object | Live status | Detail |
| --- | --- | --- |
| `playlist_pitches` | Missing | PGRST205: Could not find the table 'public.playlist_pitches' in the schema cache |
| `playlist_pitch_notes` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_notes' in the schema cache |
| `curator_profiles` | Missing | PGRST205: Could not find the table 'public.curator_profiles' in the schema cache |
| `curator_marketplace` | Missing | PGRST205: Could not find the table 'public.curator_marketplace' in the schema cache |
| `curator_assignments` | Missing | PGRST205: Could not find the table 'public.curator_assignments' in the schema cache |
| `curator_quality_scores` | Missing | PGRST205: Could not find the table 'public.curator_quality_scores' in the schema cache |
| `playlist_analytics` | Missing | PGRST205: Could not find the table 'public.playlist_analytics' in the schema cache |
| `playlist_reach_metrics` | Missing | PGRST205: Could not find the table 'public.playlist_reach_metrics' in the schema cache |

## Repo-Equivalent Objects

Several requested names do not match the repo's Phase 6 schema names. These live probes show whether the repo-equivalent objects are present.

| Requested name | Repo-equivalent object | Live status | Detail |
| --- | --- | --- | --- |
| `curator_profiles` | `playlist_curator_marketplace` | Missing | PGRST205: Could not find the table 'public.playlist_curator_marketplace' in the schema cache |
| `curator_profiles` | `curator_playlists` | Missing | PGRST205: Could not find the table 'public.curator_playlists' in the schema cache |
| `curator_marketplace` | `playlist_curator_marketplace` | Missing | PGRST205: Could not find the table 'public.playlist_curator_marketplace' in the schema cache |
| `curator_assignments` | `playlist_pitch_assignments` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_assignments' in the schema cache |
| `curator_assignments` | `curator_deliveries` | Missing | PGRST205: Could not find the table 'public.curator_deliveries' in the schema cache |
| `playlist_analytics` | `playlist_pitch_analytics` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_analytics' in the schema cache |
| `playlist_analytics` | `playlist_pitch_delivery_tracking` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_delivery_tracking' in the schema cache |
| `playlist_analytics` | `free_playlist_pitch_admin_analytics` | Missing | PGRST205: Could not find the table 'public.free_playlist_pitch_admin_analytics' in the schema cache |
| `playlist_reach_metrics` | `playlist_pitch_delivery_tracking` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_delivery_tracking' in the schema cache |
| `playlist_reach_metrics` | `free_playlist_pitch_admin_analytics` | Missing | PGRST205: Could not find the table 'public.free_playlist_pitch_admin_analytics' in the schema cache |

## 3. Missing Views

| View | Live status | Detail |
| --- | --- | --- |
| `playlist_pitch_admin_queue` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_admin_queue' in the schema cache |
| `playlist_pitch_artist_dashboard` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_artist_dashboard' in the schema cache |
| `playlist_pitch_delivery_tracking` | Missing | PGRST205: Could not find the table 'public.playlist_pitch_delivery_tracking' in the schema cache |
| `free_playlist_pitch_admin_analytics` | Missing | PGRST205: Could not find the table 'public.free_playlist_pitch_admin_analytics' in the schema cache |
| `free_playlist_pitch_usage` | Missing | PGRST205: Could not find the table 'public.free_playlist_pitch_usage' in the schema cache |
| `curator_marketplace_playlist_cards` | Missing | PGRST205: Could not find the table 'public.curator_marketplace_playlist_cards' in the schema cache |
| `curator_marketplace_admin_analytics` | Missing | PGRST205: Could not find the table 'public.curator_marketplace_admin_analytics' in the schema cache |
| `curator_verification_admin_queue` | Missing | PGRST205: Could not find the table 'public.curator_verification_admin_queue' in the schema cache |
| `curator_outreach_artist_dashboard` | Missing | PGRST205: Could not find the table 'public.curator_outreach_artist_dashboard' in the schema cache |
| `playlist_performance_artist_dashboard` | Missing | PGRST205: Could not find the table 'public.playlist_performance_artist_dashboard' in the schema cache |
| `playlist_performance_timeline` | Missing | PGRST205: Could not find the table 'public.playlist_performance_timeline' in the schema cache |
| `playlist_performance_admin_analytics` | Missing | PGRST205: Could not find the table 'public.playlist_performance_admin_analytics' in the schema cache |
| `playlist_genre_performance_admin` | Missing | PGRST205: Could not find the table 'public.playlist_genre_performance_admin' in the schema cache |

## 4. Missing RPC Functions

| RPC function | Live status | Detail |
| --- | --- | --- |
| `review_playlist_pitch` | Missing | PGRST202: Could not find the function public.review_playlist_pitch(p_action, p_admin_notes, p_pitch_id, p_priority_score) in the schema cache |
| `assign_playlist_pitch_curator` | Missing | PGRST202: Could not find the function public.assign_playlist_pitch_curator(p_curator_id, p_internal_notes, p_pitch_id) in the schema cache |
| `record_playlist_pitch_response` | Missing | PGRST202: Could not find the function public.record_playlist_pitch_response(p_assignment_id, p_estimated_reach, p_playlist_name, p_playlist_url, p_response_notes, p_response_status) in the schema cache |
| `recalculate_playlist_pitch_analytics` | Missing | PGRST202: Could not find the function public.recalculate_playlist_pitch_analytics(p_pitch_id) in the schema cache |
| `playlist_pitch_limit_for_user` | Missing | PGRST202: Could not find the function public.playlist_pitch_limit_for_user(p_user_id) in the schema cache |
| `recommend_playlist_curators_for_pitch` | Missing | PGRST202: Could not find the function public.recommend_playlist_curators_for_pitch(p_limit, p_pitch_id) in the schema cache |
| `refresh_playlist_pitch_curator_recommendations` | Missing | PGRST202: Could not find the function public.refresh_playlist_pitch_curator_recommendations(p_pitch_id) in the schema cache |
| `deliver_playlist_pitch_to_matched_curators` | Missing | PGRST202: Could not find the function public.deliver_playlist_pitch_to_matched_curators(p_limit, p_pitch_id) in the schema cache |
| `force_assign_playlist_pitch_curator` | Missing | PGRST202: Could not find the function public.force_assign_playlist_pitch_curator(p_curator_id, p_internal_notes, p_pitch_id, p_playlist_id) in the schema cache |
| `record_curator_delivery_action` | Missing | PGRST202: Could not find the function public.record_curator_delivery_action(p_action, p_delivery_id, p_estimated_reach, p_playlist_id, p_playlist_name, p_playlist_url, p_requested_information, p_response_notes) in the schema cache |
| `create_curator_outreach` | Missing | PGRST202: Could not find the function public.create_curator_outreach(p_curator_id, p_notes, p_pitch_story, p_playlist_id, p_release_id, p_track_id) in the schema cache |
| `record_curator_outreach_response` | Missing | PGRST202: Could not find the function public.record_curator_outreach_response(p_curator_feedback, p_notes, p_outreach_id, p_status) in the schema cache |
| `create_curator_verification_request` | Missing | PGRST202: Could not find the function public.create_curator_verification_request(p_company_name, p_contact_email, p_country, p_curator_name, p_playlist_followers, p_playlist_name, p_playlist_public, p_playlist_url, p_social_links, p_spotify_playlist_id, p_territory) in the schema cache |
| `review_curator_verification_request` | Missing | PGRST202: Could not find the function public.review_curator_verification_request(p_action, p_admin_notes, p_request_id) in the schema cache |
| `refresh_curator_marketplace_stats` | Missing | PGRST202: Could not find the function public.refresh_curator_marketplace_stats(p_curator_id) in the schema cache |
| `refresh_curator_quality_score` | Missing | PGRST202: Could not find the function public.refresh_curator_quality_score(p_curator_id) in the schema cache |
| `refresh_playlist_placement_metrics` | Missing | PGRST202: Could not find the function public.refresh_playlist_placement_metrics(p_placement_id) in the schema cache |

## 5. Missing RLS Policies

Policy metadata is not exposed through PostgREST. Because the required base tables are missing from the live schema cache, their RLS policies are necessarily absent for production use.

| Table | Required policy |
| --- | --- |
| `playlist_pitches` | `artists view own playlist pitches` |
| `playlist_pitches` | `artists create own playlist pitches` |
| `playlist_pitches` | `artists update own draft playlist pitches` |
| `playlist_pitches` | `admins manage playlist pitches` |
| `playlist_pitch_assignments` | `artists view own playlist pitch assignments` |
| `playlist_pitch_assignments` | `admins manage playlist pitch assignments` |
| `playlist_pitch_responses` | `artists view own playlist pitch responses` |
| `playlist_pitch_responses` | `admins manage playlist pitch responses` |
| `playlist_pitch_analytics` | `artists view own playlist pitch analytics` |
| `playlist_pitch_analytics` | `admins manage playlist pitch analytics` |
| `playlist_pitch_audit_logs` | `artists view own playlist pitch audit logs` |
| `playlist_pitch_audit_logs` | `admins view playlist pitch audit logs` |
| `playlist_curator_marketplace` | `artists view active marketplace curators` |
| `playlist_curator_marketplace` | `admins manage marketplace curators` |
| `curator_playlists` | `artists view active curator playlists` |
| `curator_playlists` | `admins manage curator playlists` |
| `curator_deliveries` | `artists view own curator deliveries` |
| `curator_deliveries` | `admins manage curator deliveries` |
| `curator_deliveries` | `curator accounts update own deliveries` |
| `curator_responses` | `artists view own curator responses` |
| `curator_responses` | `admins manage curator responses` |
| `curator_playlist_additions` | `artists view own curator playlist additions` |
| `curator_playlist_additions` | `admins manage curator playlist additions` |
| `curator_quality_scores` | `authenticated view curator quality scores` |
| `curator_quality_scores` | `admins manage curator quality scores` |
| `curator_verification_requests` | `users create curator verification requests` |
| `curator_verification_requests` | `users view own curator verification requests` |
| `curator_verification_requests` | `admins manage curator verification requests` |
| `curator_playlist_registry` | `authenticated view verified playlist registry` |
| `curator_playlist_registry` | `admins manage playlist registry` |

## 6. Missing Migrations

The live schema does not expose the objects created by these local migration files, so these are the migrations that must be executed in Supabase SQL Editor for Playlist Pitching.

| Order | Migration file | Local file present |
| --- | --- | --- |
| 1 | `supabase/migrations/20260604100000_phase6_playlist_pitching_system.sql` | yes |
| 2 | `supabase/migrations/20260604110000_phase61_curator_marketplace.sql` | yes |
| 3 | `supabase/migrations/20260604120000_phase62_playlist_performance_analytics.sql` | yes |
| 4 | `supabase/migrations/20260623170000_free_playlist_pitching_system.sql` | yes |
| 5 | `supabase/migrations/20260623180000_real_curator_delivery_system.sql` | yes |
| 6 | `supabase/migrations/20260623190000_phase63_curator_recruitment_verification.sql` | yes |

## Project Configuration Finding

- Runtime `.env` points at `busmtpthvtugdesnamho`.
- `supabase/config.toml` project_id is `konlvaogrijyhrtgueom`.
- `supabase/.temp/project-ref` is `yunasnnycedmexvbogbf`.

If migrations are applied through the Supabase CLI, relink the CLI to the runtime project before pushing. For SQL Editor execution, open the runtime project shown above and run the migration files in the listed order.

## Final Assessment

Playlist Pitching is not production-ready in the live Supabase project. Core tables/views/RPCs are missing from the live schema cache.
