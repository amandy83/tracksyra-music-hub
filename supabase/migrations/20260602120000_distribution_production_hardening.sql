-- Production hardening for distribution infrastructure.
-- Removes fake SQL publishing and adds provider/DSP route and audit tracking.

CREATE TABLE IF NOT EXISTS public.distribution_platform_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_platform public.dsp_platform NOT NULL,
  provider public.dsp_platform NOT NULL DEFAULT 'too_lost'::public.dsp_platform,
  provider_store_id TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  requires_provider_contract BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(target_platform, provider)
);

CREATE INDEX IF NOT EXISTS idx_distribution_platform_routes_enabled
  ON public.distribution_platform_routes(target_platform, provider)
  WHERE is_enabled = true;

ALTER TABLE public.distribution_platform_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage distribution platform routes" ON public.distribution_platform_routes;
CREATE POLICY "admins manage distribution platform routes" ON public.distribution_platform_routes
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view enabled distribution platform routes" ON public.distribution_platform_routes;
CREATE POLICY "owners view enabled distribution platform routes" ON public.distribution_platform_routes
FOR SELECT USING (is_enabled = true);

CREATE TABLE IF NOT EXISTS public.distribution_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  distribution_job_id UUID REFERENCES public.distribution_jobs(id) ON DELETE SET NULL,
  provider public.dsp_platform NOT NULL DEFAULT 'too_lost'::public.dsp_platform,
  target_platform public.dsp_platform,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_audit_logs_release_time
  ON public.distribution_audit_logs(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_audit_logs_job_time
  ON public.distribution_audit_logs(distribution_job_id, created_at DESC);

ALTER TABLE public.distribution_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view distribution audit logs" ON public.distribution_audit_logs;
CREATE POLICY "owners view distribution audit logs" ON public.distribution_audit_logs
FOR SELECT USING (
  release_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = distribution_audit_logs.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage distribution audit logs" ON public.distribution_audit_logs;
CREATE POLICY "admins manage distribution audit logs" ON public.distribution_audit_logs
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

INSERT INTO public.distribution_platform_routes (
  target_platform, provider, provider_store_id, is_enabled, requires_provider_contract, notes
) VALUES
  ('spotify', 'too_lost', NULL, false, true, 'Enable after confirming Too Lost store mapping and contract coverage.'),
  ('apple_music', 'too_lost', NULL, false, true, 'Enable after confirming Too Lost store mapping and contract coverage.'),
  ('youtube_music', 'too_lost', NULL, false, true, 'Enable after confirming Too Lost delivery support and store mapping.'),
  ('amazon_music', 'too_lost', NULL, false, true, 'Enable after confirming Too Lost delivery support and store mapping.'),
  ('instagram_facebook', 'too_lost', NULL, false, true, 'Covers Meta/Facebook/Instagram music products when enabled by provider contract.'),
  ('tiktok', 'too_lost', NULL, false, true, 'Enable after confirming Too Lost TikTok delivery support and store mapping.')
ON CONFLICT (target_platform, provider) DO NOTHING;

CREATE OR REPLACE FUNCTION public.process_distribution_jobs(p_limit INTEGER DEFAULT 25, p_delay_ms INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SQL distribution processor is disabled in production. Run the TrackSyra distribution worker so provider APIs, retries, audit logs, and webhooks are used.';
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_distribution_for_track(p_track_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track RECORD;
  v_platform public.dsp_platform := 'too_lost'::public.dsp_platform;
  v_job_id UUID;
BEGIN
  SELECT t.id, t.release_id, t.user_id
    INTO v_track
  FROM public.tracks t
  WHERE t.id = p_track_id;

  IF v_track.id IS NULL THEN
    RAISE EXCEPTION 'Track not found: %', p_track_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> v_track.user_id
     AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to enqueue distribution for track %', p_track_id;
  END IF;

  INSERT INTO public.platform_deliveries (release_id, track_id, user_id, platform, status)
  VALUES (v_track.release_id, v_track.id, v_track.user_id, v_platform, 'PENDING')
  ON CONFLICT (track_id, platform) WHERE track_id IS NOT NULL DO NOTHING;

  INSERT INTO public.distribution_jobs (release_id, track_id, platform, status)
  VALUES (v_track.release_id, v_track.id, v_platform, 'PENDING')
  ON CONFLICT (track_id, platform) DO NOTHING
  RETURNING id INTO v_job_id;

  INSERT INTO public.distribution_audit_logs (
    release_id, track_id, distribution_job_id, provider, action, status, actor, metadata
  ) VALUES (
    v_track.release_id,
    v_track.id,
    v_job_id,
    v_platform,
    'QUEUE_DISTRIBUTION',
    'PENDING',
    'database_trigger',
    jsonb_build_object('source', 'enqueue_distribution_for_track')
  );

  INSERT INTO public.distribution_timeline (release_id, user_id, stage, note)
  VALUES (v_track.release_id, v_track.user_id, 'sent_to_stores', 'Too Lost distribution job queued for track ' || v_track.id)
  ON CONFLICT DO NOTHING;
END $$;
