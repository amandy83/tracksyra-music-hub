-- Phase 4: Admin Review Queue.
-- Additive moderation workflow between media validation and distribution.

DO $$
BEGIN
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 4 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 4 prerequisite missing: public.tracks';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 4 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
END $$;

ALTER TYPE public.release_status ADD VALUE IF NOT EXISTS 'queued_for_distribution';
ALTER TYPE public.release_status ADD VALUE IF NOT EXISTS 'distributing';

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_queue_status') THEN
    CREATE TYPE public.review_queue_status AS ENUM ('pending','in_review','approved','rejected','needs_changes');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_action') THEN
    CREATE TYPE public.review_action AS ENUM ('approve','reject','needs_changes','escalate','assign');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_status public.review_queue_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  assigned_admin UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validation_score INTEGER NOT NULL DEFAULT 0 CHECK (validation_score BETWEEN 0 AND 100),
  change_request_notes TEXT,
  escalation_reason TEXT,
  first_reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(release_id)
);

CREATE TABLE IF NOT EXISTS public.review_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  review_queue_id UUID REFERENCES public.review_queue(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action public.review_action NOT NULL,
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status_created ON public.review_queue(queue_status, created_at);
CREATE INDEX IF NOT EXISTS idx_review_queue_artist ON public.review_queue(artist_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned_admin ON public.review_queue(assigned_admin);
CREATE INDEX IF NOT EXISTS idx_review_queue_validation_score ON public.review_queue(validation_score);
CREATE INDEX IF NOT EXISTS idx_review_audit_release ON public.review_audit_log(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_audit_admin ON public.review_audit_log(admin_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_track_distribution_enqueue ON public.tracks;

ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_audit_log ENABLE ROW LEVEL SECURITY;

