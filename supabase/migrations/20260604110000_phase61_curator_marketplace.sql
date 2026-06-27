-- Phase 6.1: Curator Marketplace (production grade).

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.profiles';
  END IF;
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.tracks';
  END IF;
  IF to_regtype('public.app_role') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.app_role';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.1 prerequisite missing: public.set_updated_at()';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.playlist_curator_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  website_url TEXT,
  spotify_profile_url TEXT,
  country TEXT,
  territory TEXT,
  bio TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (acceptance_rate BETWEEN 0 AND 100),
  response_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (response_rate BETWEEN 0 AND 100),
  average_response_days NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (average_response_days >= 0),
  total_playlists INTEGER NOT NULL DEFAULT 0 CHECK (total_playlists >= 0),
  total_followers INTEGER NOT NULL DEFAULT 0 CHECK (total_followers >= 0),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_name TEXT NOT NULL,
  spotify_playlist_url TEXT NOT NULL,
  spotify_playlist_id TEXT,
  followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
  genre TEXT,
  mood TEXT,
  territory TEXT,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  verified BOOLEAN NOT NULL DEFAULT false,
  last_checked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_contact_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('email','instagram','tiktok','website','spotify','other')),
  contact_value TEXT NOT NULL,
  preferred BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  evidence_url TEXT,
  evidence_notes TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  territory TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_outreach_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  pitch_story TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','viewed','responded','accepted','rejected','expired')),
  submission_date TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  response_date TIMESTAMPTZ,
  notes TEXT,
  curator_feedback TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','blocked','fraud')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (curator_id IS NOT NULL OR playlist_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.curator_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curator_id UUID REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  favorite_type TEXT NOT NULL CHECK (favorite_type IN ('curator','playlist')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (favorite_type = 'curator' AND curator_id IS NOT NULL AND playlist_id IS NULL)
    OR (favorite_type = 'playlist' AND playlist_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.curator_marketplace_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  row_id UUID,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_marketplace_email_active
  ON public.playlist_curator_marketplace(lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_marketplace_spotify_profile_active
  ON public.playlist_curator_marketplace(lower(spotify_profile_url))
  WHERE spotify_profile_url IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_playlist_url_active
  ON public.curator_playlists(lower(spotify_playlist_url))
  WHERE deleted_at IS NULL;
ALTER TABLE public.curator_genres DROP CONSTRAINT IF EXISTS curator_genres_curator_id_genre_key;
ALTER TABLE public.curator_territories DROP CONSTRAINT IF EXISTS curator_territories_curator_id_territory_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_genres_active
  ON public.curator_genres(curator_id, lower(genre))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_territories_active
  ON public.curator_territories(curator_id, lower(territory))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_favorites_curator_active
  ON public.curator_favorites(user_id, curator_id)
  WHERE favorite_type = 'curator' AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_favorites_playlist_active
  ON public.curator_favorites(user_id, playlist_id)
  WHERE favorite_type = 'playlist' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_curator_marketplace_search ON public.playlist_curator_marketplace(active, verified, acceptance_rate DESC, response_rate DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_marketplace_country ON public.playlist_curator_marketplace(country) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_playlists_filters ON public.curator_playlists(genre, mood, territory, followers DESC) WHERE deleted_at IS NULL AND active = true;
CREATE INDEX IF NOT EXISTS idx_curator_playlists_curator ON public.curator_playlists(curator_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_outreach_user_created ON public.curator_outreach_history(user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_outreach_curator_status ON public.curator_outreach_history(curator_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_blacklist_active ON public.curator_blacklist(active, severity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_marketplace_audit ON public.curator_marketplace_audit_logs(table_name, row_id, created_at DESC);

ALTER TABLE public.playlist_curator_marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_contact_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_outreach_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_marketplace_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view active marketplace curators" ON public.playlist_curator_marketplace;
CREATE POLICY "artists view active marketplace curators" ON public.playlist_curator_marketplace
FOR SELECT USING (deleted_at IS NULL AND active = true AND approval_status = 'approved');

DROP POLICY IF EXISTS "admins manage marketplace curators" ON public.playlist_curator_marketplace;
CREATE POLICY "admins manage marketplace curators" ON public.playlist_curator_marketplace
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view active curator playlists" ON public.curator_playlists;
CREATE POLICY "artists view active curator playlists" ON public.curator_playlists
FOR SELECT USING (
  deleted_at IS NULL
  AND active = true
  AND EXISTS (
    SELECT 1 FROM public.playlist_curator_marketplace c
    WHERE c.id = curator_id AND c.deleted_at IS NULL AND c.active = true AND c.approval_status = 'approved'
  )
);

DROP POLICY IF EXISTS "admins manage curator playlists" ON public.curator_playlists;
CREATE POLICY "admins manage curator playlists" ON public.curator_playlists
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view active curator contact methods" ON public.curator_contact_methods;
CREATE POLICY "artists view active curator contact methods" ON public.curator_contact_methods
FOR SELECT USING (
  deleted_at IS NULL AND active = true AND EXISTS (
    SELECT 1 FROM public.playlist_curator_marketplace c
    WHERE c.id = curator_id AND c.deleted_at IS NULL AND c.active = true AND c.approval_status = 'approved'
  )
);

DROP POLICY IF EXISTS "admins manage curator contact methods" ON public.curator_contact_methods;
CREATE POLICY "admins manage curator contact methods" ON public.curator_contact_methods
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "users create curator verification requests" ON public.curator_verification_requests;
CREATE POLICY "users create curator verification requests" ON public.curator_verification_requests
FOR INSERT WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "users view own curator verification requests" ON public.curator_verification_requests;
CREATE POLICY "users view own curator verification requests" ON public.curator_verification_requests
FOR SELECT USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins manage curator verification requests" ON public.curator_verification_requests;
CREATE POLICY "admins manage curator verification requests" ON public.curator_verification_requests
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view curator genres" ON public.curator_genres;
CREATE POLICY "artists view curator genres" ON public.curator_genres
FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "admins manage curator genres" ON public.curator_genres;
CREATE POLICY "admins manage curator genres" ON public.curator_genres
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view curator territories" ON public.curator_territories;
CREATE POLICY "artists view curator territories" ON public.curator_territories
FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "admins manage curator territories" ON public.curator_territories;
CREATE POLICY "admins manage curator territories" ON public.curator_territories
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists manage own curator outreach" ON public.curator_outreach_history;
CREATE POLICY "artists manage own curator outreach" ON public.curator_outreach_history
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage curator outreach" ON public.curator_outreach_history;
CREATE POLICY "admins manage curator outreach" ON public.curator_outreach_history
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view active curator blacklist" ON public.curator_blacklist;
CREATE POLICY "artists view active curator blacklist" ON public.curator_blacklist
FOR SELECT USING (deleted_at IS NULL AND active = true);

DROP POLICY IF EXISTS "admins manage curator blacklist" ON public.curator_blacklist;
CREATE POLICY "admins manage curator blacklist" ON public.curator_blacklist
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists manage own curator favorites" ON public.curator_favorites;
CREATE POLICY "artists manage own curator favorites" ON public.curator_favorites
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admins view curator marketplace audit logs" ON public.curator_marketplace_audit_logs;
CREATE POLICY "admins view curator marketplace audit logs" ON public.curator_marketplace_audit_logs
FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.curator_marketplace_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.curator_marketplace_audit_logs (table_name, row_id, actor_id, action, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_curator_marketplace_stats(p_curator_id UUID)
RETURNS public.playlist_curator_marketplace
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.playlist_curator_marketplace;
BEGIN
  UPDATE public.playlist_curator_marketplace c
  SET
    total_playlists = COALESCE(p.playlist_count, 0),
    total_followers = COALESCE(p.followers_sum, 0),
    acceptance_rate = COALESCE(o.acceptance_rate, c.acceptance_rate, 0),
    response_rate = COALESCE(o.response_rate, c.response_rate, 0),
    average_response_days = COALESCE(o.average_response_days, c.average_response_days, 0),
    updated_at = now()
  FROM (
    SELECT
      p_curator_id AS curator_id,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND active = true)::INTEGER AS playlist_count,
      COALESCE(SUM(followers) FILTER (WHERE deleted_at IS NULL AND active = true), 0)::INTEGER AS followers_sum
    FROM public.curator_playlists
    WHERE curator_id = p_curator_id
  ) p
  LEFT JOIN (
    SELECT
      p_curator_id AS curator_id,
      CASE WHEN COUNT(*) FILTER (WHERE status IN ('responded','accepted','rejected')) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC / COUNT(*) FILTER (WHERE status IN ('responded','accepted','rejected'))::NUMERIC) * 100, 2)
      END AS acceptance_rate,
      CASE WHEN COUNT(*) FILTER (WHERE status IN ('submitted','viewed','responded','accepted','rejected','expired')) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE status IN ('responded','accepted','rejected'))::NUMERIC / COUNT(*) FILTER (WHERE status IN ('submitted','viewed','responded','accepted','rejected','expired'))::NUMERIC) * 100, 2)
      END AS response_rate,
      COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (response_date - submission_date)) / 86400) FILTER (WHERE response_date IS NOT NULL AND submission_date IS NOT NULL), 2), 0) AS average_response_days
    FROM public.curator_outreach_history
    WHERE curator_id = p_curator_id AND deleted_at IS NULL
  ) o ON o.curator_id = p.curator_id
  WHERE c.id = p_curator_id
  RETURNING c.* INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_curator_marketplace_stats_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_curator_marketplace_stats(COALESCE(NEW.curator_id, OLD.curator_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_curator_outreach(
  p_release_id UUID,
  p_track_id UUID,
  p_curator_id UUID,
  p_playlist_id UUID DEFAULT NULL,
  p_pitch_story TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.curator_outreach_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_row public.curator_outreach_history;
  v_email TEXT;
  v_name TEXT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.curator_outreach_history
  WHERE user_id = auth.uid()
    AND deleted_at IS NULL
    AND created_at > now() - interval '24 hours'
    AND status IN ('submitted','viewed','responded','accepted','rejected');

  IF v_count >= 25 THEN
    RAISE EXCEPTION 'Daily curator outreach limit reached';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.curator_blacklist b
    WHERE b.deleted_at IS NULL AND b.active = true AND b.severity IN ('blocked','fraud')
      AND (b.curator_id = p_curator_id OR (p_playlist_id IS NOT NULL AND b.playlist_id = p_playlist_id))
  ) THEN
    RAISE EXCEPTION 'This curator or playlist is currently unavailable for outreach';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = p_release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('approved','sent_to_stores','processing','live')
  ) THEN
    RAISE EXCEPTION 'Release is not eligible for curator outreach';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tracks t
    WHERE t.id = p_track_id
      AND t.release_id = p_release_id
      AND t.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Track does not belong to the selected release';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.playlist_curator_marketplace c
    WHERE c.id = p_curator_id
      AND c.deleted_at IS NULL
      AND c.active = true
      AND c.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Curator is not active in the marketplace';
  END IF;

  IF p_playlist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.curator_playlists p
    WHERE p.id = p_playlist_id
      AND p.curator_id = p_curator_id
      AND p.deleted_at IS NULL
      AND p.active = true
  ) THEN
    RAISE EXCEPTION 'Playlist does not belong to the selected curator';
  END IF;

  INSERT INTO public.curator_outreach_history (
    user_id,
    release_id,
    track_id,
    curator_id,
    playlist_id,
    pitch_story,
    status,
    submission_date,
    notes
  )
  VALUES (
    auth.uid(),
    p_release_id,
    p_track_id,
    p_curator_id,
    p_playlist_id,
    p_pitch_story,
    'submitted',
    now(),
    p_notes
  )
  RETURNING * INTO v_row;

  SELECT au.email, COALESCE(p.artist_name, p.full_name, au.email)
  INTO v_email, v_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.id = auth.uid();

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (auth.uid(), 'Curator pitch submitted', 'Your curator outreach has been submitted.', 'INFO', 'curator_outreach_history', v_row.id);
  END IF;

  IF v_email IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
    PERFORM public.queue_email(
      v_email,
      COALESCE(v_name, v_email),
      'Curator pitch submitted',
      'curator_pitch_submitted',
      jsonb_build_object('name', COALESCE(v_name, v_email), 'notes', COALESCE(p_notes, 'Your curator pitch was submitted.')),
      'curator_outreach_history',
      v_row.id
    );
  END IF;

  PERFORM public.refresh_curator_marketplace_stats(p_curator_id);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_curator_outreach_response(
  p_outreach_id UUID,
  p_status TEXT,
  p_curator_feedback TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.curator_outreach_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.curator_outreach_history;
  v_email TEXT;
  v_name TEXT;
  v_template TEXT;
  v_title TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF p_status NOT IN ('viewed','responded','accepted','rejected','expired') THEN
    RAISE EXCEPTION 'Unsupported outreach status %', p_status;
  END IF;

  UPDATE public.curator_outreach_history
  SET status = p_status,
      viewed_at = CASE WHEN p_status = 'viewed' THEN COALESCE(viewed_at, now()) ELSE viewed_at END,
      response_date = CASE WHEN p_status IN ('responded','accepted','rejected') THEN now() ELSE response_date END,
      curator_feedback = COALESCE(p_curator_feedback, curator_feedback),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_outreach_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Curator outreach % not found', p_outreach_id;
  END IF;

  v_template := CASE p_status
    WHEN 'accepted' THEN 'curator_pitch_accepted'
    WHEN 'rejected' THEN 'curator_pitch_rejected'
    WHEN 'responded' THEN 'curator_response_received'
    ELSE NULL
  END;
  v_title := CASE p_status
    WHEN 'accepted' THEN 'Curator accepted your pitch'
    WHEN 'rejected' THEN 'Curator rejected your pitch'
    WHEN 'responded' THEN 'Curator response received'
    ELSE NULL
  END;

  IF v_template IS NOT NULL THEN
    IF to_regclass('public.app_notifications') IS NOT NULL THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      VALUES (
        v_row.user_id,
        v_title,
        COALESCE(p_curator_feedback, 'Open your marketplace analytics for details.'),
        CASE WHEN p_status = 'rejected' THEN 'WARNING' ELSE 'SUCCESS' END,
        'curator_outreach_history',
        v_row.id
      );
    END IF;

    SELECT au.email, COALESCE(p.artist_name, p.full_name, au.email)
    INTO v_email, v_name
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.id = v_row.user_id;

    IF v_email IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
      PERFORM public.queue_email(
        v_email,
        COALESCE(v_name, v_email),
        v_title,
        v_template,
        jsonb_build_object('name', COALESCE(v_name, v_email), 'notes', COALESCE(p_curator_feedback, p_notes, v_title)),
        'curator_outreach_history',
        v_row.id
      );
    END IF;
  END IF;

  PERFORM public.refresh_curator_marketplace_stats(v_row.curator_id);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.curator_marketplace_notify_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'playlist_curator_marketplace'
     AND TG_OP = 'UPDATE'
     AND NEW.verified = true
     AND OLD.verified IS DISTINCT FROM NEW.verified
     AND to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    SELECT id, 'Curator verified', NEW.curator_name || ' is now verified in the marketplace.', 'SUCCESS', 'playlist_curator_marketplace', NEW.id
    FROM auth.users
    WHERE public.has_role(id, 'artist'::public.app_role);
  END IF;

  IF TG_TABLE_NAME = 'curator_playlists'
     AND TG_OP = 'INSERT'
     AND to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    SELECT id, 'Playlist added', NEW.playlist_name || ' was added to the curator marketplace.', 'INFO', 'curator_playlists', NEW.id
    FROM auth.users
    WHERE public.has_role(id, 'artist'::public.app_role);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_curator_marketplace_updated_at ON public.playlist_curator_marketplace;
CREATE TRIGGER trg_curator_marketplace_updated_at BEFORE UPDATE ON public.playlist_curator_marketplace
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_playlists_updated_at ON public.curator_playlists;
CREATE TRIGGER trg_curator_playlists_updated_at BEFORE UPDATE ON public.curator_playlists
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_contact_methods_updated_at ON public.curator_contact_methods;
CREATE TRIGGER trg_curator_contact_methods_updated_at BEFORE UPDATE ON public.curator_contact_methods
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_verification_requests_updated_at ON public.curator_verification_requests;
CREATE TRIGGER trg_curator_verification_requests_updated_at BEFORE UPDATE ON public.curator_verification_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_outreach_updated_at ON public.curator_outreach_history;
CREATE TRIGGER trg_curator_outreach_updated_at BEFORE UPDATE ON public.curator_outreach_history
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_blacklist_updated_at ON public.curator_blacklist;
CREATE TRIGGER trg_curator_blacklist_updated_at BEFORE UPDATE ON public.curator_blacklist
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_curator_favorites_updated_at ON public.curator_favorites;
CREATE TRIGGER trg_curator_favorites_updated_at BEFORE UPDATE ON public.curator_favorites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_curator_marketplace_audit ON public.playlist_curator_marketplace;
CREATE TRIGGER trg_curator_marketplace_audit AFTER INSERT OR UPDATE OR DELETE ON public.playlist_curator_marketplace
FOR EACH ROW EXECUTE FUNCTION public.curator_marketplace_audit_trigger();
DROP TRIGGER IF EXISTS trg_curator_playlists_audit ON public.curator_playlists;
CREATE TRIGGER trg_curator_playlists_audit AFTER INSERT OR UPDATE OR DELETE ON public.curator_playlists
FOR EACH ROW EXECUTE FUNCTION public.curator_marketplace_audit_trigger();
DROP TRIGGER IF EXISTS trg_curator_outreach_audit ON public.curator_outreach_history;
CREATE TRIGGER trg_curator_outreach_audit AFTER INSERT OR UPDATE OR DELETE ON public.curator_outreach_history
FOR EACH ROW EXECUTE FUNCTION public.curator_marketplace_audit_trigger();

DROP TRIGGER IF EXISTS trg_curator_playlists_stats ON public.curator_playlists;
CREATE TRIGGER trg_curator_playlists_stats AFTER INSERT OR UPDATE OR DELETE ON public.curator_playlists
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_marketplace_stats_trigger();
DROP TRIGGER IF EXISTS trg_curator_outreach_stats ON public.curator_outreach_history;
CREATE TRIGGER trg_curator_outreach_stats AFTER INSERT OR UPDATE OR DELETE ON public.curator_outreach_history
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_marketplace_stats_trigger();

DROP TRIGGER IF EXISTS trg_curator_marketplace_notify ON public.playlist_curator_marketplace;
CREATE TRIGGER trg_curator_marketplace_notify AFTER UPDATE OF verified ON public.playlist_curator_marketplace
FOR EACH ROW EXECUTE FUNCTION public.curator_marketplace_notify_trigger();
DROP TRIGGER IF EXISTS trg_curator_playlist_notify ON public.curator_playlists;
CREATE TRIGGER trg_curator_playlist_notify AFTER INSERT ON public.curator_playlists
FOR EACH ROW EXECUTE FUNCTION public.curator_marketplace_notify_trigger();

CREATE OR REPLACE VIEW public.curator_marketplace_playlist_cards
WITH (security_invoker = true) AS
SELECT
  p.id AS playlist_id,
  p.playlist_name,
  p.spotify_playlist_url,
  p.spotify_playlist_id,
  p.followers,
  p.genre,
  p.mood,
  p.territory AS playlist_territory,
  p.verified AS playlist_verified,
  p.last_checked_at,
  c.id AS curator_id,
  c.curator_name,
  c.company_name,
  c.email,
  c.instagram_url,
  c.tiktok_url,
  c.website_url,
  c.spotify_profile_url,
  c.country,
  c.territory AS curator_territory,
  c.bio,
  c.verified AS curator_verified,
  c.acceptance_rate,
  c.response_rate,
  c.average_response_days,
  c.total_playlists,
  c.total_followers,
  p.created_at
FROM public.curator_playlists p
JOIN public.playlist_curator_marketplace c ON c.id = p.curator_id
WHERE p.deleted_at IS NULL
  AND p.active = true
  AND c.deleted_at IS NULL
  AND c.active = true
  AND c.approval_status = 'approved';

CREATE OR REPLACE VIEW public.curator_outreach_artist_dashboard
WITH (security_invoker = true) AS
SELECT
  o.*,
  r.title AS release_title,
  t.title AS track_title,
  c.curator_name,
  c.company_name,
  c.acceptance_rate,
  c.response_rate,
  p.playlist_name,
  p.followers AS playlist_followers
FROM public.curator_outreach_history o
JOIN public.releases r ON r.id = o.release_id
JOIN public.tracks t ON t.id = o.track_id
JOIN public.playlist_curator_marketplace c ON c.id = o.curator_id
LEFT JOIN public.curator_playlists p ON p.id = o.playlist_id
WHERE o.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.curator_marketplace_admin_analytics
WITH (security_invoker = true) AS
SELECT
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL)::INTEGER AS total_curators,
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND c.verified = true)::INTEGER AS verified_curators,
  (SELECT COUNT(*) FROM public.curator_playlists p WHERE p.deleted_at IS NULL AND p.active = true)::INTEGER AS active_playlists,
  COALESCE((SELECT SUM(p.followers) FROM public.curator_playlists p WHERE p.deleted_at IS NULL AND p.active = true), 0)::INTEGER AS total_followers_represented,
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND c.created_at > now() - interval '30 days')::INTEGER AS marketplace_growth_30d
FROM public.playlist_curator_marketplace c
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

CREATE OR REPLACE FUNCTION public.email_template_html(
  p_template_type TEXT,
  p_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_template TEXT := lower(COALESCE(p_template_type, ''));
  v_name TEXT := public.email_escape_html(COALESCE(p_payload->>'name', 'Artist'));
  v_email TEXT := public.email_escape_html(COALESCE(p_payload->>'email', 'no email'));
  v_form_type TEXT := public.email_escape_html(COALESCE(p_payload->>'form_type', 'application'));
  v_notes TEXT := public.email_escape_html(COALESCE(p_payload->>'notes', ''));
  v_artist_id TEXT := public.email_escape_html(COALESCE(p_payload->>'artist_id', ''));
  v_body TEXT;
BEGIN
  IF v_template IN ('artist_pending', 'artist_request_pending', 'welcome') THEN
    IF v_template = 'welcome' THEN
      v_body := '<p>Hi ' || v_name || ',</p><p>Your account is ready. Start uploading songs, pitch playlists, and track your royalties from one dashboard.</p>';
      RETURN public.email_brand_layout('Welcome to TrackSyra, ' || v_name || '!', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
    END IF;
    v_body := '<p>Hi ' || v_name || ',</p><p>Your request is under review. We will notify you once approved.</p>';
    RETURN public.email_brand_layout('Your artist request is pending', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template IN ('artist_approved', 'artist_request_approved') THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your request is approved.</p><p>Your Artist ID is: <strong>' || v_artist_id || '</strong></p><p>You can now log in to your artist dashboard and upload releases.</p>';
    RETURN public.email_brand_layout('Your artist request is approved', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template IN ('artist_rejected', 'artist_request_rejected') THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your artist request was not approved at this time.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your artist request', v_body, 'Contact Support', 'mailto:support@tracksyra.com');
  ELSIF v_template = 'form_approved' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Great news. Your <strong>' || v_form_type || '</strong> has been approved.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Your application is approved', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
  ELSIF v_template = 'form_rejected' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Thanks for your interest in TrackSyra. After review, we are unable to move forward at this time.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Reason:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your application', v_body, 'Contact Support', 'mailto:support@tracksyra.com');
  ELSIF v_template = 'contact_form_notification' THEN
    v_body := '<p>Hi Admin,</p><p>A new TrackSyra contact form submission needs review.</p><p><strong>From:</strong> ' || v_name || ' (' || v_email || ')</p><p><strong>Type:</strong> ' || v_form_type || '</p>';
    RETURN public.email_brand_layout('New contact form submission', v_body, 'Open Admin', 'https://hello.tracksyra.com/admin');
  ELSIF v_template = 'admin_notification' THEN
    v_body := '<p>Hi Admin,</p><p>' || public.email_escape_html(COALESCE(p_payload->>'message', 'A TrackSyra admin event requires review.')) || '</p>';
    RETURN public.email_brand_layout('TrackSyra admin notification', v_body, 'Open Admin', 'https://hello.tracksyra.com/admin');
  ELSIF v_template = 'playlist_pitch_submitted' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your playlist pitch has entered editorial review. We will notify you when the curation team makes a decision.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Playlist pitch submitted', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard/playlist-pitching');
  ELSIF v_template IN ('pitch_approved', 'playlist_pitch_accepted') THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your playlist pitch was approved by our curation team.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Playlist pitch approved', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard/playlist-pitching');
  ELSIF v_template = 'pitch_rejected' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your playlist pitch was not selected this round.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your playlist pitch', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard/playlist-pitching');
  ELSIF v_template = 'playlist_pitch_update' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your playlist pitch status changed. Open your dashboard for the latest review and curator details.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Playlist pitch status updated', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard/playlist-pitching');
  ELSIF v_template = 'curator_pitch_submitted' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your curator outreach was submitted. We will track views, responses, and curator feedback in your marketplace dashboard.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Curator pitch submitted', v_body, 'Open Marketplace', 'https://hello.tracksyra.com/dashboard/curator-marketplace');
  ELSIF v_template = 'curator_pitch_accepted' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>A curator accepted your pitch. Open the curator marketplace to review the placement details and feedback.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('A curator accepted your pitch', v_body, 'View Outreach', 'https://hello.tracksyra.com/dashboard/curator-marketplace');
  ELSIF v_template = 'curator_pitch_rejected' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>Your curator pitch was not accepted this time. Review the feedback and use it to refine future outreach.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Update on your curator pitch', v_body, 'View Feedback', 'https://hello.tracksyra.com/dashboard/curator-marketplace');
  ELSIF v_template = 'curator_response_received' THEN
    v_body := '<p>Hi ' || v_name || ',</p><p>A curator responded to your pitch. The response and notes are available in your curator marketplace outreach history.</p>' ||
      CASE WHEN v_notes <> '' THEN '<p><strong>Note:</strong> ' || v_notes || '</p>' ELSE '' END;
    RETURN public.email_brand_layout('Curator response received', v_body, 'Open Outreach', 'https://hello.tracksyra.com/dashboard/curator-marketplace');
  END IF;

  v_body := '<p>Hi ' || v_name || ',</p><p>' || public.email_escape_html(COALESCE(NULLIF(p_payload->>'message', ''), 'Thanks for being part of TrackSyra.')) || '</p>';
  RETURN public.email_brand_layout('Hello from TrackSyra', v_body, 'Open Dashboard', 'https://hello.tracksyra.com/dashboard');
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_curator_marketplace TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_playlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_contact_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_verification_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_genres TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_territories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_outreach_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_blacklist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curator_favorites TO authenticated;
GRANT SELECT ON public.curator_marketplace_audit_logs TO authenticated;
GRANT SELECT ON public.curator_marketplace_playlist_cards TO authenticated;
GRANT SELECT ON public.curator_outreach_artist_dashboard TO authenticated;
GRANT SELECT ON public.curator_marketplace_admin_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_curator_outreach(UUID, UUID, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_curator_outreach_response(UUID, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.playlist_curator_marketplace IS 'Discoverable curator marketplace profiles with verification, performance metrics, and soft delete support.';
COMMENT ON TABLE public.curator_playlists IS 'Curator-owned playlist records exposed to artists for discovery and pitching.';
COMMENT ON TABLE public.curator_outreach_history IS 'Artist-to-curator outreach workflow with response tracking and rate limiting via RPC.';
