-- Fraud protection infrastructure hardening.
-- Extends Phase 7 stream fraud into catalog, metadata, copyright, spam, and account abuse controls.

ALTER TABLE public.fraud_events
  ALTER COLUMN track_id DROP NOT NULL,
  ALTER COLUMN platform DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'STREAM',
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_code TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','FALSE_POSITIVE')),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fraud_events_type_time
  ON public.fraud_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_release_time
  ON public.fraud_events(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_subject_time
  ON public.fraud_events(subject_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_rule_time
  ON public.fraud_events(rule_code, created_at DESC);

ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_isrc_key;
ALTER TABLE public.tracks DROP CONSTRAINT IF EXISTS tracks_audio_hash_key;
ALTER TABLE public.audio_fingerprints DROP CONSTRAINT IF EXISTS audio_fingerprints_fingerprint_hash_key;

CREATE INDEX IF NOT EXISTS idx_tracks_isrc_fraud_lookup
  ON public.tracks(isrc)
  WHERE isrc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_audio_hash_fraud_lookup
  ON public.tracks(audio_hash)
  WHERE audio_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_hash_fraud_lookup
  ON public.audio_fingerprints(fingerprint_hash);

CREATE OR REPLACE FUNCTION public.prevent_fraud_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) - 'status' - 'resolved_at') = (to_jsonb(NEW) - 'status' - 'resolved_at')
     AND NEW.status IN ('OPEN','IN_REVIEW','RESOLVED','FALSE_POSITIVE') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'fraud_events evidence is append-only';
END $$;

CREATE TABLE IF NOT EXISTS public.fraud_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_event_id UUID REFERENCES public.fraud_events(id) ON DELETE SET NULL,
  review_id UUID REFERENCES public.fraud_reviews(id) ON DELETE SET NULL,
  actor_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_audit_event_time
  ON public.fraud_audit_logs(fraud_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_actor_time
  ON public.fraud_audit_logs(actor_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_action_time
  ON public.fraud_audit_logs(action, created_at DESC);

ALTER TABLE public.fraud_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view fraud audit logs" ON public.fraud_audit_logs;
CREATE POLICY "admins view fraud audit logs" ON public.fraud_audit_logs
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert fraud audit logs" ON public.fraud_audit_logs;
CREATE POLICY "admins insert fraud audit logs" ON public.fraud_audit_logs
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.prevent_fraud_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'fraud_audit_logs is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_fraud_audit_update ON public.fraud_audit_logs;
CREATE TRIGGER trg_prevent_fraud_audit_update
BEFORE UPDATE ON public.fraud_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_fraud_audit_delete ON public.fraud_audit_logs;
CREATE TRIGGER trg_prevent_fraud_audit_delete
BEFORE DELETE ON public.fraud_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_audit_mutation();

CREATE OR REPLACE FUNCTION public.normalize_fraud_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(COALESCE(p_value, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.fraud_decision_from_score(p_score INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_score >= 75 THEN 'BLOCKED'
              WHEN p_score >= 35 THEN 'SUSPICIOUS'
              ELSE 'CLEAN' END;
$$;

CREATE OR REPLACE FUNCTION public.fraud_severity_from_score(p_score INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_score >= 90 THEN 'critical'
              WHEN p_score >= 75 THEN 'high'
              WHEN p_score >= 35 THEN 'medium'
              ELSE 'low' END;
$$;

CREATE OR REPLACE FUNCTION public.append_fraud_signal(
  p_event_id TEXT,
  p_event_type TEXT,
  p_rule_code TEXT,
  p_score INTEGER,
  p_reasons JSONB,
  p_feature_vector JSONB,
  p_raw_event JSONB,
  p_track_id UUID DEFAULT NULL,
  p_release_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_platform public.dsp_platform DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_decision TEXT := public.fraud_decision_from_score(LEAST(100, GREATEST(0, p_score)));
BEGIN
  IF v_decision = 'CLEAN' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fraud_events (
    event_id,
    event_type,
    rule_code,
    track_id,
    release_id,
    user_id,
    subject_user_id,
    platform,
    decision,
    fraud_score,
    severity,
    status,
    reasons,
    feature_vector,
    raw_event
  )
  VALUES (
    p_event_id,
    p_event_type,
    p_rule_code,
    p_track_id,
    p_release_id,
    p_user_id,
    p_user_id,
    p_platform,
    v_decision,
    LEAST(100, GREATEST(0, p_score)),
    public.fraud_severity_from_score(p_score),
    CASE WHEN v_decision = 'BLOCKED' THEN 'IN_REVIEW' ELSE 'OPEN' END,
    COALESCE(p_reasons, '[]'::jsonb),
    COALESCE(p_feature_vector, '{}'::jsonb),
    COALESCE(p_raw_event, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL AND v_decision IN ('SUSPICIOUS','BLOCKED') THEN
    INSERT INTO public.fraud_reviews (fraud_event_id, decision)
    VALUES (v_id, 'PENDING')
    ON CONFLICT (fraud_event_id) WHERE decision = 'PENDING' DO NOTHING;

    INSERT INTO public.fraud_audit_logs (fraud_event_id, action, metadata)
    VALUES (v_id, 'FRAUD_SIGNAL_CREATED', jsonb_build_object(
      'event_type', p_event_type,
      'rule_code', p_rule_code,
      'decision', v_decision,
      'score', p_score
    ));
  END IF;

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.score_track_catalog_fraud(p_track_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track public.tracks;
  v_release public.releases;
  v_score INTEGER := 0;
  v_reasons JSONB := '[]'::jsonb;
  v_duplicate_isrc_count INTEGER := 0;
  v_metadata_reuse_count INTEGER := 0;
  v_release_velocity INTEGER := 0;
  v_conflicting_copyright_count INTEGER := 0;
BEGIN
  SELECT * INTO v_track FROM public.tracks WHERE id = p_track_id;
  IF v_track.id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_release FROM public.releases WHERE id = v_track.release_id;

  IF NULLIF(v_track.isrc, '') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_duplicate_isrc_count
    FROM (
      SELECT id, user_id FROM public.tracks WHERE isrc = v_track.isrc AND id <> v_track.id
      UNION ALL
      SELECT id, user_id FROM public.songs WHERE isrc = v_track.isrc
    ) matches
    WHERE matches.user_id IS DISTINCT FROM v_track.user_id;

    IF v_duplicate_isrc_count > 0 THEN
      v_score := v_score + 85;
      v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
        'rule', 'DUPLICATE_ISRC_USAGE',
        'severity', 'high',
        'scoreImpact', 85,
        'explanation', 'ISRC is already attached to another account catalog item',
        'metadata', jsonb_build_object('isrc', v_track.isrc, 'matches', v_duplicate_isrc_count)
      ));
    END IF;
  END IF;

  SELECT COUNT(*)::int INTO v_metadata_reuse_count
  FROM public.tracks t
  WHERE t.id <> v_track.id
    AND t.user_id IS DISTINCT FROM v_track.user_id
    AND public.normalize_fraud_text(t.title) = public.normalize_fraud_text(v_track.title)
    AND public.normalize_fraud_text(t.primary_artist) = public.normalize_fraud_text(v_track.primary_artist)
    AND COALESCE(round(t.duration_sec), -1) = COALESCE(round(v_track.duration_sec), -1);

  IF v_metadata_reuse_count > 0 THEN
    v_score := v_score + 35;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'SUSPICIOUS_METADATA_REUSE',
      'severity', 'medium',
      'scoreImpact', 35,
      'explanation', 'Title, primary artist, and duration match another account',
      'metadata', jsonb_build_object('matches', v_metadata_reuse_count)
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_conflicting_copyright_count
  FROM public.releases r
  JOIN public.tracks t ON t.release_id = r.id
  WHERE t.id <> v_track.id
    AND t.user_id IS DISTINCT FROM v_track.user_id
    AND public.normalize_fraud_text(t.title) = public.normalize_fraud_text(v_track.title)
    AND public.normalize_fraud_text(t.primary_artist) = public.normalize_fraud_text(v_track.primary_artist)
    AND NULLIF(public.normalize_fraud_text(r.copyright_owner), '') IS NOT NULL
    AND NULLIF(public.normalize_fraud_text(v_release.copyright_owner), '') IS NOT NULL
    AND public.normalize_fraud_text(r.copyright_owner) <> public.normalize_fraud_text(v_release.copyright_owner);

  IF v_conflicting_copyright_count > 0 OR COALESCE(v_release.rights_owned, false) = false OR COALESCE(v_release.copyright_declared, false) = false THEN
    v_score := v_score + CASE WHEN v_conflicting_copyright_count > 0 THEN 55 ELSE 25 END;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'COPYRIGHT_CONFLICT',
      'severity', CASE WHEN v_conflicting_copyright_count > 0 THEN 'high' ELSE 'medium' END,
      'scoreImpact', CASE WHEN v_conflicting_copyright_count > 0 THEN 55 ELSE 25 END,
      'explanation', 'Copyright claim is missing or conflicts with matching catalog metadata',
      'metadata', jsonb_build_object(
        'conflicting_matches', v_conflicting_copyright_count,
        'rights_owned', v_release.rights_owned,
        'copyright_declared', v_release.copyright_declared
      )
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_release_velocity
  FROM public.releases
  WHERE user_id = v_track.user_id
    AND created_at >= now() - INTERVAL '24 hours';

  IF v_release_velocity >= 10 THEN
    v_score := v_score + 45;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'SPAM_RELEASE_VELOCITY',
      'severity', 'medium',
      'scoreImpact', 45,
      'explanation', 'Account submitted an unusually high number of releases in 24 hours',
      'metadata', jsonb_build_object('releases_last_24h', v_release_velocity)
    ));
  END IF;

  IF v_score > 0 THEN
    PERFORM public.append_fraud_signal(
      'catalog:' || p_track_id::text || ':' || md5(v_reasons::text),
      'CATALOG',
      'CATALOG_FRAUD_SCORE',
      v_score,
      v_reasons,
      jsonb_build_object(
        'duplicate_isrc_count', v_duplicate_isrc_count,
        'metadata_reuse_count', v_metadata_reuse_count,
        'copyright_conflict_count', v_conflicting_copyright_count,
        'release_velocity_24h', v_release_velocity
      ),
      to_jsonb(v_track),
      v_track.id,
      v_track.release_id,
      v_track.user_id,
      NULL
    );
  END IF;

  RETURN LEAST(100, v_score);
END $$;

CREATE OR REPLACE FUNCTION public.score_song_catalog_fraud(p_song_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_song public.songs;
  v_score INTEGER := 0;
  v_reasons JSONB := '[]'::jsonb;
  v_duplicate_isrc_count INTEGER := 0;
  v_metadata_reuse_count INTEGER := 0;
  v_song_velocity INTEGER := 0;
BEGIN
  SELECT * INTO v_song FROM public.songs WHERE id = p_song_id;
  IF v_song.id IS NULL THEN
    RETURN 0;
  END IF;

  IF NULLIF(v_song.isrc, '') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_duplicate_isrc_count
    FROM (
      SELECT id, user_id FROM public.songs WHERE isrc = v_song.isrc AND id <> v_song.id
      UNION ALL
      SELECT id, user_id FROM public.tracks WHERE isrc = v_song.isrc
    ) matches
    WHERE matches.user_id IS DISTINCT FROM v_song.user_id;
  END IF;

  IF v_duplicate_isrc_count > 0 THEN
    v_score := v_score + 85;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'DUPLICATE_ISRC_USAGE',
      'severity', 'high',
      'scoreImpact', 85,
      'explanation', 'ISRC is already attached to another account catalog item',
      'metadata', jsonb_build_object('isrc', v_song.isrc, 'matches', v_duplicate_isrc_count)
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_metadata_reuse_count
  FROM public.songs s
  WHERE s.id <> v_song.id
    AND s.user_id IS DISTINCT FROM v_song.user_id
    AND public.normalize_fraud_text(s.title) = public.normalize_fraud_text(v_song.title)
    AND public.normalize_fraud_text(s.primary_artist) = public.normalize_fraud_text(v_song.primary_artist);

  IF v_metadata_reuse_count > 0 THEN
    v_score := v_score + 35;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'SUSPICIOUS_METADATA_REUSE',
      'severity', 'medium',
      'scoreImpact', 35,
      'explanation', 'Title and primary artist match another account song',
      'metadata', jsonb_build_object('matches', v_metadata_reuse_count)
    ));
  END IF;

  IF COALESCE(v_song.copyright_info, '') = '' OR COALESCE(length(v_song.lyrics), 0) > 20000 THEN
    v_score := v_score + 25;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'METADATA_ABUSE',
      'severity', 'medium',
      'scoreImpact', 25,
      'explanation', 'Copyright metadata is missing or lyrics metadata is unusually large',
      'metadata', jsonb_build_object('has_copyright_info', COALESCE(v_song.copyright_info, '') <> '', 'lyrics_length', COALESCE(length(v_song.lyrics), 0))
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_song_velocity
  FROM public.songs
  WHERE user_id = v_song.user_id
    AND created_at >= now() - INTERVAL '24 hours';

  IF v_song_velocity >= 15 THEN
    v_score := v_score + 45;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'SPAM_RELEASE_VELOCITY',
      'severity', 'medium',
      'scoreImpact', 45,
      'explanation', 'Account submitted an unusually high number of songs in 24 hours',
      'metadata', jsonb_build_object('songs_last_24h', v_song_velocity)
    ));
  END IF;

  IF v_score > 0 THEN
    PERFORM public.append_fraud_signal(
      'song:' || p_song_id::text || ':' || md5(v_reasons::text),
      'CATALOG',
      'SONG_FRAUD_SCORE',
      v_score,
      v_reasons,
      jsonb_build_object(
        'duplicate_isrc_count', v_duplicate_isrc_count,
        'metadata_reuse_count', v_metadata_reuse_count,
        'song_velocity_24h', v_song_velocity
      ),
      to_jsonb(v_song),
      NULL,
      NULL,
      v_song.user_id,
      NULL
    );
  END IF;

  RETURN LEAST(100, v_score);
END $$;

CREATE OR REPLACE FUNCTION public.score_audio_fingerprint_fraud(p_fingerprint_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fp public.audio_fingerprints;
  v_asset public.media_assets;
  v_match_count INTEGER := 0;
  v_score INTEGER := 0;
  v_reasons JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_fp FROM public.audio_fingerprints WHERE id = p_fingerprint_id;
  IF v_fp.id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_asset FROM public.media_assets WHERE id = v_fp.asset_id;

  SELECT COUNT(*)::int INTO v_match_count
  FROM public.audio_fingerprints fp
  JOIN public.media_assets a ON a.id = fp.asset_id
  WHERE fp.id <> v_fp.id
    AND (fp.fingerprint_hash = v_fp.fingerprint_hash OR fp.waveform_hash = v_fp.waveform_hash)
    AND a.user_id IS DISTINCT FROM v_asset.user_id;

  IF v_match_count > 0 OR v_fp.duplicate_asset_id IS NOT NULL OR v_fp.duplicate_track_id IS NOT NULL THEN
    v_score := 90;
    v_reasons := jsonb_build_array(jsonb_build_object(
      'rule', 'DUPLICATE_AUDIO_FINGERPRINT',
      'severity', 'critical',
      'scoreImpact', 90,
      'explanation', 'Audio fingerprint matches another catalog asset',
      'metadata', jsonb_build_object(
        'matches', v_match_count,
        'duplicate_asset_id', v_fp.duplicate_asset_id,
        'duplicate_track_id', v_fp.duplicate_track_id,
        'similarity_score', v_fp.similarity_score
      )
    ));

    PERFORM public.append_fraud_signal(
      'fingerprint:' || p_fingerprint_id::text,
      'AUDIO_FINGERPRINT',
      'DUPLICATE_AUDIO_FINGERPRINT',
      v_score,
      v_reasons,
      jsonb_build_object('match_count', v_match_count, 'similarity_score', v_fp.similarity_score),
      to_jsonb(v_fp),
      v_fp.track_id,
      v_asset.release_id,
      v_asset.user_id,
      NULL
    );
  END IF;

  RETURN v_score;
END $$;

CREATE OR REPLACE FUNCTION public.score_streaming_event_fraud(p_streaming_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.streaming_events;
  v_track public.tracks;
  v_score INTEGER := 0;
  v_reasons JSONB := '[]'::jsonb;
  v_prev_hour INTEGER := 0;
  v_same_fingerprint INTEGER := 0;
  v_short_listens INTEGER := 0;
BEGIN
  SELECT * INTO v_event FROM public.streaming_events WHERE id = p_streaming_event_id;
  IF v_event.id IS NULL THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_track FROM public.tracks WHERE id = v_event.track_id;

  SELECT COALESCE(SUM(stream_count_increment), 0)::int INTO v_prev_hour
  FROM public.streaming_events
  WHERE track_id = v_event.track_id
    AND occurred_at >= v_event.occurred_at - INTERVAL '1 hour'
    AND occurred_at < v_event.occurred_at;

  IF v_event.stream_count_increment >= 1000 OR (v_prev_hour >= 100 AND v_event.stream_count_increment > v_prev_hour * 3) THEN
    v_score := v_score + 40;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'STREAM_SPIKE_ANOMALY',
      'severity', 'medium',
      'scoreImpact', 40,
      'explanation', 'Stream increment spiked beyond recent baseline',
      'metadata', jsonb_build_object('increment', v_event.stream_count_increment, 'previous_hour_streams', v_prev_hour)
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_same_fingerprint
  FROM public.streaming_events e
  WHERE e.track_id = v_event.track_id
    AND e.occurred_at >= v_event.occurred_at - INTERVAL '10 minutes'
    AND e.occurred_at <= v_event.occurred_at
    AND (
      (v_event.raw_payload->>'ip_fingerprint' IS NOT NULL AND e.raw_payload->>'ip_fingerprint' = v_event.raw_payload->>'ip_fingerprint')
      OR (v_event.raw_payload->>'device_fingerprint' IS NOT NULL AND e.raw_payload->>'device_fingerprint' = v_event.raw_payload->>'device_fingerprint')
    );

  IF v_same_fingerprint >= 25 THEN
    v_score := v_score + CASE WHEN v_same_fingerprint >= 75 THEN 45 ELSE 30 END;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'REPEAT_EVENT_BURST',
      'severity', CASE WHEN v_same_fingerprint >= 75 THEN 'high' ELSE 'medium' END,
      'scoreImpact', CASE WHEN v_same_fingerprint >= 75 THEN 45 ELSE 30 END,
      'explanation', 'Many stream events share the same IP or device fingerprint',
      'metadata', jsonb_build_object('same_fingerprint_events_last_10m', v_same_fingerprint)
    ));
  END IF;

  SELECT COUNT(*)::int INTO v_short_listens
  FROM public.streaming_events e
  WHERE e.track_id = v_event.track_id
    AND e.occurred_at >= v_event.occurred_at - INTERVAL '10 minutes'
    AND e.occurred_at <= v_event.occurred_at
    AND COALESCE((e.raw_payload->>'listen_duration_seconds')::numeric, 999999) < 15;

  IF v_short_listens >= 30 THEN
    v_score := v_score + 30;
    v_reasons := v_reasons || jsonb_build_array(jsonb_build_object(
      'rule', 'LOW_RETENTION_PATTERN',
      'severity', 'medium',
      'scoreImpact', 30,
      'explanation', 'Short-duration stream events exceed expected threshold',
      'metadata', jsonb_build_object('short_duration_events_last_10m', v_short_listens)
    ));
  END IF;

  IF v_score > 0 THEN
    PERFORM public.append_fraud_signal(
      'stream-db:' || v_event.event_id,
      'STREAM',
      'STREAMING_PATTERN_SCORE',
      v_score,
      v_reasons,
      jsonb_build_object(
        'previous_hour_streams', v_prev_hour,
        'same_fingerprint_events_last_10m', v_same_fingerprint,
        'short_duration_events_last_10m', v_short_listens
      ),
      to_jsonb(v_event),
      v_event.track_id,
      v_track.release_id,
      v_track.user_id,
      v_event.platform
    );
  END IF;

  RETURN LEAST(100, v_score);
END $$;

CREATE OR REPLACE FUNCTION public.score_multi_account_abuse(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_artist_name_matches INTEGER := 0;
  v_phone_matches INTEGER := 0;
  v_score INTEGER := 0;
  v_reasons JSONB := '[]'::jsonb;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL THEN
    RETURN 0;
  END IF;

  IF NULLIF(public.normalize_fraud_text(v_profile.artist_name), '') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_artist_name_matches
    FROM public.profiles
    WHERE id <> p_user_id
      AND public.normalize_fraud_text(artist_name) = public.normalize_fraud_text(v_profile.artist_name);
  END IF;

  IF NULLIF(regexp_replace(COALESCE(v_profile.phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    SELECT COUNT(*)::int INTO v_phone_matches
    FROM public.profiles
    WHERE id <> p_user_id
      AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(v_profile.phone, ''), '\D', '', 'g');
  END IF;

  IF v_artist_name_matches >= 2 OR v_phone_matches >= 1 THEN
    v_score := CASE WHEN v_phone_matches >= 1 THEN 60 ELSE 35 END;
    v_reasons := jsonb_build_array(jsonb_build_object(
      'rule', 'MULTI_ACCOUNT_ABUSE',
      'severity', CASE WHEN v_phone_matches >= 1 THEN 'high' ELSE 'medium' END,
      'scoreImpact', v_score,
      'explanation', 'Profile identifiers are reused across multiple accounts',
      'metadata', jsonb_build_object('artist_name_matches', v_artist_name_matches, 'phone_matches', v_phone_matches)
    ));

    PERFORM public.append_fraud_signal(
      'account:' || p_user_id::text || ':' || md5(v_reasons::text),
      'ACCOUNT',
      'MULTI_ACCOUNT_ABUSE',
      v_score,
      v_reasons,
      jsonb_build_object('artist_name_matches', v_artist_name_matches, 'phone_matches', v_phone_matches),
      to_jsonb(v_profile),
      NULL,
      NULL,
      p_user_id,
      NULL
    );

    INSERT INTO public.fraud_user_risk_scores (user_id, risk_score, reason)
    VALUES (p_user_id, v_score, 'MULTI_ACCOUNT_ABUSE')
    ON CONFLICT (user_id) DO UPDATE SET
      risk_score = GREATEST(public.fraud_user_risk_scores.risk_score, EXCLUDED.risk_score),
      reason = EXCLUDED.reason,
      updated_at = now();
  END IF;

  RETURN v_score;
END $$;

CREATE OR REPLACE FUNCTION public.fraud_score_track_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.score_track_catalog_fraud(NEW.id);
  PERFORM public.score_multi_account_abuse(NEW.user_id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fraud_score_song_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.score_song_catalog_fraud(NEW.id);
  PERFORM public.score_multi_account_abuse(NEW.user_id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fraud_score_fingerprint_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.score_audio_fingerprint_fraud(NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fraud_score_streaming_event_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.score_streaming_event_fraud(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fraud_score_track ON public.tracks;
CREATE TRIGGER trg_fraud_score_track
AFTER INSERT OR UPDATE OF isrc, title, primary_artist, duration_sec ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.fraud_score_track_trigger();

DROP TRIGGER IF EXISTS trg_fraud_score_song ON public.songs;
CREATE TRIGGER trg_fraud_score_song
AFTER INSERT OR UPDATE OF isrc, title, primary_artist, copyright_info, lyrics ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.fraud_score_song_trigger();

DROP TRIGGER IF EXISTS trg_fraud_score_fingerprint ON public.audio_fingerprints;
CREATE TRIGGER trg_fraud_score_fingerprint
AFTER INSERT OR UPDATE OF fingerprint_hash, waveform_hash, duplicate_asset_id, duplicate_track_id, similarity_score ON public.audio_fingerprints
FOR EACH ROW EXECUTE FUNCTION public.fraud_score_fingerprint_trigger();

DROP TRIGGER IF EXISTS trg_fraud_score_streaming_event ON public.streaming_events;
CREATE TRIGGER trg_fraud_score_streaming_event
AFTER INSERT ON public.streaming_events
FOR EACH ROW EXECUTE FUNCTION public.fraud_score_streaming_event_trigger();

DROP VIEW IF EXISTS public.fraud_review_queue;
CREATE VIEW public.fraud_review_queue
WITH (security_invoker = true) AS
SELECT
  fr.id AS review_id,
  fr.fraud_event_id,
  fe.event_id,
  fe.event_type,
  fe.rule_code,
  fe.track_id,
  fe.release_id,
  fe.user_id,
  fe.subject_user_id,
  fe.platform,
  fe.decision,
  fe.severity,
  fe.status,
  fe.fraud_score,
  fe.reasons,
  fe.feature_vector,
  fe.raw_event,
  fr.created_at AS queued_at
FROM public.fraud_reviews fr
JOIN public.fraud_events fe ON fe.id = fr.fraud_event_id
WHERE fr.decision = 'PENDING'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fraud_reviews terminal
    WHERE terminal.fraud_event_id = fr.fraud_event_id
      AND terminal.decision IN ('APPROVE', 'REJECT', 'ESCALATE')
  );

CREATE OR REPLACE FUNCTION public.decide_fraud_review(
  p_review_id UUID,
  p_decision TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS public.fraud_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending public.fraud_reviews;
  v_decision TEXT := upper(p_decision);
  v_result public.fraud_reviews;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can decide fraud reviews';
  END IF;

  IF v_decision NOT IN ('APPROVE','REJECT','ESCALATE') THEN
    RAISE EXCEPTION 'Unsupported fraud review decision: %', p_decision;
  END IF;

  SELECT * INTO v_pending
  FROM public.fraud_reviews
  WHERE id = p_review_id
    AND decision = 'PENDING'
  LIMIT 1;

  IF v_pending.id IS NULL THEN
    RAISE EXCEPTION 'Pending fraud review not found';
  END IF;

  INSERT INTO public.fraud_reviews (fraud_event_id, decision, reviewer_id, notes)
  VALUES (v_pending.fraud_event_id, v_decision, auth.uid(), p_notes)
  RETURNING * INTO v_result;

  IF v_decision = 'APPROVE' THEN
    UPDATE public.fraud_events
    SET status = 'FALSE_POSITIVE', resolved_at = now()
    WHERE id = v_pending.fraud_event_id;
  ELSIF v_decision = 'REJECT' THEN
    UPDATE public.fraud_events
    SET status = 'RESOLVED', resolved_at = now()
    WHERE id = v_pending.fraud_event_id;
  ELSE
    UPDATE public.fraud_events
    SET status = 'IN_REVIEW'
    WHERE id = v_pending.fraud_event_id;
  END IF;

  INSERT INTO public.fraud_audit_logs (fraud_event_id, review_id, actor_admin_id, action, metadata)
  VALUES (
    v_pending.fraud_event_id,
    v_result.id,
    auth.uid(),
    'FRAUD_REVIEW_' || v_decision,
    jsonb_build_object('notes', p_notes)
  );

  IF to_regprocedure('public.log_admin_audit(text,uuid,jsonb)') IS NOT NULL THEN
    PERFORM public.log_admin_audit(
      'FRAUD_REVIEW_' || v_decision,
      v_pending.fraud_event_id,
      jsonb_build_object('review_id', p_review_id, 'notes', p_notes)
    );
  END IF;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.decide_fraud_review(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_track_catalog_fraud(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_song_catalog_fraud(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_audio_fingerprint_fraud(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_streaming_event_fraud(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.score_multi_account_abuse(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
