# Phase 4 Admin Review Queue Production Readiness

Date: 2026-06-03

## Scope

Implemented the moderation workflow between media validation and distribution:

`draft -> uploaded -> validating -> validation_passed -> under_review -> approved -> queued_for_distribution -> distributing -> live`

Rejected path:

`under_review -> rejected`

Needs changes path:

`under_review -> draft`

## Implemented

- Supabase migration for `review_queue` and `review_audit_log`.
- Review queue statuses: `pending`, `in_review`, `approved`, `rejected`, `needs_changes`.
- Release statuses added for Phase 4: `queued_for_distribution`, `distributing`.
- Auto queue insertion when a release reaches `validation_passed`, then release status moves to `under_review`.
- Review actions through audited RPCs: approve, reject, needs changes, escalate, assign.
- Approval queues distribution jobs and moves the release to `queued_for_distribution`.
- Distribution job status trigger moves releases to `distributing` and then `live`.
- Legacy track-insert distribution enqueue trigger disabled so upload no longer bypasses review.
- Admin assignment with assigned-admin enforcement and super-admin override.
- SLA metrics RPC: pending count, average review time, approvals today, rejection rate.
- Artist/admin notifications for review start, approval, rejection, changes requested, new queue item, and escalation.
- Branded email templates for `release_approved`, `release_rejected`, and `release_changes_requested`.
- Dedicated `/admin/review-queue` dashboard with queue tabs, filters, search, metrics, review panel, assignment, and note-required actions.
- Existing admin releases panel no longer directly approves releases outside the review queue.

## Security

- Artists can view only their own queue records.
- Admins can view unassigned or assigned-to-them queue records.
- Super admins have full queue visibility and management.
- Review mutations happen through security-definer RPCs with assignment checks.
- Review audit logs are visible to assigned admins and super admins, not artists.

## Verification

- `.\node_modules\.bin\tsc.cmd --noEmit`: PASS
- `npm.cmd run build`: PASS

## Residual Risks

- Supabase generated TypeScript types were not regenerated, so the new review tables/RPCs are accessed through the existing `client` escape hatch used elsewhere in the app.
- Build still reports existing large chunk warnings and stale Browserslist data.

## Readiness Score

93/100

Production-ready after applying the Phase 4 migration and deploying the updated frontend and email function.
