-- Phase 6.2: Playlist Performance & Streaming Impact Analytics.

DO $$
BEGIN
  IF to_regclass('public.curator_outreach_history') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.curator_outreach_history';
  END IF;
  IF to_regclass('public.playlist_curator_marketplace') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.playlist_curator_marketplace';
  END IF;
  IF to_regclass('public.curator_playlists') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.curator_playlists';
  END IF;
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.tracks';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'Phase 6.2 prerequisite missing: public.set_updated_at()';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.playlist_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID NOT NULL REFERENCES public.curator_outreach_history(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  placement_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  removal_date TIMESTAMPTZ,
  placement_status TEXT NOT NULL DEFAULT 'active' CHECK (placement_status IN ('pending','active','removed','expired','disputed')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (removal_date IS NULL OR removal_date >= placement_date)
);

CREATE TABLE IF NOT EXISTS public.playlist_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES public.playlist_placements(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  streams INTEGER NOT NULL DEFAULT 0 CHECK (streams >= 0),
  listeners INTEGER NOT NULL DEFAULT 0 CHECK (listeners >= 0),
  saves INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0),
  followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
  playlist_followers INTEGER NOT NULL DEFAULT 0 CHECK (playlist_followers >= 0),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','spotify','analytics_import','system')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id, collected_at)
);

CREATE TABLE IF NOT EXISTS public.playlist_stream_growth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES public.playlist_placements(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  streams_before INTEGER NOT NULL DEFAULT 0 CHECK (streams_before >= 0),
  streams_after INTEGER NOT NULL DEFAULT 0 CHECK (streams_after >= 0),
  listeners_before INTEGER NOT NULL DEFAULT 0 CHECK (listeners_before >= 0),
  listeners_after INTEGER NOT NULL DEFAULT 0 CHECK (listeners_after >= 0),
  saves_before INTEGER NOT NULL DEFAULT 0 CHECK (saves_before >= 0),
  saves_after INTEGER NOT NULL DEFAULT 0 CHECK (saves_after >= 0),
  stream_growth INTEGER NOT NULL DEFAULT 0,
  listener_growth INTEGER NOT NULL DEFAULT 0,
  save_growth INTEGER NOT NULL DEFAULT 0,
  stream_growth_percent NUMERIC(8,2) NOT NULL DEFAULT 0,
  placement_duration_days INTEGER NOT NULL DEFAULT 0 CHECK (placement_duration_days >= 0),
  estimated_reach INTEGER NOT NULL DEFAULT 0 CHECK (estimated_reach >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id)
);

CREATE TABLE IF NOT EXISTS public.playlist_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id UUID NOT NULL REFERENCES public.playlist_placements(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  curator_id UUID NOT NULL REFERENCES public.playlist_curator_marketplace(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.curator_playlists(id) ON DELETE SET NULL,
  campaign_name TEXT,
  genre TEXT,
  territory TEXT,
  placement_status TEXT NOT NULL DEFAULT 'active',
  streams_gained INTEGER NOT NULL DEFAULT 0,
  listeners_gained INTEGER NOT NULL DEFAULT 0,
  saves_gained INTEGER NOT NULL DEFAULT 0,
  stream_growth_percent NUMERIC(8,2) NOT NULL DEFAULT 0,
  estimated_reach INTEGER NOT NULL DEFAULT 0,
  playlist_followers INTEGER NOT NULL DEFAULT 0,
  placement_duration_days INTEGER NOT NULL DEFAULT 0,
  effectiveness_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  last_snapshot_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (placement_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_playlist_placement_pitch_active
  ON public.playlist_placements(pitch_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_placements_release_track ON public.playlist_placements(release_id, track_id, placement_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_placements_curator_playlist ON public.playlist_placements(curator_id, playlist_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_snapshots_placement_time ON public.playlist_performance_snapshots(placement_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_playlist_stream_growth_track ON public.playlist_stream_growth(track_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_campaign_metrics_curator ON public.playlist_campaign_metrics(curator_id, effectiveness_score DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_campaign_metrics_genre ON public.playlist_campaign_metrics(genre, effectiveness_score DESC);

ALTER TABLE public.playlist_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_stream_growth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own playlist placements" ON public.playlist_placements;
CREATE POLICY "artists view own playlist placements" ON public.playlist_placements
FOR SELECT USING (
  deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist placements" ON public.playlist_placements;
CREATE POLICY "admins manage playlist placements" ON public.playlist_placements
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist performance snapshots" ON public.playlist_performance_snapshots;
CREATE POLICY "artists view own playlist performance snapshots" ON public.playlist_performance_snapshots
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist performance snapshots" ON public.playlist_performance_snapshots;
CREATE POLICY "admins manage playlist performance snapshots" ON public.playlist_performance_snapshots
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist stream growth" ON public.playlist_stream_growth;
CREATE POLICY "artists view own playlist stream growth" ON public.playlist_stream_growth
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist stream growth" ON public.playlist_stream_growth;
CREATE POLICY "admins manage playlist stream growth" ON public.playlist_stream_growth
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "artists view own playlist campaign metrics" ON public.playlist_campaign_metrics;
CREATE POLICY "artists view own playlist campaign metrics" ON public.playlist_campaign_metrics
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage playlist campaign metrics" ON public.playlist_campaign_metrics;
CREATE POLICY "admins manage playlist campaign metrics" ON public.playlist_campaign_metrics
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.refresh_playlist_placement_metrics(p_placement_id UUID)
RETURNS public.playlist_campaign_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement public.playlist_placements;
  v_first public.playlist_performance_snapshots;
  v_last public.playlist_performance_snapshots;
  v_growth public.playlist_stream_growth;
  v_metrics public.playlist_campaign_metrics;
  v_duration INTEGER;
  v_stream_growth INTEGER;
  v_listener_growth INTEGER;
  v_save_growth INTEGER;
  v_growth_percent NUMERIC(8,2);
  v_estimated_reach INTEGER;
  v_effectiveness NUMERIC(8,2);
BEGIN
  SELECT * INTO v_placement
  FROM public.playlist_placements
  WHERE id = p_placement_id AND deleted_at IS NULL;

  IF v_placement.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_first
  FROM public.playlist_performance_snapshots
  WHERE placement_id = p_placement_id
  ORDER BY collected_at ASC
  LIMIT 1;

  SELECT * INTO v_last
  FROM public.playlist_performance_snapshots
  WHERE placement_id = p_placement_id
  ORDER BY collected_at DESC
  LIMIT 1;

  v_duration := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(v_placement.removal_date, now()) - v_placement.placement_date)) / 86400)::INTEGER);
  v_stream_growth := GREATEST(0, COALESCE(v_last.streams, 0) - COALESCE(v_first.streams, 0));
  v_listener_growth := GREATEST(0, COALESCE(v_last.listeners, 0) - COALESCE(v_first.listeners, 0));
  v_save_growth := GREATEST(0, COALESCE(v_last.saves, 0) - COALESCE(v_first.saves, 0));
  v_growth_percent := CASE WHEN COALESCE(v_first.streams, 0) = 0 THEN CASE WHEN v_stream_growth > 0 THEN 100 ELSE 0 END
    ELSE ROUND((v_stream_growth::NUMERIC / v_first.streams::NUMERIC) * 100, 2)
  END;
  v_estimated_reach := GREATEST(COALESCE(v_last.playlist_followers, 0), COALESCE(v_last.followers, 0), COALESCE((SELECT followers FROM public.curator_playlists WHERE id = v_placement.playlist_id), 0));
  v_effectiveness := ROUND((v_stream_growth * 0.60) + (v_listener_growth * 0.25) + (v_save_growth * 1.50) + (v_growth_percent * 2), 2);

  INSERT INTO public.playlist_stream_growth (
    placement_id, release_id, track_id, streams_before, streams_after, listeners_before, listeners_after,
    saves_before, saves_after, stream_growth, listener_growth, save_growth, stream_growth_percent,
    placement_duration_days, estimated_reach, calculated_at
  )
  VALUES (
    v_placement.id, v_placement.release_id, v_placement.track_id, COALESCE(v_first.streams, 0), COALESCE(v_last.streams, 0),
    COALESCE(v_first.listeners, 0), COALESCE(v_last.listeners, 0), COALESCE(v_first.saves, 0), COALESCE(v_last.saves, 0),
    v_stream_growth, v_listener_growth, v_save_growth, v_growth_percent, v_duration, v_estimated_reach, now()
  )
  ON CONFLICT (placement_id) DO UPDATE SET
    streams_before = EXCLUDED.streams_before,
    streams_after = EXCLUDED.streams_after,
    listeners_before = EXCLUDED.listeners_before,
    listeners_after = EXCLUDED.listeners_after,
    saves_before = EXCLUDED.saves_before,
    saves_after = EXCLUDED.saves_after,
    stream_growth = EXCLUDED.stream_growth,
    listener_growth = EXCLUDED.listener_growth,
    save_growth = EXCLUDED.save_growth,
    stream_growth_percent = EXCLUDED.stream_growth_percent,
    placement_duration_days = EXCLUDED.placement_duration_days,
    estimated_reach = EXCLUDED.estimated_reach,
    calculated_at = now(),
    updated_at = now()
  RETURNING * INTO v_growth;

  INSERT INTO public.playlist_campaign_metrics (
    placement_id, release_id, track_id, curator_id, playlist_id, campaign_name, genre, territory, placement_status,
    streams_gained, listeners_gained, saves_gained, stream_growth_percent, estimated_reach, playlist_followers,
    placement_duration_days, effectiveness_score, last_snapshot_at
  )
  SELECT
    v_placement.id,
    v_placement.release_id,
    v_placement.track_id,
    v_placement.curator_id,
    v_placement.playlist_id,
    COALESCE(cp.playlist_name, c.curator_name),
    cp.genre,
    COALESCE(cp.territory, c.territory, c.country),
    v_placement.placement_status,
    v_stream_growth,
    v_listener_growth,
    v_save_growth,
    v_growth_percent,
    v_estimated_reach,
    COALESCE(v_last.playlist_followers, cp.followers, 0),
    v_duration,
    v_effectiveness,
    v_last.collected_at
  FROM public.playlist_curator_marketplace c
  LEFT JOIN public.curator_playlists cp ON cp.id = v_placement.playlist_id
  WHERE c.id = v_placement.curator_id
  ON CONFLICT (placement_id) DO UPDATE SET
    campaign_name = EXCLUDED.campaign_name,
    genre = EXCLUDED.genre,
    territory = EXCLUDED.territory,
    placement_status = EXCLUDED.placement_status,
    streams_gained = EXCLUDED.streams_gained,
    listeners_gained = EXCLUDED.listeners_gained,
    saves_gained = EXCLUDED.saves_gained,
    stream_growth_percent = EXCLUDED.stream_growth_percent,
    estimated_reach = EXCLUDED.estimated_reach,
    playlist_followers = EXCLUDED.playlist_followers,
    placement_duration_days = EXCLUDED.placement_duration_days,
    effectiveness_score = EXCLUDED.effectiveness_score,
    last_snapshot_at = EXCLUDED.last_snapshot_at,
    updated_at = now()
  RETURNING * INTO v_metrics;

  IF v_stream_growth >= 1000
     AND COALESCE((v_metrics.metadata->>'last_stream_milestone')::INTEGER, 0) < FLOOR(v_stream_growth / 1000)::INTEGER
     AND to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    SELECT r.user_id, 'Stream growth milestone reached', 'A playlist placement has generated ' || v_stream_growth || ' additional streams.', 'SUCCESS', 'playlist_placements', v_placement.id
    FROM public.releases r
    WHERE r.id = v_placement.release_id;

    UPDATE public.playlist_campaign_metrics
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_stream_milestone', FLOOR(v_stream_growth / 1000)::INTEGER),
        updated_at = now()
    WHERE placement_id = p_placement_id
    RETURNING * INTO v_metrics;
  END IF;

  RETURN v_metrics;
END;
$$;

CREATE OR REPLACE FUNCTION public.playlist_performance_snapshot_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_playlist_placement_metrics(COALESCE(NEW.placement_id, OLD.placement_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.playlist_placement_status_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_playlist_placement_metrics(NEW.id);

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.placement_status IS DISTINCT FROM NEW.placement_status AND NEW.placement_status = 'active') THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      SELECT r.user_id, 'Playlist placement began', 'Your track has been placed on a curator playlist.', 'SUCCESS', 'playlist_placements', NEW.id
      FROM public.releases r WHERE r.id = NEW.release_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.placement_status IS DISTINCT FROM NEW.placement_status AND NEW.placement_status = 'removed' THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      SELECT r.user_id, 'Playlist placement removed', 'A curator playlist placement has ended.', 'INFO', 'playlist_placements', NEW.id
      FROM public.releases r WHERE r.id = NEW.release_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_playlist_placement_from_outreach()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.playlist_placements (
      pitch_id, curator_id, playlist_id, release_id, track_id, placement_date, placement_status, notes
    )
    SELECT NEW.id, NEW.curator_id, NEW.playlist_id, NEW.release_id, NEW.track_id, COALESCE(NEW.response_date, now()), 'active', NEW.curator_feedback
    WHERE NOT EXISTS (
      SELECT 1 FROM public.playlist_placements p WHERE p.pitch_id = NEW.id AND p.deleted_at IS NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_playlist_placements_updated_at ON public.playlist_placements;
CREATE TRIGGER trg_playlist_placements_updated_at BEFORE UPDATE ON public.playlist_placements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_stream_growth_updated_at ON public.playlist_stream_growth;
CREATE TRIGGER trg_playlist_stream_growth_updated_at BEFORE UPDATE ON public.playlist_stream_growth
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_campaign_metrics_updated_at ON public.playlist_campaign_metrics;
CREATE TRIGGER trg_playlist_campaign_metrics_updated_at BEFORE UPDATE ON public.playlist_campaign_metrics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_playlist_performance_snapshot_refresh ON public.playlist_performance_snapshots;
CREATE TRIGGER trg_playlist_performance_snapshot_refresh AFTER INSERT OR UPDATE OR DELETE ON public.playlist_performance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.playlist_performance_snapshot_trigger();

DROP TRIGGER IF EXISTS trg_playlist_placement_status ON public.playlist_placements;
CREATE TRIGGER trg_playlist_placement_status AFTER INSERT OR UPDATE OF placement_status, removal_date ON public.playlist_placements
FOR EACH ROW EXECUTE FUNCTION public.playlist_placement_status_trigger();

DROP TRIGGER IF EXISTS trg_curator_outreach_create_placement ON public.curator_outreach_history;
CREATE TRIGGER trg_curator_outreach_create_placement AFTER INSERT OR UPDATE OF status ON public.curator_outreach_history
FOR EACH ROW EXECUTE FUNCTION public.create_playlist_placement_from_outreach();

CREATE OR REPLACE VIEW public.playlist_performance_artist_dashboard
WITH (security_invoker = true) AS
SELECT
  p.id AS placement_id,
  p.pitch_id,
  p.curator_id,
  c.curator_name,
  p.playlist_id,
  cp.playlist_name,
  cp.spotify_playlist_url,
  p.release_id,
  r.title AS release_title,
  p.track_id,
  t.title AS track_title,
  p.placement_date,
  p.removal_date,
  p.placement_status,
  p.notes,
  COALESCE(g.streams_before, 0) AS streams_before,
  COALESCE(g.streams_after, 0) AS streams_after,
  COALESCE(g.stream_growth, 0) AS streams_gained,
  COALESCE(g.listener_growth, 0) AS listeners_gained,
  COALESCE(g.save_growth, 0) AS saves_gained,
  COALESCE(g.stream_growth_percent, 0) AS stream_growth_percent,
  COALESCE(g.placement_duration_days, 0) AS placement_duration_days,
  COALESCE(g.estimated_reach, cp.followers, 0) AS estimated_reach,
  COALESCE(m.effectiveness_score, 0) AS effectiveness_score,
  m.last_snapshot_at,
  cp.genre,
  COALESCE(cp.territory, c.territory, c.country) AS territory
FROM public.playlist_placements p
JOIN public.releases r ON r.id = p.release_id
JOIN public.tracks t ON t.id = p.track_id
JOIN public.playlist_curator_marketplace c ON c.id = p.curator_id
LEFT JOIN public.curator_playlists cp ON cp.id = p.playlist_id
LEFT JOIN public.playlist_stream_growth g ON g.placement_id = p.id
LEFT JOIN public.playlist_campaign_metrics m ON m.placement_id = p.id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.playlist_performance_timeline
WITH (security_invoker = true) AS
SELECT
  s.id AS snapshot_id,
  s.placement_id,
  s.release_id,
  s.track_id,
  r.user_id,
  s.streams,
  s.listeners,
  s.saves,
  s.followers,
  s.playlist_followers,
  s.collected_at,
  p.placement_date,
  cp.playlist_name,
  c.curator_name
FROM public.playlist_performance_snapshots s
JOIN public.playlist_placements p ON p.id = s.placement_id
JOIN public.releases r ON r.id = s.release_id
JOIN public.playlist_curator_marketplace c ON c.id = p.curator_id
LEFT JOIN public.curator_playlists cp ON cp.id = p.playlist_id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.playlist_performance_admin_analytics
WITH (security_invoker = true) AS
SELECT
  c.id AS curator_id,
  c.curator_name,
  cp.id AS playlist_id,
  cp.playlist_name,
  COALESCE(cp.genre, 'Unknown') AS genre,
  COUNT(m.placement_id)::INTEGER AS placements,
  COALESCE(SUM(m.streams_gained), 0)::INTEGER AS streams_gained,
  COALESCE(SUM(m.listeners_gained), 0)::INTEGER AS listeners_gained,
  COALESCE(SUM(m.saves_gained), 0)::INTEGER AS saves_gained,
  COALESCE(AVG(m.stream_growth_percent), 0)::NUMERIC(8,2) AS average_stream_growth_percent,
  COALESCE(SUM(m.estimated_reach), 0)::INTEGER AS total_estimated_reach,
  COALESCE(AVG(m.effectiveness_score), 0)::NUMERIC(8,2) AS average_effectiveness_score,
  COALESCE(AVG(c.acceptance_rate), 0)::NUMERIC(5,2) AS acceptance_rate
FROM public.playlist_campaign_metrics m
JOIN public.playlist_curator_marketplace c ON c.id = m.curator_id
LEFT JOIN public.curator_playlists cp ON cp.id = m.playlist_id
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY c.id, c.curator_name, cp.id, cp.playlist_name, cp.genre;

CREATE OR REPLACE VIEW public.playlist_genre_performance_admin
WITH (security_invoker = true) AS
SELECT
  COALESCE(genre, 'Unknown') AS genre,
  COUNT(*)::INTEGER AS placements,
  COALESCE(SUM(streams_gained), 0)::INTEGER AS streams_gained,
  COALESCE(AVG(stream_growth_percent), 0)::NUMERIC(8,2) AS average_stream_growth_percent,
  COALESCE(AVG(effectiveness_score), 0)::NUMERIC(8,2) AS average_effectiveness_score
FROM public.playlist_campaign_metrics
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
GROUP BY COALESCE(genre, 'Unknown');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_performance_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_stream_growth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_campaign_metrics TO authenticated;
GRANT SELECT ON public.playlist_performance_artist_dashboard TO authenticated;
GRANT SELECT ON public.playlist_performance_timeline TO authenticated;
GRANT SELECT ON public.playlist_performance_admin_analytics TO authenticated;
GRANT SELECT ON public.playlist_genre_performance_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_playlist_placement_metrics(UUID) TO authenticated;

COMMENT ON TABLE public.playlist_placements IS 'Accepted curator outreach placements with active/removal status.';
COMMENT ON TABLE public.playlist_performance_snapshots IS 'Point-in-time streaming and playlist follower snapshots for each placement.';
COMMENT ON TABLE public.playlist_stream_growth IS 'Calculated before/after streaming impact metrics per playlist placement.';
COMMENT ON TABLE public.playlist_campaign_metrics IS 'Aggregated campaign effectiveness metrics for artist and admin analytics.';
