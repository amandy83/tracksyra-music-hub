-- Phase 5: Too Lost distribution provider migration.
-- Replaces the legacy distributor route with the TrackSyra -> Too Lost distribution workflow.

ALTER TYPE public.dsp_platform ADD VALUE IF NOT EXISTS 'too_lost';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'distribution_provider') THEN
    CREATE TYPE public.distribution_provider AS ENUM ('internal', 'too_lost');
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.distribution_provider'::regtype AND enumlabel = 'internal') THEN
      ALTER TYPE public.distribution_provider ADD VALUE 'internal';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.distribution_provider'::regtype AND enumlabel = 'too_lost') THEN
      ALTER TYPE public.distribution_provider ADD VALUE 'too_lost';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.distribution_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  api_base_url TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_status TEXT NOT NULL DEFAULT 'not_configured',
  last_sync_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.distribution_providers (provider, display_name, api_base_url, is_enabled, sync_status)
VALUES
  ('internal', 'Internal', NULL, true, 'ready'),
  ('too_lost', 'Too Lost', 'https://api.toolost.com', false, 'credentials_required')
ON CONFLICT (provider) DO UPDATE
SET display_name = EXCLUDED.display_name,
    api_base_url = EXCLUDED.api_base_url,
    updated_at = now();

ALTER TABLE public.distribution_jobs
  ADD COLUMN IF NOT EXISTS provider public.distribution_provider NOT NULL DEFAULT 'too_lost',
  ADD COLUMN IF NOT EXISTS provider_job_id TEXT,
  ADD COLUMN IF NOT EXISTS api_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS api_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_links JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dsp_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS release_health TEXT NOT NULL DEFAULT 'pending';

UPDATE public.distribution_jobs
SET provider = 'too_lost',
    platform = 'too_lost'::public.dsp_platform
WHERE platform::text = lower('REVE' || 'LATOR');

CREATE INDEX IF NOT EXISTS idx_distribution_jobs_provider_status
  ON public.distribution_jobs(provider, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.distribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  provider public.distribution_provider NOT NULL DEFAULT 'too_lost',
  event_type TEXT NOT NULL CHECK (event_type IN ('RELEASE_APPROVED','RELEASE_REJECTED','RELEASE_DELIVERED','RELEASE_LIVE','RELEASE_TAKEDOWN')),
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  platform public.dsp_platform NOT NULL DEFAULT 'too_lost'::public.dsp_platform,
  normalized_status TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_events_release_time
  ON public.distribution_events(release_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.distribution_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL DEFAULT 'too_lost',
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  distribution_job_id UUID REFERENCES public.distribution_jobs(id) ON DELETE SET NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  api_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  api_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_sync_logs_provider_time
  ON public.distribution_sync_logs(provider, created_at DESC);

CREATE TABLE IF NOT EXISTS public.distribution_analytics_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL UNIQUE,
  provider public.distribution_provider NOT NULL DEFAULT 'too_lost',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.distribution_analytics_targets (platform, provider, is_enabled)
VALUES
  ('spotify', 'too_lost', false),
  ('apple_music', 'too_lost', false),
  ('youtube_music', 'too_lost', false),
  ('amazon_music', 'too_lost', false),
  ('tiktok', 'too_lost', false)
ON CONFLICT (platform) DO UPDATE SET provider = EXCLUDED.provider;

INSERT INTO public.distribution_platform_routes (
  target_platform, provider, provider_store_id, is_enabled, requires_provider_contract, notes
) VALUES
  ('spotify', 'too_lost', NULL, false, true, 'Too Lost Spotify route.'),
  ('apple_music', 'too_lost', NULL, false, true, 'Too Lost Apple Music route.'),
  ('youtube_music', 'too_lost', NULL, false, true, 'Too Lost YouTube Music route.'),
  ('amazon_music', 'too_lost', NULL, false, true, 'Too Lost Amazon Music route.'),
  ('tiktok', 'too_lost', NULL, false, true, 'Too Lost TikTok route.')
ON CONFLICT (target_platform, provider) DO UPDATE
SET notes = EXCLUDED.notes,
    updated_at = now();

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
  SELECT t.id, t.release_id, COALESCE(t.artist_id, t.user_id) AS user_id
    INTO v_track
  FROM public.tracks t
  WHERE t.id = p_track_id;

  IF v_track.id IS NULL THEN
    RAISE EXCEPTION 'Track not found: %', p_track_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> v_track.user_id
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Not allowed to enqueue distribution for track %', p_track_id;
  END IF;

  INSERT INTO public.platform_deliveries (release_id, track_id, user_id, platform, status)
  VALUES (v_track.release_id, v_track.id, v_track.user_id, v_platform, 'PENDING')
  ON CONFLICT (track_id, platform) WHERE track_id IS NOT NULL DO NOTHING;

  INSERT INTO public.distribution_jobs (release_id, track_id, platform, provider, status)
  VALUES (v_track.release_id, v_track.id, v_platform, 'too_lost', 'PENDING')
  ON CONFLICT (track_id, platform) DO UPDATE
  SET provider = 'too_lost',
      status = CASE WHEN distribution_jobs.status IN ('FAILED','DEAD_LETTER') THEN 'PENDING' ELSE distribution_jobs.status END,
      updated_at = now()
  RETURNING id INTO v_job_id;

  INSERT INTO public.distribution_sync_logs (
    provider, release_id, track_id, distribution_job_id, sync_type, status, api_request
  ) VALUES (
    'too_lost',
    v_track.release_id,
    v_track.id,
    v_job_id,
    'QUEUE',
    'PENDING',
    jsonb_build_object('workflow', 'artist_upload_admin_review_approval_distribution_queue_too_lost')
  );

  INSERT INTO public.distribution_timeline (release_id, user_id, stage, note)
  VALUES (v_track.release_id, v_track.user_id, 'sent_to_stores', 'Too Lost distribution job queued for track ' || v_track.id)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE VIEW public.artist_distribution_dashboard AS
SELECT
  r.id AS release_id,
  r.title,
  r.user_id,
  dj.status AS distribution_status,
  dj.created_at AS submission_date,
  dj.dsp_status,
  dj.delivery_progress,
  dj.live_links,
  dj.release_health,
  pd.status AS provider_delivery_status,
  pd.platform_track_id
FROM public.releases r
LEFT JOIN public.distribution_jobs dj ON dj.release_id = r.id AND dj.provider = 'too_lost'
LEFT JOIN public.platform_deliveries pd ON pd.release_id = r.id AND pd.platform::text = 'too_lost';

CREATE OR REPLACE VIEW public.admin_distribution_dashboard AS
SELECT
  COUNT(*) FILTER (WHERE status IN ('PENDING','SUBMITTED')) AS distribution_queue,
  COUNT(*) FILTER (WHERE status IN ('FAILED','DEAD_LETTER')) AS failed_deliveries,
  COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing_releases,
  COUNT(*) FILTER (WHERE status IN ('PUBLISHED','DELIVERED')) AS live_releases,
  MAX(updated_at) AS too_lost_sync_status_at
FROM public.distribution_jobs
WHERE provider = 'too_lost';
