-- Phase 1 distribution engine foundation.
-- Adds per-track platform delivery tracking and a durable async job queue.

ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'PUBLISHED';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'FAILED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'distribution_job_status') THEN
    CREATE TYPE public.distribution_job_status AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');
  END IF;
END $$;

ALTER TABLE public.platform_deliveries
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_deliveries_track;
CREATE INDEX IF NOT EXISTS idx_deliveries_track ON public.platform_deliveries(track_id);

ALTER TABLE public.platform_deliveries
  DROP CONSTRAINT IF EXISTS platform_deliveries_release_id_platform_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_deliveries_release_platform
  ON public.platform_deliveries(release_id, platform)
  WHERE track_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_deliveries_track_platform
  ON public.platform_deliveries(track_id, platform)
  WHERE track_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.distribution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  platform public.dsp_platform NOT NULL,
  status public.distribution_job_status NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(track_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_distribution_jobs_status_created
  ON public.distribution_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_distribution_jobs_release
  ON public.distribution_jobs(release_id);
CREATE INDEX IF NOT EXISTS idx_distribution_jobs_track
  ON public.distribution_jobs(track_id);

ALTER TABLE public.distribution_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view distribution jobs" ON public.distribution_jobs;
CREATE POLICY "owners view distribution jobs" ON public.distribution_jobs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = distribution_jobs.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage distribution jobs" ON public.distribution_jobs;
CREATE POLICY "admins manage distribution jobs" ON public.distribution_jobs
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.enqueue_distribution_for_track(p_track_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track RECORD;
  v_platform public.dsp_platform;
  v_platforms public.dsp_platform[] := ARRAY[
    'spotify'::public.dsp_platform,
    'apple_music'::public.dsp_platform,
    'youtube_music'::public.dsp_platform,
    'deezer'::public.dsp_platform,
    'amazon_music'::public.dsp_platform
  ];
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

  FOREACH v_platform IN ARRAY v_platforms LOOP
    INSERT INTO public.platform_deliveries (release_id, track_id, user_id, platform, status)
    VALUES (v_track.release_id, v_track.id, v_track.user_id, v_platform, 'PENDING')
    ON CONFLICT (track_id, platform) WHERE track_id IS NOT NULL DO NOTHING;

    INSERT INTO public.distribution_jobs (release_id, track_id, platform, status)
    VALUES (v_track.release_id, v_track.id, v_platform, 'PENDING')
    ON CONFLICT (track_id, platform) DO NOTHING;
  END LOOP;

  INSERT INTO public.distribution_timeline (release_id, user_id, stage, note)
  VALUES (v_track.release_id, v_track.user_id, 'sent_to_stores', 'Distribution jobs queued for track ' || v_track.id)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_distribution_for_release(p_release_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track RECORD;
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner FROM public.releases WHERE id = p_release_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Release not found: %', p_release_id;
  END IF;

  IF auth.uid() IS NOT NULL
     AND auth.uid() <> v_owner
     AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to enqueue distribution for release %', p_release_id;
  END IF;

  FOR v_track IN
    SELECT id FROM public.tracks WHERE release_id = p_release_id ORDER BY track_number, created_at
  LOOP
    PERFORM public.enqueue_distribution_for_track(v_track.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_track_distribution_enqueue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_distribution_for_track(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_track_distribution_enqueue ON public.tracks;
CREATE TRIGGER trg_track_distribution_enqueue
AFTER INSERT ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.handle_track_distribution_enqueue();

CREATE OR REPLACE FUNCTION public.process_distribution_jobs(p_limit INTEGER DEFAULT 25, p_delay_ms INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_job IN
    SELECT *
    FROM public.distribution_jobs
    WHERE status = 'PENDING'
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.distribution_jobs
    SET status = 'PROCESSING',
        attempts = attempts + 1,
        updated_at = now()
    WHERE id = v_job.id;

    UPDATE public.platform_deliveries
    SET status = 'PROCESSING',
        updated_at = now()
    WHERE track_id = v_job.track_id
      AND platform = v_job.platform;

    PERFORM pg_sleep(GREATEST(p_delay_ms, 0)::numeric / 1000);

    UPDATE public.distribution_jobs
    SET status = 'PUBLISHED',
        updated_at = now(),
        processed_at = now()
    WHERE id = v_job.id;

    UPDATE public.platform_deliveries
    SET status = 'PUBLISHED',
        delivered_at = now(),
        updated_at = now()
    WHERE track_id = v_job.track_id
      AND platform = v_job.platform;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.distribution_jobs;
