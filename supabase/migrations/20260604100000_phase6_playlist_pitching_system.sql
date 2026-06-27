-- Phase 6: Playlist Pitching System (production grade).

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.profiles';
  END IF;
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.tracks';
  END IF;
  IF to_regclass('public.upload_logs') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.upload_logs';
  END IF;
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.app_role';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Phase 6 prerequisite missing: public.set_updated_at()';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.playlist_pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id UUID REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  genre TEXT,
  subgenre TEXT,
  mood_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  instruments TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  language TEXT,
  territory TEXT,
  pitch_story TEXT NOT NULL,
  marketing_plan TEXT,
  social_links JSONB NOT NULL DEFAULT '{}'::JSONB,
  campaign_budget NUMERIC(12,2),
  release_date DATE,
  spotify_uri TEXT,
  release_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','sent_to_curators','accepted','rejected')),
  priority_score INTEGER NOT NULL DEFAULT 50 CHECK (priority_score BETWEEN 0 AND 100),
  admin_notes TEXT,
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  sent_to_curators_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.playlist_pitches
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES public.releases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subgenre TEXT,
  ADD COLUMN IF NOT EXISTS mood_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS instruments TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS territory TEXT,
  ADD COLUMN IF NOT EXISTS marketing_plan TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS campaign_budget NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS release_date DATE,
  ADD COLUMN IF NOT EXISTS spotify_uri TEXT,
  ADD COLUMN IF NOT EXISTS release_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_curators_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'playlist_pitches' AND column_name = 'song_id'
  ) THEN
    UPDATE public.playlist_pitches pp
    SET release_id = COALESCE(pp.release_id, pp.song_id)
    WHERE pp.release_id IS NULL
      AND EXISTS (SELECT 1 FROM public.releases r WHERE r.id = pp.song_id);
  END IF;
END $$;

ALTER TABLE public.playlist_pitches
  ALTER COLUMN status SET DEFAULT 'draft';

UPDATE public.playlist_pitches
SET status = CASE
  WHEN status = 'pending' THEN 'submitted'
  WHEN status = 'approved' THEN 'approved'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status IN ('draft','submitted','under_review','sent_to_curators','accepted') THEN status
  ELSE 'draft'
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.playlist_pitches'::regclass
      AND conname = 'playlist_pitches_status_check'
  ) THEN
    ALTER TABLE public.playlist_pitches DROP CONSTRAINT playlist_pitches_status_check;
  END IF;
END $$;

ALTER TABLE public.playlist_pitches
  ADD CONSTRAINT playlist_pitches_status_check
  CHECK (status IN ('draft','submitted','under_review','approved','sent_to_curators','accepted','rejected')) NOT VALID;
ALTER TABLE public.playlist_pitches VALIDATE CONSTRAINT playlist_pitches_status_check;

CREATE TABLE IF NOT EXISTS public.playlist_curators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  organization TEXT,
  profile_url TEXT,
  genres_covered TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  territories_covered TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (acceptance_rate BETWEEN 0 AND 100),
  estimated_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_reach >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playlist_pitch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curators(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','sent','responded','accepted','rejected','expired')),
  internal_notes TEXT,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pitch_id, curator_id)
);

CREATE TABLE IF NOT EXISTS public.playlist_pitch_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.playlist_pitch_assignments(id) ON DELETE SET NULL,
  curator_id UUID REFERENCES public.playlist_curators(id) ON DELETE SET NULL,
  response_status TEXT NOT NULL CHECK (response_status IN ('accepted','rejected','needs_more_info','no_response')),
  response_notes TEXT,
  playlist_name TEXT,
  playlist_url TEXT,
  estimated_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_reach >= 0),
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playlist_pitch_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  total_curators_sent INTEGER NOT NULL DEFAULT 0 CHECK (total_curators_sent >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  response_count INTEGER NOT NULL DEFAULT 0 CHECK (response_count >= 0),
  curator_response_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (curator_response_rate BETWEEN 0 AND 100),
  estimated_playlist_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_playlist_reach >= 0),
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pitch_id)
);

CREATE TABLE IF NOT EXISTS public.playlist_pitch_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playlist_pitches_user_created ON public.playlist_pitches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_pitches_release_active ON public.playlist_pitches(release_id) WHERE status IN ('draft','submitted','under_review','approved','sent_to_curators','accepted');
CREATE INDEX IF NOT EXISTS idx_playlist_pitches_status_created ON public.playlist_pitches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_pitches_genre ON public.playlist_pitches(genre);
CREATE INDEX IF NOT EXISTS idx_playlist_pitches_territory ON public.playlist_pitches(territory);
CREATE INDEX IF NOT EXISTS idx_playlist_curators_active ON public.playlist_curators(active, acceptance_rate DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_pitch_assignments_pitch ON public.playlist_pitch_assignments(pitch_id);
CREATE INDEX IF NOT EXISTS idx_playlist_pitch_assignments_curator ON public.playlist_pitch_assignments(curator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_pitch_responses_pitch ON public.playlist_pitch_responses(pitch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_pitch_analytics_pitch ON public.playlist_pitch_analytics(pitch_id);
CREATE INDEX IF NOT EXISTS idx_playlist_pitch_audit_pitch ON public.playlist_pitch_audit_logs(pitch_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uniq_playlist_pitches_one_active_release'
  ) THEN
    CREATE UNIQUE INDEX uniq_playlist_pitches_one_active_release
    ON public.playlist_pitches(release_id)
    WHERE release_id IS NOT NULL
      AND status IN ('draft','submitted','under_review','approved','sent_to_curators','accepted');
  END IF;
END $$;

ALTER TABLE public.playlist_pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_curators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_pitch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_pitch_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_pitch_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_pitch_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own playlist pitches" ON public.playlist_pitches;
CREATE POLICY "artists view own playlist pitches" ON public.playlist_pitches
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artists create own playlist pitches" ON public.playlist_pitches;
CREATE POLICY "artists create own playlist pitches" ON public.playlist_pitches
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND status IN ('draft','submitted')
  AND release_id IS NOT NULL
  AND track_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('approved','sent_to_stores','processing','live')
  )
  AND EXISTS (
    SELECT 1 FROM public.tracks t
    WHERE t.id = track_id
      AND t.release_id = release_id
      AND t.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "artists update own draft playlist pitches" ON public.playlist_pitches;
CREATE POLICY "artists update own draft playlist pitches" ON public.playlist_pitches
FOR UPDATE
USING (user_id = auth.uid() AND status IN ('draft','rejected'))
WITH CHECK (user_id = auth.uid() AND status IN ('draft','submitted'));

DROP POLICY IF EXISTS "admins manage playlist pitches" ON public.playlist_pitches;
CREATE POLICY "admins manage playlist pitches" ON public.playlist_pitches
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "authenticated view active playlist curators" ON public.playlist_curators;
CREATE POLICY "authenticated view active playlist curators" ON public.playlist_curators
FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins manage playlist curators" ON public.playlist_curators;
CREATE POLICY "admins manage playlist curators" ON public.playlist_curators
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist pitch assignments" ON public.playlist_pitch_assignments;
CREATE POLICY "artists view own playlist pitch assignments" ON public.playlist_pitch_assignments
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.playlist_pitches p WHERE p.id = pitch_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist pitch assignments" ON public.playlist_pitch_assignments;
CREATE POLICY "admins manage playlist pitch assignments" ON public.playlist_pitch_assignments
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist pitch responses" ON public.playlist_pitch_responses;
CREATE POLICY "artists view own playlist pitch responses" ON public.playlist_pitch_responses
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.playlist_pitches p WHERE p.id = pitch_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist pitch responses" ON public.playlist_pitch_responses;
CREATE POLICY "admins manage playlist pitch responses" ON public.playlist_pitch_responses
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist pitch analytics" ON public.playlist_pitch_analytics;
CREATE POLICY "artists view own playlist pitch analytics" ON public.playlist_pitch_analytics
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.playlist_pitches p WHERE p.id = pitch_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist pitch analytics" ON public.playlist_pitch_analytics;
CREATE POLICY "admins manage playlist pitch analytics" ON public.playlist_pitch_analytics
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist pitch audit logs" ON public.playlist_pitch_audit_logs;
CREATE POLICY "artists view own playlist pitch audit logs" ON public.playlist_pitch_audit_logs
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.playlist_pitches p WHERE p.id = pitch_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins view playlist pitch audit logs" ON public.playlist_pitch_audit_logs;
CREATE POLICY "admins view playlist pitch audit logs" ON public.playlist_pitch_audit_logs
FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.playlist_pitch_status_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_template TEXT;
  v_email TEXT;
  v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.playlist_pitch_audit_logs (pitch_id, actor_id, action, previous_status, new_status, details)
    VALUES (
      NEW.id,
      auth.uid(),
      CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'status_changed' END,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      jsonb_build_object('release_id', NEW.release_id, 'track_id', NEW.track_id)
    );

    v_title := CASE NEW.status
      WHEN 'submitted' THEN 'Playlist pitch submitted'
      WHEN 'approved' THEN 'Playlist pitch approved'
      WHEN 'rejected' THEN 'Playlist pitch rejected'
      WHEN 'accepted' THEN 'Curator accepted your pitch'
      ELSE 'Playlist pitch update'
    END;
    v_message := CASE NEW.status
      WHEN 'submitted' THEN 'Your playlist pitch has entered editorial review.'
      WHEN 'approved' THEN 'Your playlist pitch was approved and is ready for curator outreach.'
      WHEN 'rejected' THEN COALESCE(NEW.rejection_reason, NEW.admin_notes, 'Your playlist pitch was not approved this round.')
      WHEN 'accepted' THEN 'A curator accepted your pitch. Placement details will appear in analytics.'
      ELSE 'Your playlist pitch status changed to ' || NEW.status || '.'
    END;
    v_template := CASE NEW.status
      WHEN 'submitted' THEN 'playlist_pitch_submitted'
      WHEN 'approved' THEN 'pitch_approved'
      WHEN 'rejected' THEN 'pitch_rejected'
      WHEN 'accepted' THEN 'playlist_pitch_accepted'
      ELSE 'playlist_pitch_update'
    END;

    IF NEW.status IN ('submitted','approved','rejected','accepted') AND to_regclass('public.app_notifications') IS NOT NULL THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      VALUES (NEW.user_id, v_title, v_message, v_template, 'playlist_pitches', NEW.id);
    END IF;

    IF NEW.status IN ('submitted','approved','rejected','accepted')
       AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
      SELECT au.email, COALESCE(p.artist_name, p.full_name, au.email)
      INTO v_email, v_name
      FROM auth.users au
      LEFT JOIN public.profiles p ON p.id = au.id
      WHERE au.id = NEW.user_id;

      IF v_email IS NOT NULL THEN
        PERFORM public.queue_email(
          v_email,
          COALESCE(v_name, v_email),
          v_title,
          v_template,
          jsonb_build_object(
            'name', COALESCE(v_name, v_email),
            'playlist', COALESCE(NEW.spotify_uri, 'Playlist pitch'),
            'platform', 'Spotify',
            'notes', COALESCE(NEW.rejection_reason, NEW.admin_notes, v_message)
          ),
          'playlist_pitches',
          NEW.id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_playlist_pitch_analytics(p_pitch_id UUID)
RETURNS public.playlist_pitch_analytics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.playlist_pitch_analytics;
BEGIN
  INSERT INTO public.playlist_pitch_analytics (
    pitch_id,
    total_curators_sent,
    accepted_count,
    rejected_count,
    response_count,
    curator_response_rate,
    estimated_playlist_reach,
    last_calculated_at
  )
  SELECT
    p_pitch_id,
    COUNT(a.id)::INTEGER,
    COUNT(r.id) FILTER (WHERE r.response_status = 'accepted')::INTEGER,
    COUNT(r.id) FILTER (WHERE r.response_status = 'rejected')::INTEGER,
    COUNT(r.id) FILTER (WHERE r.response_status IN ('accepted','rejected','needs_more_info'))::INTEGER,
    CASE WHEN COUNT(a.id) = 0 THEN 0 ELSE ROUND((COUNT(r.id) FILTER (WHERE r.response_status IN ('accepted','rejected','needs_more_info'))::NUMERIC / COUNT(a.id)::NUMERIC) * 100, 2) END,
    COALESCE(SUM(r.estimated_reach) FILTER (WHERE r.response_status = 'accepted'), 0)::INTEGER,
    now()
  FROM public.playlist_pitches p
  LEFT JOIN public.playlist_pitch_assignments a ON a.pitch_id = p.id AND a.status IN ('sent','responded','accepted','rejected')
  LEFT JOIN public.playlist_pitch_responses r ON r.pitch_id = p.id
  WHERE p.id = p_pitch_id
  GROUP BY p.id
  ON CONFLICT (pitch_id) DO UPDATE
  SET total_curators_sent = EXCLUDED.total_curators_sent,
      accepted_count = EXCLUDED.accepted_count,
      rejected_count = EXCLUDED.rejected_count,
      response_count = EXCLUDED.response_count,
      curator_response_rate = EXCLUDED.curator_response_rate,
      estimated_playlist_reach = EXCLUDED.estimated_playlist_reach,
      last_calculated_at = now(),
      updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_playlist_pitch_analytics_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_playlist_pitch_analytics(COALESCE(NEW.pitch_id, OLD.pitch_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_playlist_pitch(
  p_pitch_id UUID,
  p_action TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_priority_score INTEGER DEFAULT NULL
)
RETURNS public.playlist_pitches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch public.playlist_pitches;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF p_action NOT IN ('under_review','approve','reject','sent_to_curators') THEN
    RAISE EXCEPTION 'Unsupported playlist pitch action %', p_action;
  END IF;
  IF p_action = 'reject' AND (p_admin_notes IS NULL OR length(trim(p_admin_notes)) = 0) THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  UPDATE public.playlist_pitches
  SET status = CASE
        WHEN p_action = 'approve' THEN 'approved'
        WHEN p_action = 'reject' THEN 'rejected'
        WHEN p_action = 'sent_to_curators' THEN 'sent_to_curators'
        ELSE 'under_review'
      END,
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      rejection_reason = CASE WHEN p_action = 'reject' THEN p_admin_notes ELSE rejection_reason END,
      priority_score = COALESCE(p_priority_score, priority_score),
      reviewed_at = CASE WHEN p_action IN ('under_review','approve','reject') THEN now() ELSE reviewed_at END,
      approved_at = CASE WHEN p_action = 'approve' THEN now() ELSE approved_at END,
      sent_to_curators_at = CASE WHEN p_action = 'sent_to_curators' THEN now() ELSE sent_to_curators_at END,
      rejected_at = CASE WHEN p_action = 'reject' THEN now() ELSE rejected_at END
  WHERE id = p_pitch_id
  RETURNING * INTO v_pitch;

  IF v_pitch.id IS NULL THEN
    RAISE EXCEPTION 'Playlist pitch % not found', p_pitch_id;
  END IF;

  RETURN v_pitch;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_playlist_pitch_curator(
  p_pitch_id UUID,
  p_curator_id UUID,
  p_internal_notes TEXT DEFAULT NULL
)
RETURNS public.playlist_pitch_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.playlist_pitch_assignments;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  INSERT INTO public.playlist_pitch_assignments (pitch_id, curator_id, assigned_by, internal_notes)
  VALUES (p_pitch_id, p_curator_id, auth.uid(), p_internal_notes)
  ON CONFLICT (pitch_id, curator_id) DO UPDATE
  SET internal_notes = COALESCE(EXCLUDED.internal_notes, playlist_pitch_assignments.internal_notes),
      updated_at = now()
  RETURNING * INTO v_assignment;

  UPDATE public.playlist_pitches
  SET status = CASE WHEN status IN ('approved','under_review','submitted') THEN 'sent_to_curators' ELSE status END,
      sent_to_curators_at = COALESCE(sent_to_curators_at, now())
  WHERE id = p_pitch_id;

  PERFORM public.recalculate_playlist_pitch_analytics(p_pitch_id);
  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_playlist_pitch_response(
  p_assignment_id UUID,
  p_response_status TEXT,
  p_response_notes TEXT DEFAULT NULL,
  p_playlist_name TEXT DEFAULT NULL,
  p_playlist_url TEXT DEFAULT NULL,
  p_estimated_reach INTEGER DEFAULT 0
)
RETURNS public.playlist_pitch_responses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.playlist_pitch_assignments;
  v_response public.playlist_pitch_responses;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF p_response_status NOT IN ('accepted','rejected','needs_more_info','no_response') THEN
    RAISE EXCEPTION 'Unsupported curator response %', p_response_status;
  END IF;

  SELECT * INTO v_assignment
  FROM public.playlist_pitch_assignments
  WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Playlist pitch assignment % not found', p_assignment_id;
  END IF;

  INSERT INTO public.playlist_pitch_responses (
    pitch_id,
    assignment_id,
    curator_id,
    response_status,
    response_notes,
    playlist_name,
    playlist_url,
    estimated_reach
  )
  VALUES (
    v_assignment.pitch_id,
    v_assignment.id,
    v_assignment.curator_id,
    p_response_status,
    p_response_notes,
    p_playlist_name,
    p_playlist_url,
    COALESCE(p_estimated_reach, 0)
  )
  RETURNING * INTO v_response;

  UPDATE public.playlist_pitch_assignments
  SET status = CASE
        WHEN p_response_status = 'accepted' THEN 'accepted'
        WHEN p_response_status = 'rejected' THEN 'rejected'
        ELSE 'responded'
      END,
      responded_at = now(),
      updated_at = now()
  WHERE id = v_assignment.id;

  IF p_response_status = 'accepted' THEN
    UPDATE public.playlist_pitches
    SET status = 'accepted',
        accepted_at = COALESCE(accepted_at, now())
    WHERE id = v_assignment.pitch_id;
  END IF;

  UPDATE public.playlist_curators c
  SET acceptance_rate = stats.acceptance_rate,
      updated_at = now()
  FROM (
    SELECT
      curator_id,
      CASE
        WHEN COUNT(*) FILTER (WHERE response_status IN ('accepted','rejected','needs_more_info')) = 0 THEN 0
        ELSE ROUND(
          (COUNT(*) FILTER (WHERE response_status = 'accepted')::NUMERIC
          / COUNT(*) FILTER (WHERE response_status IN ('accepted','rejected','needs_more_info'))::NUMERIC) * 100,
          2
        )
      END AS acceptance_rate
    FROM public.playlist_pitch_responses
    WHERE curator_id = v_assignment.curator_id
    GROUP BY curator_id
  ) stats
  WHERE c.id = stats.curator_id;

  PERFORM public.recalculate_playlist_pitch_analytics(v_assignment.pitch_id);
  RETURN v_response;
END;
$$;

DROP TRIGGER IF EXISTS trg_playlist_pitches_updated_at ON public.playlist_pitches;
CREATE TRIGGER trg_playlist_pitches_updated_at
BEFORE UPDATE ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS playlist_pitches_updated_at ON public.playlist_pitches;

DROP TRIGGER IF EXISTS trg_playlist_curators_updated_at ON public.playlist_curators;
CREATE TRIGGER trg_playlist_curators_updated_at
BEFORE UPDATE ON public.playlist_curators
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_pitch_assignments_updated_at ON public.playlist_pitch_assignments;
CREATE TRIGGER trg_playlist_pitch_assignments_updated_at
BEFORE UPDATE ON public.playlist_pitch_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_pitch_analytics_updated_at ON public.playlist_pitch_analytics;
CREATE TRIGGER trg_playlist_pitch_analytics_updated_at
BEFORE UPDATE ON public.playlist_pitch_analytics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_pitch_status_notify ON public.playlist_pitches;
CREATE TRIGGER trg_playlist_pitch_status_notify
AFTER INSERT OR UPDATE OF status ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.playlist_pitch_status_notify();

DROP TRIGGER IF EXISTS trg_playlist_pitch_assignments_analytics ON public.playlist_pitch_assignments;
CREATE TRIGGER trg_playlist_pitch_assignments_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.playlist_pitch_assignments
FOR EACH ROW EXECUTE FUNCTION public.refresh_playlist_pitch_analytics_trigger();

DROP TRIGGER IF EXISTS trg_playlist_pitch_responses_analytics ON public.playlist_pitch_responses;
CREATE TRIGGER trg_playlist_pitch_responses_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.playlist_pitch_responses
FOR EACH ROW EXECUTE FUNCTION public.refresh_playlist_pitch_analytics_trigger();

DROP VIEW IF EXISTS public.playlist_pitch_admin_queue CASCADE;

CREATE VIEW public.playlist_pitch_admin_queue
WITH (security_invoker = true) AS
SELECT
  p.*,
  r.title AS release_title,
  r.primary_artist,
  t.title AS track_title,
  prof.artist_name,
  prof.full_name,
  COALESCE(a.total_curators_sent, 0) AS total_curators_sent,
  COALESCE(a.accepted_count, 0) AS accepted_count,
  COALESCE(a.rejected_count, 0) AS rejected_count,
  COALESCE(a.curator_response_rate, 0) AS curator_response_rate,
  COALESCE(a.estimated_playlist_reach, 0) AS estimated_playlist_reach
FROM public.playlist_pitches p
JOIN public.releases r ON r.id = p.release_id
JOIN public.tracks t ON t.id = p.track_id
LEFT JOIN public.profiles prof ON prof.id = p.user_id
LEFT JOIN public.playlist_pitch_analytics a ON a.pitch_id = p.id;

CREATE OR REPLACE VIEW public.playlist_pitch_artist_dashboard
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.release_id,
  p.track_id,
  p.genre,
  p.subgenre,
  p.territory,
  p.status,
  p.priority_score,
  p.admin_notes,
  p.rejection_reason,
  p.created_at,
  p.updated_at,
  r.title AS release_title,
  r.primary_artist,
  t.title AS track_title,
  COALESCE(a.total_curators_sent, 0) AS total_curators_sent,
  COALESCE(a.accepted_count, 0) AS accepted_count,
  COALESCE(a.rejected_count, 0) AS rejected_count,
  COALESCE(a.curator_response_rate, 0) AS curator_response_rate,
  COALESCE(a.estimated_playlist_reach, 0) AS estimated_playlist_reach
FROM public.playlist_pitches p
JOIN public.releases r ON r.id = p.release_id
JOIN public.tracks t ON t.id = p.track_id
LEFT JOIN public.playlist_pitch_analytics a ON a.pitch_id = p.id;

GRANT SELECT, INSERT, UPDATE ON public.playlist_pitches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_curators TO authenticated;
GRANT SELECT ON public.playlist_pitch_assignments TO authenticated;
GRANT SELECT ON public.playlist_pitch_responses TO authenticated;
GRANT SELECT ON public.playlist_pitch_analytics TO authenticated;
GRANT SELECT ON public.playlist_pitch_audit_logs TO authenticated;
GRANT SELECT ON public.playlist_pitch_admin_queue TO authenticated;
GRANT SELECT ON public.playlist_pitch_artist_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_playlist_pitch(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_playlist_pitch_curator(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_playlist_pitch_response(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

DO $$
DECLARE
  v_table REGCLASS;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'public.playlist_pitches'::REGCLASS,
      'public.playlist_pitch_assignments'::REGCLASS,
      'public.playlist_pitch_responses'::REGCLASS,
      'public.playlist_pitch_analytics'::REGCLASS
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables pt
        JOIN pg_class c ON c.relname = pt.tablename
        JOIN pg_namespace n ON n.nspname = pt.schemaname AND n.oid = c.relnamespace
        WHERE pt.pubname = 'supabase_realtime'
          AND c.oid = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', v_table);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMENT ON TABLE public.playlist_pitches IS 'Production playlist pitching workflow for approved releases and tracks.';
COMMENT ON TABLE public.playlist_curators IS 'Curator profiles, genre coverage, territory coverage, acceptance rate, and reach.';
COMMENT ON TABLE public.playlist_pitch_assignments IS 'Admin assignment of approved pitches to curators.';
COMMENT ON TABLE public.playlist_pitch_responses IS 'Curator response history for playlist pitches.';
COMMENT ON TABLE public.playlist_pitch_analytics IS 'Aggregated playlist pitch outcomes and estimated reach.';
