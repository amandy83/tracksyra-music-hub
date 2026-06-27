-- Free Playlist Pitching upgrade: free monthly limits, richer pitch metadata, curator matching, and placement confirmation.

ALTER TABLE public.playlist_pitches
  ADD COLUMN IF NOT EXISTS mood TEXT,
  ADD COLUMN IF NOT EXISTS similar_artists TEXT,
  ADD COLUMN IF NOT EXISTS artist_country TEXT,
  ADD COLUMN IF NOT EXISTS monthly_limit_role TEXT,
  ADD COLUMN IF NOT EXISTS free_pitch_month DATE,
  ADD COLUMN IF NOT EXISTS curator_match_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS curator_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.playlist_pitch_responses
  ADD COLUMN IF NOT EXISTS playlist_add_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS playlist_add_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_playlist_pitches_free_month
  ON public.playlist_pitches(user_id, free_pitch_month, status);
CREATE INDEX IF NOT EXISTS idx_playlist_pitches_matching
  ON public.playlist_pitches(genre, language, territory, artist_country);

CREATE OR REPLACE FUNCTION public.playlist_pitch_limit_for_user(p_user_id UUID)
RETURNS TABLE(role_name TEXT, monthly_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(p_user_id, 'publisher'::public.app_role) THEN
    RETURN QUERY SELECT 'publisher'::TEXT, NULL::INTEGER;
  ELSIF public.has_role(p_user_id, 'label'::public.app_role) THEN
    RETURN QUERY SELECT 'label'::TEXT, 20::INTEGER;
  ELSE
    RETURN QUERY SELECT 'artist'::TEXT, 2::INTEGER;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_free_playlist_pitch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_limit INTEGER;
  v_used INTEGER;
  v_month DATE;
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT role_name, monthly_limit INTO v_role, v_limit
    FROM public.playlist_pitch_limit_for_user(NEW.user_id);

    v_month := date_trunc('month', COALESCE(NEW.submitted_at, now()))::DATE;
    NEW.monthly_limit_role := v_role;
    NEW.free_pitch_month := v_month;

    IF v_limit IS NOT NULL THEN
      SELECT COUNT(*) INTO v_used
      FROM public.playlist_pitches
      WHERE user_id = NEW.user_id
        AND id IS DISTINCT FROM NEW.id
        AND free_pitch_month = v_month
        AND status IN ('submitted','under_review','approved','sent_to_curators','accepted','rejected');

      IF v_used >= v_limit THEN
        RAISE EXCEPTION 'Monthly free playlist pitch limit reached for role %. Limit: %', v_role, v_limit;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_free_playlist_pitch_limit ON public.playlist_pitches;
CREATE TRIGGER trg_validate_free_playlist_pitch_limit
BEFORE INSERT OR UPDATE OF status ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.validate_free_playlist_pitch_limit();

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
      COALESCE(cp.followers, c.total_followers, 0)::INTEGER AS estimated_reach,
      COALESCE(c.acceptance_rate, 0) AS acceptance_rate,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN lower(COALESCE(cp.genre, '')) = pitch.genre OR lower(COALESCE(cp.genre, '')) LIKE '%' || pitch.genre || '%' THEN 'genre' END,
        CASE WHEN pitch.mood <> '' AND (lower(COALESCE(cp.mood, '')) = pitch.mood OR pitch.mood LIKE '%' || lower(COALESCE(cp.mood, '')) || '%') THEN 'mood' END,
        CASE WHEN pitch.country <> '' AND lower(COALESCE(cp.territory, c.territory, c.country, '')) LIKE '%' || pitch.country || '%' THEN 'country' END,
        CASE WHEN pitch.language <> '' AND lower(COALESCE(c.metadata->>'language', cp.metadata->>'language', '')) LIKE '%' || pitch.language || '%' THEN 'language' END
      ], NULL) AS reasons,
      (
        CASE WHEN lower(COALESCE(cp.genre, '')) = pitch.genre OR lower(COALESCE(cp.genre, '')) LIKE '%' || pitch.genre || '%' THEN 35 ELSE 0 END
        + CASE WHEN pitch.mood <> '' AND (lower(COALESCE(cp.mood, '')) = pitch.mood OR pitch.mood LIKE '%' || lower(COALESCE(cp.mood, '')) || '%') THEN 25 ELSE 0 END
        + CASE WHEN pitch.country <> '' AND lower(COALESCE(cp.territory, c.territory, c.country, '')) LIKE '%' || pitch.country || '%' THEN 20 ELSE 0 END
        + CASE WHEN pitch.language <> '' AND lower(COALESCE(c.metadata->>'language', cp.metadata->>'language', '')) LIKE '%' || pitch.language || '%' THEN 10 ELSE 0 END
        + LEAST(COALESCE(c.acceptance_rate, 0), 100) * 0.10
      )::NUMERIC(6,2) AS score
    FROM pitch
    JOIN public.playlist_curator_marketplace c ON c.deleted_at IS NULL AND c.active = true AND c.approval_status = 'approved'
    LEFT JOIN public.curator_playlists cp ON cp.curator_id = c.id AND cp.deleted_at IS NULL AND cp.active = true
  )
  SELECT curator_id, curator_name, playlist_id, playlist_name, score, reasons, estimated_reach, acceptance_rate
  FROM candidates
  WHERE score > 0
  ORDER BY score DESC, estimated_reach DESC
  LIMIT COALESCE(NULLIF(p_limit, 0), 8);
$$;

CREATE OR REPLACE FUNCTION public.refresh_playlist_pitch_curator_recommendations(p_pitch_id UUID)
RETURNS public.playlist_pitches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.playlist_pitches;
BEGIN
  UPDATE public.playlist_pitches p
  SET curator_recommendations = COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.match_score DESC)
        FROM public.recommend_playlist_curators_for_pitch(p_pitch_id, 8) r
      ), '[]'::jsonb),
      curator_match_score = COALESCE((
        SELECT MAX(match_score)
        FROM public.recommend_playlist_curators_for_pitch(p_pitch_id, 8)
      ), 0),
      updated_at = now()
  WHERE p.id = p_pitch_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE VIEW public.free_playlist_pitch_usage
WITH (security_invoker = true) AS
SELECT
  auth.uid() AS user_id,
  limits.role_name,
  limits.monthly_limit,
  date_trunc('month', now())::DATE AS pitch_month,
  COALESCE(used.used_count, 0)::INTEGER AS used_count,
  CASE
    WHEN limits.monthly_limit IS NULL THEN NULL
    ELSE GREATEST(limits.monthly_limit - COALESCE(used.used_count, 0), 0)
  END AS remaining_count
FROM public.playlist_pitch_limit_for_user(auth.uid()) limits
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS used_count
  FROM public.playlist_pitches p
  WHERE p.user_id = auth.uid()
    AND p.free_pitch_month = date_trunc('month', now())::DATE
    AND p.status IN ('submitted','under_review','approved','sent_to_curators','accepted','rejected')
) used ON true;

CREATE OR REPLACE VIEW public.free_playlist_pitch_admin_analytics
WITH (security_invoker = true) AS
SELECT
  COUNT(*)::INTEGER AS total_pitches,
  COUNT(*) FILTER (WHERE status = 'accepted')::INTEGER AS accepted_pitches,
  COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_pitches,
  CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC / COUNT(*)::NUMERIC) * 100, 2) END AS pitch_success_rate,
  COALESCE(SUM(a.estimated_playlist_reach), 0)::INTEGER AS playlist_reach,
  COALESCE(AVG(a.curator_response_rate), 0)::NUMERIC(5,2) AS curator_acceptance_rate
FROM public.playlist_pitches p
LEFT JOIN public.playlist_pitch_analytics a ON a.pitch_id = p.id
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

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

DROP VIEW IF EXISTS public.playlist_pitch_artist_dashboard CASCADE;

CREATE VIEW public.playlist_pitch_artist_dashboard
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.release_id,
  p.track_id,
  p.genre,
  p.subgenre,
  p.mood,
  p.mood_tags,
  p.language,
  p.territory,
  p.artist_country,
  p.similar_artists,
  p.status,
  p.priority_score,
  p.admin_notes,
  p.rejection_reason,
  p.curator_match_score,
  p.curator_recommendations,
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

CREATE OR REPLACE FUNCTION public.refresh_playlist_pitch_recommendations_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    PERFORM public.refresh_playlist_pitch_curator_recommendations(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_playlist_pitch_recommendations ON public.playlist_pitches;
CREATE TRIGGER trg_refresh_playlist_pitch_recommendations
AFTER INSERT OR UPDATE OF genre, mood, mood_tags, language, territory, artist_country ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.refresh_playlist_pitch_recommendations_trigger();

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
    pitch_id, assignment_id, curator_id, response_status, response_notes,
    playlist_name, playlist_url, estimated_reach, playlist_add_confirmed,
    playlist_add_confirmed_at
  )
  VALUES (
    v_assignment.pitch_id, v_assignment.id, v_assignment.curator_id, p_response_status,
    p_response_notes, p_playlist_name, p_playlist_url, COALESCE(p_estimated_reach, 0),
    p_response_status = 'accepted',
    CASE WHEN p_response_status = 'accepted' THEN now() ELSE NULL END
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

  PERFORM public.recalculate_playlist_pitch_analytics(v_assignment.pitch_id);
  RETURN v_response;
END;
$$;

GRANT SELECT ON public.free_playlist_pitch_usage TO authenticated;
GRANT SELECT ON public.free_playlist_pitch_admin_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.playlist_pitch_limit_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recommend_playlist_curators_for_pitch(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_playlist_pitch_curator_recommendations(UUID) TO authenticated;
