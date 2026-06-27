-- Real curator delivery system for free playlist pitching.
-- A pitch is only production-complete after records are delivered to approved Curator Marketplace accounts.

ALTER TABLE public.playlist_pitches
  ADD COLUMN IF NOT EXISTS spotify_url TEXT,
  ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.curator_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  curator_account_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  match_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  match_reasons TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  estimated_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_reach >= 0),
  delivery_channel TEXT NOT NULL DEFAULT 'curator_marketplace' CHECK (delivery_channel IN ('curator_marketplace','admin_force_assign')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','matched','delivered','opened','reviewed','accepted','rejected','more_info_requested','playlist_added')),
  internal_notes TEXT,
  matched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  more_info_requested_at TIMESTAMPTZ,
  playlist_added_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pitch_id, curator_id, playlist_id)
);

CREATE TABLE IF NOT EXISTS public.curator_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.curator_deliveries(id) ON DELETE CASCADE,
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  response_status TEXT NOT NULL CHECK (response_status IN ('opened','reviewed','accepted','rejected','request_more_information')),
  response_notes TEXT,
  requested_information TEXT,
  curator_confirmation BOOLEAN NOT NULL DEFAULT false,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.curator_playlist_additions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.curator_deliveries(id) ON DELETE CASCADE,
  response_id UUID REFERENCES public.curator_responses(id) ON DELETE SET NULL,
  pitch_id UUID NOT NULL REFERENCES public.playlist_pitches(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_url TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  playlist_name TEXT,
  estimated_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_reach >= 0),
  curator_confirmation BOOLEAN NOT NULL DEFAULT true CHECK (curator_confirmation = true),
  curator_confirmation_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_curator_deliveries_pitch ON public.curator_deliveries(pitch_id, status);
CREATE INDEX IF NOT EXISTS idx_curator_deliveries_curator ON public.curator_deliveries(curator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curator_responses_delivery ON public.curator_responses(delivery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curator_playlist_additions_pitch ON public.curator_playlist_additions(pitch_id, created_at DESC);

ALTER TABLE public.curator_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curator_playlist_additions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own curator deliveries" ON public.curator_deliveries;
CREATE POLICY "artists view own curator deliveries" ON public.curator_deliveries
FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role) OR curator_account_id = auth.uid());

DROP POLICY IF EXISTS "admins manage curator deliveries" ON public.curator_deliveries;
CREATE POLICY "admins manage curator deliveries" ON public.curator_deliveries
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "curator accounts update own deliveries" ON public.curator_deliveries;
CREATE POLICY "curator accounts update own deliveries" ON public.curator_deliveries
FOR UPDATE
USING (curator_account_id = auth.uid())
WITH CHECK (curator_account_id = auth.uid());

DROP POLICY IF EXISTS "artists view own curator responses" ON public.curator_responses;
CREATE POLICY "artists view own curator responses" ON public.curator_responses
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.curator_deliveries d WHERE d.id = delivery_id AND (d.user_id = auth.uid() OR d.curator_account_id = auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "admins manage curator responses" ON public.curator_responses;
CREATE POLICY "admins manage curator responses" ON public.curator_responses
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own curator playlist additions" ON public.curator_playlist_additions;
CREATE POLICY "artists view own curator playlist additions" ON public.curator_playlist_additions
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.curator_deliveries d WHERE d.id = delivery_id AND (d.user_id = auth.uid() OR d.curator_account_id = auth.uid()))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "admins manage curator playlist additions" ON public.curator_playlist_additions;
CREATE POLICY "admins manage curator playlist additions" ON public.curator_playlist_additions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.validate_real_playlist_pitch_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release public.releases;
  v_track public.tracks;
  v_errors JSONB := '[]'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('submitted','under_review','approved','sent_to_curators') THEN
      SELECT * INTO v_release FROM public.releases WHERE id = NEW.release_id;
      SELECT * INTO v_track FROM public.tracks WHERE id = NEW.track_id;

      IF v_release.id IS NULL OR v_release.user_id IS DISTINCT FROM NEW.user_id THEN
        v_errors := v_errors || '["release_not_found"]'::jsonb;
      ELSIF v_release.status::text NOT IN ('approved','sent_to_stores','processing','live') THEN
        v_errors := v_errors || '["release_not_approved"]'::jsonb;
      END IF;

      IF v_track.id IS NULL OR v_track.release_id IS DISTINCT FROM NEW.release_id THEN
        v_errors := v_errors || '["track_not_found"]'::jsonb;
      END IF;

      IF v_release.id IS NOT NULL AND COALESCE(v_release.cover_art_url, '') = '' THEN
        v_errors := v_errors || '["artwork_missing"]'::jsonb;
      END IF;

      IF COALESCE(NEW.spotify_url, NEW.spotify_uri, '') = '' THEN
        v_errors := v_errors || '["spotify_url_missing"]'::jsonb;
      END IF;

      IF jsonb_array_length(v_errors) > 0 THEN
        NEW.validation_errors := v_errors;
        RAISE EXCEPTION 'Playlist pitch validation failed: %', v_errors::text;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_real_playlist_pitch_submission ON public.playlist_pitches;
CREATE TRIGGER trg_validate_real_playlist_pitch_submission
BEFORE INSERT OR UPDATE OF status ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.validate_real_playlist_pitch_submission();

CREATE OR REPLACE FUNCTION public.deliver_playlist_pitch_to_matched_curators(p_pitch_id UUID, p_limit INTEGER DEFAULT 8)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch public.playlist_pitches;
  v_count INTEGER := 0;
  v_email TEXT;
  v_name TEXT;
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
    RAISE EXCEPTION 'No approved Curator Marketplace accounts matched pitch %. Submission is not complete.', p_pitch_id;
  END IF;

  UPDATE public.playlist_pitches
  SET status = 'sent_to_curators',
      sent_to_curators_at = COALESCE(sent_to_curators_at, now()),
      updated_at = now()
  WHERE id = p_pitch_id;

  SELECT au.email, COALESCE(p.artist_name, p.full_name, au.email)
  INTO v_email, v_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.id = v_pitch.user_id;

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (v_pitch.user_id, 'Pitch delivered', 'Your pitch was delivered to real Curator Marketplace accounts.', 'playlist_pitch_delivered', 'playlist_pitches', p_pitch_id);
  END IF;

  IF v_email IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
    PERFORM public.queue_email(
      v_email,
      COALESCE(v_name, v_email),
      'Pitch delivered to curators',
      'playlist_pitch_delivered',
      jsonb_build_object('name', COALESCE(v_name, v_email), 'notes', 'Your playlist pitch was delivered to approved Curator Marketplace accounts.'),
      'playlist_pitches',
      p_pitch_id
    );
  END IF;

  PERFORM public.recalculate_playlist_pitch_analytics(p_pitch_id);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_deliver_playlist_pitch_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() < 2
     AND NEW.status = 'submitted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.deliver_playlist_pitch_to_matched_curators(NEW.id, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_deliver_playlist_pitch ON public.playlist_pitches;
CREATE TRIGGER trg_auto_deliver_playlist_pitch
AFTER INSERT OR UPDATE OF status ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.auto_deliver_playlist_pitch_trigger();

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
  SELECT * INTO v_curator FROM public.playlist_curator_marketplace WHERE id = p_curator_id AND deleted_at IS NULL AND active = true AND approval_status = 'approved';
  IF v_pitch.id IS NULL OR v_curator.id IS NULL THEN
    RAISE EXCEPTION 'Pitch or approved marketplace curator not found';
  END IF;
  IF p_playlist_id IS NOT NULL THEN
    SELECT * INTO v_playlist FROM public.curator_playlists WHERE id = p_playlist_id AND curator_id = p_curator_id AND deleted_at IS NULL AND active = true;
    IF v_playlist.id IS NULL THEN
      RAISE EXCEPTION 'Playlist % is not active for curator %', p_playlist_id, p_curator_id;
    END IF;
  END IF;

  INSERT INTO public.curator_deliveries (
    pitch_id, user_id, release_id, track_id, curator_id, playlist_id, curator_account_id,
    match_score, match_reasons, estimated_reach, delivery_channel, status, internal_notes,
    matched_at, delivered_at, created_by
  )
  VALUES (
    v_pitch.id, v_pitch.user_id, v_pitch.release_id, v_pitch.track_id, v_curator.id, p_playlist_id, v_curator.created_by,
    100, ARRAY['admin_force_assign'], COALESCE(v_playlist.followers, v_curator.total_followers, 0),
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

CREATE OR REPLACE FUNCTION public.record_curator_delivery_action(
  p_delivery_id UUID,
  p_action TEXT,
  p_response_notes TEXT DEFAULT NULL,
  p_requested_information TEXT DEFAULT NULL,
  p_playlist_url TEXT DEFAULT NULL,
  p_playlist_id TEXT DEFAULT NULL,
  p_playlist_name TEXT DEFAULT NULL,
  p_estimated_reach INTEGER DEFAULT 0
)
RETURNS public.curator_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.curator_deliveries;
  v_response public.curator_responses;
  v_artist_email TEXT;
  v_artist_name TEXT;
  v_title TEXT;
  v_template TEXT;
BEGIN
  SELECT * INTO v_delivery FROM public.curator_deliveries WHERE id = p_delivery_id;
  IF v_delivery.id IS NULL THEN
    RAISE EXCEPTION 'Curator delivery % not found', p_delivery_id;
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR v_delivery.curator_account_id = auth.uid()) THEN
    RAISE EXCEPTION 'Curator delivery access denied';
  END IF;
  IF p_action NOT IN ('opened','reviewed','accepted','rejected','request_more_information','playlist_added') THEN
    RAISE EXCEPTION 'Unsupported curator delivery action %', p_action;
  END IF;
  IF p_action = 'playlist_added' AND (COALESCE(p_playlist_url, '') = '' OR COALESCE(p_playlist_id, '') = '') THEN
    RAISE EXCEPTION 'Playlist URL and playlist ID are required before a placement can be counted';
  END IF;

  INSERT INTO public.curator_responses (
    delivery_id, pitch_id, curator_id, response_status, response_notes,
    requested_information, curator_confirmation, created_by
  )
  VALUES (
    v_delivery.id, v_delivery.pitch_id, v_delivery.curator_id,
    CASE WHEN p_action = 'playlist_added' THEN 'accepted' ELSE p_action END,
    p_response_notes, p_requested_information, p_action = 'playlist_added', auth.uid()
  )
  RETURNING * INTO v_response;

  IF p_action = 'playlist_added' THEN
    INSERT INTO public.curator_playlist_additions (
      delivery_id, response_id, pitch_id, curator_id, playlist_url, playlist_id,
      playlist_name, estimated_reach, curator_confirmation, curator_confirmation_at,
      evidence_metadata, created_by
    )
    VALUES (
      v_delivery.id, v_response.id, v_delivery.pitch_id, v_delivery.curator_id,
      p_playlist_url, p_playlist_id, p_playlist_name, COALESCE(p_estimated_reach, v_delivery.estimated_reach, 0),
      true, now(), jsonb_build_object('response_notes', p_response_notes), auth.uid()
    )
    ON CONFLICT (delivery_id) DO UPDATE
    SET response_id = EXCLUDED.response_id,
        playlist_url = EXCLUDED.playlist_url,
        playlist_id = EXCLUDED.playlist_id,
        playlist_name = EXCLUDED.playlist_name,
        estimated_reach = EXCLUDED.estimated_reach,
        curator_confirmation = true,
        curator_confirmation_at = now(),
        evidence_metadata = EXCLUDED.evidence_metadata;
  END IF;

  UPDATE public.curator_deliveries
  SET status = CASE
        WHEN p_action = 'request_more_information' THEN 'more_info_requested'
        ELSE p_action
      END,
      opened_at = CASE WHEN p_action IN ('opened','reviewed','accepted','rejected','request_more_information','playlist_added') THEN COALESCE(opened_at, now()) ELSE opened_at END,
      reviewed_at = CASE WHEN p_action IN ('reviewed','accepted','rejected','request_more_information','playlist_added') THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
      accepted_at = CASE WHEN p_action IN ('accepted','playlist_added') THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
      rejected_at = CASE WHEN p_action = 'rejected' THEN COALESCE(rejected_at, now()) ELSE rejected_at END,
      more_info_requested_at = CASE WHEN p_action = 'request_more_information' THEN COALESCE(more_info_requested_at, now()) ELSE more_info_requested_at END,
      playlist_added_at = CASE WHEN p_action = 'playlist_added' THEN COALESCE(playlist_added_at, now()) ELSE playlist_added_at END,
      updated_at = now()
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;

  IF p_action IN ('accepted','playlist_added') THEN
    UPDATE public.playlist_pitches
    SET status = 'accepted',
        accepted_at = COALESCE(accepted_at, now()),
        updated_at = now()
    WHERE id = v_delivery.pitch_id;
  ELSIF p_action = 'rejected' AND NOT EXISTS (
    SELECT 1 FROM public.curator_deliveries
    WHERE pitch_id = v_delivery.pitch_id
      AND id <> v_delivery.id
      AND status NOT IN ('rejected')
  ) THEN
    UPDATE public.playlist_pitches
    SET status = 'rejected',
        rejected_at = COALESCE(rejected_at, now()),
        updated_at = now()
    WHERE id = v_delivery.pitch_id;
  END IF;

  SELECT au.email, COALESCE(p.artist_name, p.full_name, au.email)
  INTO v_artist_email, v_artist_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.id = v_delivery.user_id;

  v_title := CASE p_action
    WHEN 'opened' THEN 'Curator opened your pitch'
    WHEN 'accepted' THEN 'Curator accepted your pitch'
    WHEN 'playlist_added' THEN 'Playlist added'
    WHEN 'rejected' THEN 'Curator rejected your pitch'
    WHEN 'request_more_information' THEN 'Curator requested more information'
    ELSE 'Curator reviewed your pitch'
  END;
  v_template := CASE p_action
    WHEN 'opened' THEN 'curator_pitch_opened'
    WHEN 'accepted' THEN 'curator_pitch_accepted'
    WHEN 'playlist_added' THEN 'playlist_added'
    WHEN 'rejected' THEN 'curator_pitch_rejected'
    WHEN 'request_more_information' THEN 'curator_more_info_requested'
    ELSE 'curator_response_received'
  END;

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (v_delivery.user_id, v_title, COALESCE(p_response_notes, v_title), v_template, 'curator_deliveries', v_delivery.id);
  END IF;

  IF v_artist_email IS NOT NULL AND to_regprocedure('public.queue_email(text,text,text,text,jsonb,text,uuid)') IS NOT NULL THEN
    PERFORM public.queue_email(
      v_artist_email,
      COALESCE(v_artist_name, v_artist_email),
      v_title,
      v_template,
      jsonb_build_object('name', COALESCE(v_artist_name, v_artist_email), 'notes', COALESCE(p_response_notes, v_title), 'playlist_url', p_playlist_url),
      'curator_deliveries',
      v_delivery.id
    );
  END IF;

  PERFORM public.recalculate_playlist_pitch_analytics(v_delivery.pitch_id);
  RETURN v_delivery;
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
    COUNT(d.id)::INTEGER,
    COUNT(d.id) FILTER (WHERE d.status IN ('accepted','playlist_added'))::INTEGER,
    COUNT(d.id) FILTER (WHERE d.status = 'rejected')::INTEGER,
    COUNT(d.id) FILTER (WHERE d.status IN ('reviewed','accepted','rejected','more_info_requested','playlist_added'))::INTEGER,
    CASE WHEN COUNT(d.id) = 0 THEN 0 ELSE ROUND((COUNT(d.id) FILTER (WHERE d.status IN ('reviewed','accepted','rejected','more_info_requested','playlist_added'))::NUMERIC / COUNT(d.id)::NUMERIC) * 100, 2) END,
    COALESCE(SUM(a.estimated_reach), 0)::INTEGER,
    now()
  FROM public.playlist_pitches p
  LEFT JOIN public.curator_deliveries d ON d.pitch_id = p.id AND d.status IN ('delivered','opened','reviewed','accepted','rejected','more_info_requested','playlist_added')
  LEFT JOIN public.curator_playlist_additions a ON a.delivery_id = d.id
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

CREATE OR REPLACE FUNCTION public.refresh_curator_delivery_analytics_trigger()
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

DROP TRIGGER IF EXISTS trg_curator_deliveries_analytics ON public.curator_deliveries;
CREATE TRIGGER trg_curator_deliveries_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.curator_deliveries
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_delivery_analytics_trigger();

DROP TRIGGER IF EXISTS trg_curator_playlist_additions_analytics ON public.curator_playlist_additions;
CREATE TRIGGER trg_curator_playlist_additions_analytics
AFTER INSERT OR UPDATE OR DELETE ON public.curator_playlist_additions
FOR EACH ROW EXECUTE FUNCTION public.refresh_curator_delivery_analytics_trigger();

DROP TRIGGER IF EXISTS trg_curator_deliveries_updated_at ON public.curator_deliveries;
CREATE TRIGGER trg_curator_deliveries_updated_at
BEFORE UPDATE ON public.curator_deliveries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.playlist_pitch_delivery_tracking
WITH (security_invoker = true) AS
SELECT
  p.id AS pitch_id,
  p.user_id,
  COUNT(d.id)::INTEGER AS curators_reached,
  COUNT(d.id) FILTER (WHERE d.opened_at IS NOT NULL)::INTEGER AS opened_count,
  COUNT(d.id) FILTER (WHERE d.reviewed_at IS NOT NULL OR d.status IN ('reviewed','accepted','rejected','more_info_requested','playlist_added'))::INTEGER AS reviewed_count,
  COUNT(d.id) FILTER (WHERE d.status IN ('accepted','playlist_added'))::INTEGER AS accepted_count,
  COUNT(a.id)::INTEGER AS playlist_added_count,
  COALESCE(SUM(a.estimated_reach), 0)::INTEGER AS playlist_reach,
  CASE WHEN COUNT(d.id) = 0 THEN 0 ELSE ROUND((COUNT(a.id)::NUMERIC / COUNT(d.id)::NUMERIC) * 100, 2) END AS pitch_success_rate,
  COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(d.accepted_at, d.rejected_at, d.more_info_requested_at, d.reviewed_at) - d.delivered_at)) / 3600) FILTER (WHERE d.delivered_at IS NOT NULL), 0)::NUMERIC(10,2) AS average_response_hours
FROM public.playlist_pitches p
LEFT JOIN public.curator_deliveries d ON d.pitch_id = p.id
LEFT JOIN public.curator_playlist_additions a ON a.delivery_id = d.id
GROUP BY p.id, p.user_id;

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
  COALESCE(dt.curators_reached, 0) AS total_curators_sent,
  COALESCE(dt.accepted_count, 0) AS accepted_count,
  COALESCE(a.rejected_count, 0) AS rejected_count,
  COALESCE(a.curator_response_rate, 0) AS curator_response_rate,
  COALESCE(dt.playlist_reach, 0) AS estimated_playlist_reach,
  COALESCE(dt.opened_count, 0) AS opened_count,
  COALESCE(dt.reviewed_count, 0) AS reviewed_count,
  COALESCE(dt.playlist_added_count, 0) AS playlist_added_count
FROM public.playlist_pitches p
JOIN public.releases r ON r.id = p.release_id
JOIN public.tracks t ON t.id = p.track_id
LEFT JOIN public.playlist_pitch_analytics a ON a.pitch_id = p.id
LEFT JOIN public.playlist_pitch_delivery_tracking dt ON dt.pitch_id = p.id;

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
  COALESCE(dt.curators_reached, 0) AS total_curators_sent,
  COALESCE(dt.accepted_count, 0) AS accepted_count,
  COALESCE(a.rejected_count, 0) AS rejected_count,
  COALESCE(a.curator_response_rate, 0) AS curator_response_rate,
  COALESCE(dt.playlist_reach, 0) AS estimated_playlist_reach,
  COALESCE(dt.opened_count, 0) AS opened_count,
  COALESCE(dt.reviewed_count, 0) AS reviewed_count,
  COALESCE(dt.playlist_added_count, 0) AS playlist_added_count
FROM public.playlist_pitches p
JOIN public.releases r ON r.id = p.release_id
JOIN public.tracks t ON t.id = p.track_id
LEFT JOIN public.profiles prof ON prof.id = p.user_id
LEFT JOIN public.playlist_pitch_analytics a ON a.pitch_id = p.id
LEFT JOIN public.playlist_pitch_delivery_tracking dt ON dt.pitch_id = p.id;

DROP VIEW IF EXISTS public.free_playlist_pitch_admin_analytics CASCADE;

CREATE VIEW public.free_playlist_pitch_admin_analytics
WITH (security_invoker = true) AS
SELECT
  COUNT(DISTINCT p.id)::INTEGER AS total_pitches,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'accepted')::INTEGER AS accepted_pitches,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'rejected')::INTEGER AS rejected_pitches,
  CASE WHEN COUNT(DISTINCT p.id) = 0 THEN 0 ELSE ROUND((COUNT(DISTINCT p.id) FILTER (WHERE cpa.id IS NOT NULL)::NUMERIC / COUNT(DISTINCT p.id)::NUMERIC) * 100, 2) END AS pitch_success_rate,
  COALESCE(SUM(cpa.estimated_reach), 0)::INTEGER AS playlist_reach,
  CASE WHEN COUNT(cd.id) = 0 THEN 0 ELSE ROUND((COUNT(cd.id) FILTER (WHERE cd.status IN ('accepted','playlist_added'))::NUMERIC / COUNT(cd.id)::NUMERIC) * 100, 2) END AS curator_acceptance_rate,
  COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(cd.accepted_at, cd.rejected_at, cd.more_info_requested_at, cd.reviewed_at) - cd.delivered_at)) / 3600) FILTER (WHERE cd.delivered_at IS NOT NULL), 0)::NUMERIC(10,2) AS average_response_hours,
  COUNT(cpa.id)::INTEGER AS playlist_adds
FROM public.playlist_pitches p
LEFT JOIN public.curator_deliveries cd ON cd.pitch_id = p.id
LEFT JOIN public.curator_playlist_additions cpa ON cpa.delivery_id = cd.id
WHERE public.has_role(auth.uid(), 'admin'::public.app_role);

GRANT SELECT, INSERT, UPDATE ON public.curator_deliveries TO authenticated;
GRANT SELECT, INSERT ON public.curator_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.curator_playlist_additions TO authenticated;
GRANT SELECT ON public.playlist_pitch_delivery_tracking TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_playlist_pitch_to_matched_curators(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_assign_playlist_pitch_curator(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_curator_delivery_action(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

DO $$
DECLARE
  v_table REGCLASS;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'public.curator_deliveries'::REGCLASS,
      'public.curator_responses'::REGCLASS,
      'public.curator_playlist_additions'::REGCLASS
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

COMMENT ON TABLE public.curator_deliveries IS 'Real pitch deliveries to approved Curator Marketplace accounts. A pitch is not complete without these rows.';
COMMENT ON TABLE public.curator_responses IS 'Stored curator actions for delivered playlist pitches.';
COMMENT ON TABLE public.curator_playlist_additions IS 'Evidence-backed playlist placements. Counts require playlist URL, playlist ID, and curator confirmation.';
