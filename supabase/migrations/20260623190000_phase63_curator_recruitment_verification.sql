-- Phase 6.3: Curator recruitment, verification, registry, quality scoring, and verified-only routing.

ALTER TABLE public.playlist_curator_marketplace
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS curator_level TEXT NOT NULL DEFAULT 'bronze' CHECK (curator_level IN ('bronze','silver','gold','premium')),
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.curator_playlists
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','suspended')),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE public.curator_verification_requests
  ADD COLUMN IF NOT EXISTS playlist_url TEXT,
  ADD COLUMN IF NOT EXISTS spotify_playlist_id TEXT,
  ADD COLUMN IF NOT EXISTS playlist_followers INTEGER NOT NULL DEFAULT 0 CHECK (playlist_followers >= 0),
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playlist_public BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicate_of_playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minimum_followers_required INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'curator_verification_requests_status_check'
      AND conrelid = 'public.curator_verification_requests'::regclass
  ) THEN
    ALTER TABLE public.curator_verification_requests
      DROP CONSTRAINT curator_verification_requests_status_check;
  END IF;

  ALTER TABLE public.curator_verification_requests
    ADD CONSTRAINT curator_verification_requests_status_check
    CHECK (status IN ('pending','approved','rejected','suspended'));
END $$;

CREATE TABLE IF NOT EXISTS public.curator_verification_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  minimum_playlist_followers INTEGER NOT NULL DEFAULT 500 CHECK (minimum_playlist_followers >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.curator_verification_settings (id, minimum_playlist_followers)
VALUES (true, 500)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.curator_verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES public.curator_verification_requests(id) ON DELETE CASCADE,
  curator_id UUID REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('playlist_ownership','analytics_screenshot','identity','social_profile','other')),
  document_url TEXT NOT NULL,
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_playlist_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  playlist_url TEXT NOT NULL,
  spotify_playlist_id TEXT NOT NULL,
  playlist_name TEXT,
  playlist_followers INTEGER NOT NULL DEFAULT 0 CHECK (playlist_followers >= 0),
  is_public BOOLEAN NOT NULL DEFAULT true,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected','suspended')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  duplicate_of_registry_id UUID REFERENCES public.curator_playlist_registry(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  response_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (response_rate BETWEEN 0 AND 100),
  acceptance_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (acceptance_rate BETWEEN 0 AND 100),
  playlist_add_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (playlist_add_rate BETWEEN 0 AND 100),
  artist_satisfaction_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (artist_satisfaction_score BETWEEN 0 AND 100),
  average_response_hours NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (average_response_hours >= 0),
  quality_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  curator_level TEXT NOT NULL DEFAULT 'bronze' CHECK (curator_level IN ('bronze','silver','gold','premium')),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curator_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_registry_spotify_id
  ON public.curator_playlist_registry(lower(spotify_playlist_id));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_curator_registry_playlist_url
  ON public.curator_playlist_registry(lower(playlist_url));
CREATE INDEX IF NOT EXISTS idx_curator_marketplace_verified_route
  ON public.playlist_curator_marketplace(active, verified, suspended, approval_status, curator_level)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_curator_quality_scores_level
  ON public.curator_quality_scores(curator_level, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_curator_verification_documents_request
  ON public.curator_verification_documents(verification_request_id, created_at DESC);

INSERT INTO public.curator_playlist_registry (
  curator_id,
  playlist_id,
  playlist_url,
  spotify_playlist_id,
  playlist_name,
  playlist_followers,
  is_public,
  verification_status,
  verified_at
)
SELECT
  p.curator_id,
  p.id,
  p.spotify_playlist_url,
  COALESCE(NULLIF(p.spotify_playlist_id, ''), regexp_replace(p.spotify_playlist_url, '^.*/playlist/([^?]+).*$','\1')),
  p.playlist_name,
  p.followers,
  COALESCE(p.is_public, true),
  CASE WHEN p.verified = true THEN 'verified' ELSE 'pending' END,
  CASE WHEN p.verified = true THEN COALESCE(p.last_checked_at, now()) ELSE NULL END
FROM public.curator_playlists p
WHERE p.deleted_at IS NULL
  AND COALESCE(p.spotify_playlist_url, '') <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE public.curator_verification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_playlist_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_quality_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated view curator verification settings" ON public.curator_verification_settings;
CREATE POLICY "authenticated view curator verification settings" ON public.curator_verification_settings
FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins manage curator verification settings" ON public.curator_verification_settings;
CREATE POLICY "admins manage curator verification settings" ON public.curator_verification_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "users view own verification documents" ON public.curator_verification_documents;
CREATE POLICY "users view own verification documents" ON public.curator_verification_documents
FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.curator_verification_requests r
    WHERE r.id = verification_request_id AND r.requested_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "users create own verification documents" ON public.curator_verification_documents;
CREATE POLICY "users create own verification documents" ON public.curator_verification_documents
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.curator_verification_requests r
    WHERE r.id = verification_request_id AND r.requested_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage verification documents" ON public.curator_verification_documents;
CREATE POLICY "admins manage verification documents" ON public.curator_verification_documents
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "authenticated view verified playlist registry" ON public.curator_playlist_registry;
CREATE POLICY "authenticated view verified playlist registry" ON public.curator_playlist_registry
FOR SELECT USING (
  verification_status = 'verified'
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "admins manage playlist registry" ON public.curator_playlist_registry;
CREATE POLICY "admins manage playlist registry" ON public.curator_playlist_registry
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "authenticated view curator quality scores" ON public.curator_quality_scores;
CREATE POLICY "authenticated view curator quality scores" ON public.curator_quality_scores
FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "admins manage curator quality scores" ON public.curator_quality_scores;
CREATE POLICY "admins manage curator quality scores" ON public.curator_quality_scores
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.curator_level_for_score(p_score NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_score, 0) >= 90 THEN 'premium'
    WHEN COALESCE(p_score, 0) >= 75 THEN 'gold'
    WHEN COALESCE(p_score, 0) >= 50 THEN 'silver'
    ELSE 'bronze'
  END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_curator_quality_score(p_curator_id UUID)
RETURNS public.curator_quality_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.curator_quality_scores;
BEGIN
  INSERT INTO public.curator_quality_scores (
    curator_id,
    response_rate,
    acceptance_rate,
    playlist_add_rate,
    artist_satisfaction_score,
    average_response_hours,
    quality_score,
    curator_level,
    calculated_at
  )
  WITH stats AS (
    SELECT
      p_curator_id AS curator_id,
      COUNT(d.id)::NUMERIC AS delivered,
      COUNT(d.id) FILTER (WHERE d.status IN ('reviewed','accepted','rejected','more_info_requested','playlist_added'))::NUMERIC AS responded,
      COUNT(d.id) FILTER (WHERE d.status IN ('accepted','playlist_added'))::NUMERIC AS accepted,
      COUNT(a.id)::NUMERIC AS playlist_added,
      COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(d.accepted_at, d.rejected_at, d.more_info_requested_at, d.reviewed_at) - d.delivered_at)) / 3600) FILTER (WHERE d.delivered_at IS NOT NULL), 0)::NUMERIC(10,2) AS avg_hours,
      COALESCE(AVG(NULLIF((a.evidence_metadata->>'artist_satisfaction_score')::NUMERIC, 0)), 0)::NUMERIC(5,2) AS satisfaction
    FROM public.curator_deliveries d
    LEFT JOIN public.curator_playlist_additions a ON a.delivery_id = d.id
    WHERE d.curator_id = p_curator_id
  ),
  scored AS (
    SELECT
      curator_id,
      CASE WHEN delivered = 0 THEN 0 ELSE ROUND((responded / delivered) * 100, 2) END AS response_rate,
      CASE WHEN responded = 0 THEN 0 ELSE ROUND((accepted / responded) * 100, 2) END AS acceptance_rate,
      CASE WHEN delivered = 0 THEN 0 ELSE ROUND((playlist_added / delivered) * 100, 2) END AS playlist_add_rate,
      satisfaction AS artist_satisfaction_score,
      avg_hours AS average_response_hours
    FROM stats
  )
  SELECT
    curator_id,
    response_rate,
    acceptance_rate,
    playlist_add_rate,
    artist_satisfaction_score,
    average_response_hours,
    LEAST(100, ROUND(
      (response_rate * 0.30)
      + (acceptance_rate * 0.25)
      + (playlist_add_rate * 0.30)
      + (artist_satisfaction_score * 0.15),
      2
    )) AS quality_score,
    public.curator_level_for_score(LEAST(100, ROUND(
      (response_rate * 0.30)
      + (acceptance_rate * 0.25)
      + (playlist_add_rate * 0.30)
      + (artist_satisfaction_score * 0.15),
      2
    ))) AS curator_level,
    now()
  FROM scored
  ON CONFLICT (curator_id) DO UPDATE
  SET response_rate = EXCLUDED.response_rate,
      acceptance_rate = EXCLUDED.acceptance_rate,
      playlist_add_rate = EXCLUDED.playlist_add_rate,
      artist_satisfaction_score = EXCLUDED.artist_satisfaction_score,
      average_response_hours = EXCLUDED.average_response_hours,
      quality_score = EXCLUDED.quality_score,
      curator_level = EXCLUDED.curator_level,
      calculated_at = now(),
      updated_at = now()
  RETURNING * INTO v_row;

  UPDATE public.playlist_curator_marketplace
  SET response_rate = v_row.response_rate,
      acceptance_rate = v_row.acceptance_rate,
      average_response_days = CASE WHEN v_row.average_response_hours = 0 THEN 0 ELSE ROUND(v_row.average_response_hours / 24, 2) END,
      curator_level = v_row.curator_level,
      updated_at = now()
  WHERE id = p_curator_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_curator_quality_score_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_curator_quality_score(COALESCE(NEW.curator_id, OLD.curator_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_curator_deliveries_quality_score ON public.curator_deliveries;
CREATE TRIGGER trg_curator_deliveries_quality_score
AFTER INSERT OR UPDATE OR DELETE ON public.curator_deliveries
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_quality_score_trigger();

DROP TRIGGER IF EXISTS trg_curator_playlist_additions_quality_score ON public.curator_playlist_additions;
CREATE TRIGGER trg_curator_playlist_additions_quality_score
AFTER INSERT OR UPDATE OR DELETE ON public.curator_playlist_additions
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_quality_score_trigger();

CREATE OR REPLACE FUNCTION public.create_curator_verification_request(
  p_curator_name TEXT,
  p_playlist_url TEXT,
  p_spotify_playlist_id TEXT,
  p_playlist_followers INTEGER,
  p_contact_email TEXT,
  p_social_links JSONB DEFAULT '{}'::jsonb,
  p_company_name TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_territory TEXT DEFAULT NULL,
  p_playlist_name TEXT DEFAULT NULL,
  p_playlist_public BOOLEAN DEFAULT true
)
RETURNS public.curator_verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_followers INTEGER;
  v_duplicate UUID;
  v_curator public.playlist_curator_marketplace;
  v_request public.curator_verification_requests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT minimum_playlist_followers INTO v_min_followers
  FROM public.curator_verification_settings
  WHERE id = true;
  v_min_followers := COALESCE(v_min_followers, 500);

  IF COALESCE(trim(p_playlist_url), '') = '' OR COALESCE(trim(p_spotify_playlist_id), '') = '' THEN
    RAISE EXCEPTION 'Playlist URL and Spotify playlist ID are required';
  END IF;
  IF COALESCE(trim(p_contact_email), '') = '' THEN
    RAISE EXCEPTION 'Contact email is required';
  END IF;
  IF COALESCE(p_playlist_public, false) = false THEN
    RAISE EXCEPTION 'Playlist must be public';
  END IF;
  IF COALESCE(p_playlist_followers, 0) < v_min_followers THEN
    RAISE EXCEPTION 'Playlist followers must be at least %', v_min_followers;
  END IF;

  SELECT id INTO v_duplicate
  FROM public.curator_playlist_registry
  WHERE lower(spotify_playlist_id) = lower(p_spotify_playlist_id)
     OR lower(playlist_url) = lower(p_playlist_url)
  LIMIT 1;

  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate playlist already registered';
  END IF;

  INSERT INTO public.playlist_curator_marketplace (
    curator_name, company_name, email, country, territory, social_links,
    approval_status, verified, active, suspended, created_by
  )
  VALUES (
    trim(p_curator_name), p_company_name, trim(p_contact_email), p_country, p_territory, COALESCE(p_social_links, '{}'::jsonb),
    'pending', false, false, false, auth.uid()
  )
  RETURNING * INTO v_curator;

  INSERT INTO public.curator_verification_requests (
    curator_id, requested_by, status, evidence_url, evidence_notes,
    playlist_url, spotify_playlist_id, playlist_followers, contact_email,
    social_links, playlist_public, minimum_followers_required
  )
  VALUES (
    v_curator.id, auth.uid(), 'pending', p_playlist_url,
    COALESCE(p_playlist_name, 'Spotify playlist verification'),
    p_playlist_url, p_spotify_playlist_id, p_playlist_followers, p_contact_email,
    COALESCE(p_social_links, '{}'::jsonb), p_playlist_public, v_min_followers
  )
  RETURNING * INTO v_request;

  INSERT INTO public.curator_playlist_registry (
    curator_id, playlist_url, spotify_playlist_id, playlist_name,
    playlist_followers, is_public, verification_status
  )
  VALUES (
    v_curator.id, p_playlist_url, p_spotify_playlist_id, p_playlist_name,
    p_playlist_followers, p_playlist_public, 'pending'
  );

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_curator_verification_request(
  p_request_id UUID,
  p_action TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS public.curator_verification_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.curator_verification_requests;
  v_registry public.curator_playlist_registry;
  v_playlist public.curator_playlists;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  IF p_action NOT IN ('approve','reject','suspend') THEN
    RAISE EXCEPTION 'Unsupported verification action %', p_action;
  END IF;

  SELECT * INTO v_request
  FROM public.curator_verification_requests
  WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Curator verification request % not found', p_request_id;
  END IF;

  IF p_action = 'approve' THEN
    SELECT * INTO v_playlist
    FROM public.curator_playlists
    WHERE deleted_at IS NULL
      AND lower(spotify_playlist_url) = lower(v_request.playlist_url)
    LIMIT 1;

    IF v_playlist.id IS NULL THEN
      INSERT INTO public.curator_playlists (
        curator_id, playlist_name, spotify_playlist_url, spotify_playlist_id,
        followers, active, verified, is_public, verification_status, verification_notes
      )
      VALUES (
        v_request.curator_id,
        COALESCE(v_request.evidence_notes, 'Verified playlist'),
        v_request.playlist_url,
        v_request.spotify_playlist_id,
        v_request.playlist_followers,
        true,
        true,
        v_request.playlist_public,
        'verified',
        p_admin_notes
      )
      RETURNING * INTO v_playlist;
    ELSE
      UPDATE public.curator_playlists
      SET verified = true,
          active = true,
          is_public = true,
          verification_status = 'verified',
          verification_notes = p_admin_notes,
          updated_at = now()
      WHERE id = v_playlist.id
      RETURNING * INTO v_playlist;
    END IF;

    UPDATE public.curator_playlist_registry
    SET playlist_id = COALESCE(v_playlist.id, playlist_id),
        verification_status = 'verified',
        verified_at = now(),
        verified_by = auth.uid(),
        updated_at = now()
    WHERE curator_id = v_request.curator_id
      AND lower(spotify_playlist_id) = lower(v_request.spotify_playlist_id)
    RETURNING * INTO v_registry;

    UPDATE public.playlist_curator_marketplace
    SET approval_status = 'approved',
        verified = true,
        active = true,
        suspended = false,
        suspension_reason = NULL,
        verified_by = auth.uid(),
        verified_at = now(),
        email = COALESCE(email, v_request.contact_email),
        social_links = COALESCE(NULLIF(v_request.social_links, '{}'::jsonb), social_links),
        updated_at = now()
    WHERE id = v_request.curator_id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.curator_playlist_registry
    SET verification_status = 'rejected',
        updated_at = now()
    WHERE curator_id = v_request.curator_id
      AND lower(spotify_playlist_id) = lower(v_request.spotify_playlist_id);

    UPDATE public.playlist_curator_marketplace
    SET approval_status = 'rejected',
        verified = false,
        active = false,
        rejection_reason = p_admin_notes,
        updated_at = now()
    WHERE id = v_request.curator_id;
  ELSE
    UPDATE public.curator_playlist_registry
    SET verification_status = 'suspended',
        updated_at = now()
    WHERE curator_id = v_request.curator_id
      AND lower(spotify_playlist_id) = lower(v_request.spotify_playlist_id);

    UPDATE public.curator_playlists
    SET active = false,
        verification_status = 'suspended',
        verification_notes = p_admin_notes,
        updated_at = now()
    WHERE curator_id = v_request.curator_id;

    UPDATE public.playlist_curator_marketplace
    SET suspended = true,
        active = false,
        suspended_at = now(),
        suspended_by = auth.uid(),
        suspension_reason = p_admin_notes,
        updated_at = now()
    WHERE id = v_request.curator_id;
  END IF;

  UPDATE public.curator_verification_requests
  SET status = CASE
        WHEN p_action = 'approve' THEN 'approved'
        WHEN p_action = 'suspend' THEN 'suspended'
        ELSE 'rejected'
      END,
      admin_notes = p_admin_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      suspended_at = CASE WHEN p_action = 'suspend' THEN now() ELSE suspended_at END,
      suspended_by = CASE WHEN p_action = 'suspend' THEN auth.uid() ELSE suspended_by END,
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.recommend_playlist_curators_for_pitch(p_pitch_id UUID, p_limit INTEGER DEFAULT 8)
RETURNS TABLE(
  curator_id UUID,
  curator_name TEXT,
  playlist_id UUID,
  playlist_name TEXT,
  match_score NUMERIC,
  match_reasons TEXT[],
  estimated_reach INTEGER,
  acceptance_rate NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pitch AS (
    SELECT
      id,
      lower(COALESCE(genre, '')) AS genre,
      lower(COALESCE(mood, array_to_string(mood_tags, ','), '')) AS mood,
      lower(COALESCE(language, '')) AS language,
      lower(COALESCE(artist_country, territory, '')) AS country
    FROM public.playlist_pitches
    WHERE id = p_pitch_id
  ),
  candidates AS (
    SELECT
      c.id AS curator_id,
      c.curator_name,
      cp.id AS playlist_id,
      cp.playlist_name,
      COALESCE(cp.followers, r.playlist_followers, c.total_followers, 0)::INTEGER AS estimated_reach,
      COALESCE(q.acceptance_rate, c.acceptance_rate, 0) AS acceptance_rate,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN lower(COALESCE(cp.genre, '')) = pitch.genre OR lower(COALESCE(cp.genre, '')) LIKE '%' || pitch.genre || '%' THEN 'genre' END,
        CASE WHEN pitch.mood <> '' AND (lower(COALESCE(cp.mood, '')) = pitch.mood OR pitch.mood LIKE '%' || lower(COALESCE(cp.mood, '')) || '%') THEN 'mood' END,
        CASE WHEN pitch.country <> '' AND lower(COALESCE(cp.territory, c.territory, c.country, '')) LIKE '%' || pitch.country || '%' THEN 'country' END,
        CASE WHEN pitch.language <> '' AND lower(COALESCE(c.metadata->>'language', cp.metadata->>'language', '')) LIKE '%' || pitch.language || '%' THEN 'language' END,
        CASE WHEN c.verified THEN 'verified' END,
        CASE WHEN COALESCE(q.curator_level, c.curator_level) IN ('gold','premium') THEN COALESCE(q.curator_level, c.curator_level) END
      ], NULL) AS reasons,
      (
        CASE WHEN lower(COALESCE(cp.genre, '')) = pitch.genre OR lower(COALESCE(cp.genre, '')) LIKE '%' || pitch.genre || '%' THEN 35 ELSE 0 END
        + CASE WHEN pitch.mood <> '' AND (lower(COALESCE(cp.mood, '')) = pitch.mood OR pitch.mood LIKE '%' || lower(COALESCE(cp.mood, '')) || '%') THEN 20 ELSE 0 END
        + CASE WHEN pitch.country <> '' AND lower(COALESCE(cp.territory, c.territory, c.country, '')) LIKE '%' || pitch.country || '%' THEN 15 ELSE 0 END
        + CASE WHEN pitch.language <> '' AND lower(COALESCE(c.metadata->>'language', cp.metadata->>'language', '')) LIKE '%' || pitch.language || '%' THEN 10 ELSE 0 END
        + LEAST(COALESCE(q.acceptance_rate, c.acceptance_rate, 0), 100) * 0.10
        + LEAST(COALESCE(q.quality_score, 0), 100) * 0.10
      )::NUMERIC(6,2) AS score
    FROM pitch
    JOIN public.playlist_curator_marketplace c
      ON c.deleted_at IS NULL
      AND c.active = true
      AND c.verified = true
      AND c.suspended = false
      AND c.approval_status = 'approved'
    JOIN public.curator_playlists cp
      ON cp.curator_id = c.id
      AND cp.deleted_at IS NULL
      AND cp.active = true
      AND cp.verified = true
      AND cp.is_public = true
      AND cp.verification_status = 'verified'
    JOIN public.curator_playlist_registry r
      ON r.curator_id = c.id
      AND r.playlist_id = cp.id
      AND r.is_public = true
      AND r.verification_status = 'verified'
    LEFT JOIN public.curator_quality_scores q ON q.curator_id = c.id
  )
  SELECT curator_id, curator_name, playlist_id, playlist_name, score, reasons, estimated_reach, acceptance_rate
  FROM candidates
  WHERE score > 0
  ORDER BY score DESC, estimated_reach DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 8);
$$;

CREATE OR REPLACE FUNCTION public.deliver_playlist_pitch_to_matched_curators(p_pitch_id UUID, p_limit INTEGER DEFAULT 8)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch public.playlist_pitches;
  v_count INTEGER := 0;
BEGIN
  SELECT * INTO v_pitch FROM public.playlist_pitches WHERE id = p_pitch_id;
  IF v_pitch.id IS NULL THEN
    RAISE EXCEPTION 'Playlist pitch % not found', p_pitch_id;
  END IF;
  IF v_pitch.status NOT IN ('submitted','under_review','approved','sent_to_curators') THEN
    RAISE EXCEPTION 'Pitch % is not deliverable from status %', p_pitch_id, v_pitch.status;
  END IF;

  PERFORM public.refresh_playlist_pitch_curator_recommendations(p_pitch_id);

  INSERT INTO public.curator_deliveries (
    pitch_id, user_id, release_id, track_id, curator_id, playlist_id, curator_account_id,
    match_score, match_reasons, estimated_reach, delivery_channel, status,
    matched_at, delivered_at, created_by
  )
  SELECT
    v_pitch.id, v_pitch.user_id, v_pitch.release_id, v_pitch.track_id,
    r.curator_id, r.playlist_id, c.created_by,
    r.match_score, COALESCE(r.match_reasons, '{}'::text[]), COALESCE(r.estimated_reach, 0),
    'curator_marketplace', 'delivered',
    now(), now(), auth.uid()
  FROM public.recommend_playlist_curators_for_pitch(p_pitch_id, p_limit) r
  JOIN public.playlist_curator_marketplace c ON c.id = r.curator_id
  WHERE c.deleted_at IS NULL
    AND c.active = true
    AND c.verified = true
    AND c.suspended = false
    AND c.approval_status = 'approved'
  ON CONFLICT (pitch_id, curator_id, playlist_id) DO UPDATE
  SET match_score = EXCLUDED.match_score,
      match_reasons = EXCLUDED.match_reasons,
      estimated_reach = EXCLUDED.estimated_reach,
      status = CASE WHEN curator_deliveries.status = 'submitted' THEN 'delivered' ELSE curator_deliveries.status END,
      delivered_at = COALESCE(curator_deliveries.delivered_at, now()),
      updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF NOT EXISTS (SELECT 1 FROM public.curator_deliveries WHERE pitch_id = p_pitch_id AND status IN ('delivered','opened','reviewed','accepted','rejected','more_info_requested','playlist_added')) THEN
    RAISE EXCEPTION 'No verified active Curator Marketplace accounts matched pitch %. Submission is not complete.', p_pitch_id;
  END IF;

  UPDATE public.playlist_pitches
  SET status = 'sent_to_curators',
      sent_to_curators_at = COALESCE(sent_to_curators_at, now()),
      updated_at = now()
  WHERE id = p_pitch_id;

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (v_pitch.user_id, 'Pitch delivered', 'Your pitch was delivered to verified Curator Marketplace accounts.', 'playlist_pitch_delivered', 'playlist_pitches', p_pitch_id);
  END IF;

  PERFORM public.recalculate_playlist_pitch_analytics(p_pitch_id);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_assign_playlist_pitch_curator(
  p_pitch_id UUID,
  p_curator_id UUID,
  p_playlist_id UUID DEFAULT NULL,
  p_internal_notes TEXT DEFAULT NULL
)
RETURNS public.curator_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch public.playlist_pitches;
  v_curator public.playlist_curator_marketplace;
  v_playlist public.curator_playlists;
  v_delivery public.curator_deliveries;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;
  SELECT * INTO v_pitch FROM public.playlist_pitches WHERE id = p_pitch_id;
  SELECT * INTO v_curator
  FROM public.playlist_curator_marketplace
  WHERE id = p_curator_id
    AND deleted_at IS NULL
    AND active = true
    AND verified = true
    AND suspended = false
    AND approval_status = 'approved';
  IF v_pitch.id IS NULL OR v_curator.id IS NULL THEN
    RAISE EXCEPTION 'Pitch or verified active marketplace curator not found';
  END IF;
  IF p_playlist_id IS NOT NULL THEN
    SELECT * INTO v_playlist
    FROM public.curator_playlists
    WHERE id = p_playlist_id
      AND curator_id = p_curator_id
      AND deleted_at IS NULL
      AND active = true
      AND verified = true
      AND is_public = true
      AND verification_status = 'verified';
    IF v_playlist.id IS NULL THEN
      RAISE EXCEPTION 'Playlist % is not verified and active for curator %', p_playlist_id, p_curator_id;
    END IF;
  END IF;

  INSERT INTO public.curator_deliveries (
    pitch_id, user_id, release_id, track_id, curator_id, playlist_id, curator_account_id,
    match_score, match_reasons, estimated_reach, delivery_channel, status, internal_notes,
    matched_at, delivered_at, created_by
  )
  VALUES (
    v_pitch.id, v_pitch.user_id, v_pitch.release_id, v_pitch.track_id, v_curator.id, p_playlist_id, v_curator.created_by,
    100, ARRAY['admin_force_assign','verified_curator'], COALESCE(v_playlist.followers, v_curator.total_followers, 0),
    'admin_force_assign', 'delivered', p_internal_notes, now(), now(), auth.uid()
  )
  ON CONFLICT (pitch_id, curator_id, playlist_id) DO UPDATE
  SET internal_notes = COALESCE(EXCLUDED.internal_notes, curator_deliveries.internal_notes),
      status = CASE WHEN curator_deliveries.status = 'submitted' THEN 'delivered' ELSE curator_deliveries.status END,
      delivered_at = COALESCE(curator_deliveries.delivered_at, now()),
      updated_at = now()
  RETURNING * INTO v_delivery;

  UPDATE public.playlist_pitches
  SET status = 'sent_to_curators',
      sent_to_curators_at = COALESCE(sent_to_curators_at, now()),
      updated_at = now()
  WHERE id = p_pitch_id;

  PERFORM public.recalculate_playlist_pitch_analytics(p_pitch_id);
  RETURN v_delivery;
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
      AND c.verified = true
      AND c.suspended = false
      AND c.approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Curator is not verified and active in the marketplace';
  END IF;

  IF p_playlist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.curator_playlists p
    JOIN public.curator_playlist_registry r
      ON r.playlist_id = p.id
      AND r.verification_status = 'verified'
      AND r.is_public = true
    WHERE p.id = p_playlist_id
      AND p.curator_id = p_curator_id
      AND p.deleted_at IS NULL
      AND p.active = true
      AND p.verified = true
      AND p.is_public = true
      AND p.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Playlist is not verified and active for the selected curator';
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
    VALUES (auth.uid(), 'Curator pitch submitted', 'Your curator outreach has been submitted to a verified curator.', 'INFO', 'curator_outreach_history', v_row.id);
  END IF;

  IF v_email IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
    PERFORM public.queue_email(
      v_email,
      COALESCE(v_name, v_email),
      'Curator pitch submitted',
      'curator_pitch_submitted',
      jsonb_build_object('name', COALESCE(v_name, v_email), 'notes', COALESCE(p_notes, 'Your curator pitch was submitted to a verified curator.')),
      'curator_outreach_history',
      v_row.id
    );
  END IF;

  PERFORM public.refresh_curator_marketplace_stats(p_curator_id);
  RETURN v_row;
END;
$$;

DROP VIEW IF EXISTS public.curator_marketplace_playlist_cards CASCADE;

CREATE VIEW public.curator_marketplace_playlist_cards
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
  c.curator_level,
  c.suspended,
  p.created_at
FROM public.curator_playlists p
JOIN public.playlist_curator_marketplace c ON c.id = p.curator_id
JOIN public.curator_playlist_registry r
  ON r.playlist_id = p.id
  AND r.verification_status = 'verified'
  AND r.is_public = true
WHERE p.deleted_at IS NULL
  AND p.active = true
  AND p.verified = true
  AND p.is_public = true
  AND p.verification_status = 'verified'
  AND c.deleted_at IS NULL
  AND c.active = true
  AND c.verified = true
  AND c.suspended = false
  AND c.approval_status = 'approved';

DROP VIEW IF EXISTS public.curator_marketplace_admin_analytics CASCADE;

CREATE VIEW public.curator_marketplace_admin_analytics
WITH (security_invoker = true) AS
SELECT
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL)::INTEGER AS total_curators,
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND c.verified = true AND c.suspended = false)::INTEGER AS verified_curators,
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND c.active = true AND c.suspended = false)::INTEGER AS active_curators,
  (SELECT COUNT(*) FROM public.curator_playlists p WHERE p.deleted_at IS NULL AND p.active = true AND p.verified = true AND p.verification_status = 'verified')::INTEGER AS active_playlists,
  COALESCE((SELECT SUM(p.followers) FROM public.curator_playlists p WHERE p.deleted_at IS NULL AND p.active = true AND p.verified = true AND p.verification_status = 'verified'), 0)::INTEGER AS total_followers_represented,
  COALESCE((SELECT AVG(average_response_hours) FROM public.curator_quality_scores), 0)::NUMERIC(10,2) AS average_response_hours,
  COUNT(*) FILTER (WHERE c.deleted_at IS NULL AND c.created_at > now() - interval '30 days')::INTEGER AS marketplace_growth_30d
FROM public.playlist_curator_marketplace c
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

CREATE OR REPLACE VIEW public.curator_verification_admin_queue
WITH (security_invoker = true) AS
SELECT
  r.*,
  c.curator_name,
  c.company_name,
  c.email AS curator_email,
  c.verified,
  c.active,
  c.suspended,
  qs.quality_score,
  qs.curator_level
FROM public.curator_verification_requests r
LEFT JOIN public.playlist_curator_marketplace c ON c.id = r.curator_id
LEFT JOIN public.curator_quality_scores qs ON qs.curator_id = r.curator_id
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

GRANT SELECT ON public.curator_verification_settings TO authenticated;
GRANT SELECT, INSERT ON public.curator_verification_documents TO authenticated;
GRANT SELECT ON public.curator_playlist_registry TO authenticated;
GRANT SELECT ON public.curator_quality_scores TO authenticated;
GRANT SELECT ON public.curator_verification_admin_queue TO authenticated;
GRANT SELECT ON public.curator_marketplace_playlist_cards TO authenticated;
GRANT SELECT ON public.curator_marketplace_admin_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_curator_verification_request(TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_curator_verification_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_curator_quality_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_curator_outreach(UUID, UUID, UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.curator_verification_documents IS 'Supporting verification documents for curator onboarding requests.';
COMMENT ON TABLE public.curator_playlist_registry IS 'Canonical verified playlist registry with duplicate prevention and public/follower checks.';
COMMENT ON TABLE public.curator_quality_scores IS 'Curator quality scoring by response, acceptance, playlist add rate, satisfaction, and response time.';
