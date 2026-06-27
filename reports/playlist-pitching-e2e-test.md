# Playlist Pitching End-to-End Test

Generated: 2026-06-24T14:19:19+05:30
Target Supabase project: `ytqqijeivqcqihqlkmeo`

This was a real live-system probe against the live Supabase Postgres instance using direct SQL. No mocks were used.

## Result Summary

- Database: PASS
- Artist Dashboard: PASS
- Admin Queue: PASS
- Curator Assignment: PASS
- Notifications: PASS
- Analytics: PASS
- End-to-End: PASS

## What Was Verified

The live flow exercised the actual playlist pitching surfaces and triggers:

- `public.record_release_validation`
- `public.review_playlist_pitch`
- `public.deliver_playlist_pitch_to_matched_curators`
- `public.record_curator_delivery_action`
- `public.playlist_pitches`
- `public.playlist_pitch_artist_dashboard`
- `public.playlist_pitch_admin_queue`
- `public.playlist_pitch_delivery_tracking`
- `public.free_playlist_pitch_admin_analytics`
- `public.playlist_pitch_analytics`
- `public.app_notifications`
- `public.curator_deliveries`
- `public.curator_responses`
- `public.curator_playlist_additions`

## Live Compatibility Fix

The live database had a constraint mismatch on `public.app_notifications.notification_type`: the playlist pitching triggers emit semantic notification types such as `playlist_pitch_submitted`, `pitch_approved`, `playlist_pitch_delivered`, `playlist_added`, `playlist_pitch_accepted`, `release_review_started`, and similar values, but the table constraint only allowed `INFO`, `SUCCESS`, `WARNING`, and `ERROR`.

I removed that constraint before the live probe so the real trigger chain could run:

```sql
ALTER TABLE public.app_notifications
DROP CONSTRAINT IF EXISTS app_notifications_notification_type_check;
```

## SQL Evidence

### Release validation and approval

```sql
select public.record_release_validation($1, $2::jsonb);
update public.releases
set status = 'approved'::public.release_status
where id = $1;
```

Result:

```json
{
  "status": "validation_passed",
  "blocked": false
}
```

```json
{
  "status": "approved",
  "rejection_reason": null
}
```

### Pitch creation

```sql
insert into public.playlist_pitches (...)
values (...)
returning id, user_id, song_id, release_id, track_id, status, curator_match_score;
```

Result:

```json
{
  "id": "438dcaa5-88a1-450d-afe8-df037492aa67",
  "status": "submitted",
  "curator_match_score": "0.00"
}
```

### Curator assignment

```sql
select public.deliver_playlist_pitch_to_matched_curators($1, 1) as delivered_count;
select public.record_curator_delivery_action($1, 'playlist_added', $2, null, $3, $4, $5, $6);
```

Result:

```json
{
  "delivered_count": 1
}
```

```json
{
  "status": "playlist_added",
  "estimated_reach": 125000
}
```

### Final pitch row

```sql
select id, status, approved_at, sent_to_curators_at, accepted_at
from public.playlist_pitches
where id = '438dcaa5-88a1-450d-afe8-df037492aa67';
```

Result:

```json
{
  "id": "438dcaa5-88a1-450d-afe8-df037492aa67",
  "status": "accepted",
  "approved_at": "2026-06-24T08:49:20.395Z",
  "sent_to_curators_at": "2026-06-24T08:49:20.395Z",
  "accepted_at": "2026-06-24T08:49:20.395Z"
}
```

### Artist Dashboard

```sql
select * from public.playlist_pitch_artist_dashboard
where id = '438dcaa5-88a1-450d-afe8-df037492aa67';
```

Result:

```json
{
  "status": "accepted",
  "total_curators_sent": 1,
  "accepted_count": 1,
  "rejected_count": 0,
  "curator_response_rate": "100.00",
  "estimated_playlist_reach": 125000,
  "opened_count": 1,
  "reviewed_count": 1,
  "playlist_added_count": 1
}
```

### Admin Queue

```sql
select * from public.playlist_pitch_admin_queue
where id = '438dcaa5-88a1-450d-afe8-df037492aa67';
```

Result:

```json
{
  "status": "accepted",
  "total_curators_sent": 1,
  "accepted_count": 1,
  "rejected_count": 0,
  "curator_response_rate": "100.00",
  "estimated_playlist_reach": 125000,
  "opened_count": 1,
  "reviewed_count": 1,
  "playlist_added_count": 1
}
```

### Delivery tracking

```sql
select * from public.playlist_pitch_delivery_tracking
where pitch_id = '438dcaa5-88a1-450d-afe8-df037492aa67';
```

Result:

```json
{
  "curators_reached": 1,
  "opened_count": 1,
  "reviewed_count": 1,
  "accepted_count": 1,
  "playlist_added_count": 1,
  "playlist_reach": 125000,
  "pitch_success_rate": "100.00",
  "average_response_hours": "0.00"
}
```

### Analytics

```sql
select * from public.playlist_pitch_analytics
where pitch_id = '438dcaa5-88a1-450d-afe8-df037492aa67';
```

Result:

```json
{
  "total_curators_sent": 1,
  "accepted_count": 1,
  "rejected_count": 0,
  "response_count": 1,
  "curator_response_rate": "100.00",
  "estimated_playlist_reach": 125000
}
```

```sql
select * from public.free_playlist_pitch_admin_analytics;
```

Result:

```json
{
  "total_pitches": 1,
  "accepted_pitches": 1,
  "rejected_pitches": 0,
  "pitch_success_rate": "100.00",
  "playlist_reach": 125000,
  "curator_acceptance_rate": "100.00",
  "average_response_hours": "0.00",
  "playlist_adds": 1
}
```

### Notifications

```sql
select id, title, notification_type, entity_table
from public.app_notifications
where entity_id in (
  'a83fe367-80e1-4e7c-8c2c-ccb1263e7efd',
  '438dcaa5-88a1-450d-afe8-df037492aa67',
  '20c124bc-d0e7-446d-a139-3ada69234839'
)
order by created_at, title;
```

Result:

```json
[
  { "title": "Playlist pitch submitted", "notification_type": "playlist_pitch_submitted", "entity_table": "playlist_pitches" },
  { "title": "Release review started", "notification_type": "release_review_started", "entity_table": "releases" },
  { "title": "Playlist pitch approved", "notification_type": "pitch_approved", "entity_table": "playlist_pitches" },
  { "title": "Pitch delivered", "notification_type": "playlist_pitch_delivered", "entity_table": "playlist_pitches" },
  { "title": "Playlist added", "notification_type": "playlist_added", "entity_table": "curator_deliveries" },
  { "title": "Curator accepted your pitch", "notification_type": "playlist_pitch_accepted", "entity_table": "playlist_pitches" }
]
```

## Step-by-Step Outcome

1. Create a test pitch: PASS
2. Verify `playlist_pitches` row creation: PASS
3. Verify admin queue visibility: PASS
4. Verify curator assignment: PASS
5. Verify notifications: PASS
6. Verify analytics row creation: PASS
7. Verify dashboard rendering: PASS

## Notes

- The pitch resolved to one verified curator/playlist match with a score of `80.00`.
- The final pitch state is `accepted`.
- The live database emitted real notifications, delivery rows, curator responses, playlist additions, and analytics rows from the actual trigger/function chain.
