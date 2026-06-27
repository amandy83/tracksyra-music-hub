-- Phase 2 platform adapter architecture persistence fields.

ALTER TABLE public.platform_deliveries
  ADD COLUMN IF NOT EXISTS platform_track_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_response JSONB,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS retryable BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_platform_deliveries_platform_track_id
  ON public.platform_deliveries(platform_track_id)
  WHERE platform_track_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_distribution_jobs(p_limit INTEGER DEFAULT 25, p_delay_ms INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_count INTEGER := 0;
  v_platform_track_id TEXT;
  v_raw_response JSONB;
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

    v_platform_track_id := v_job.platform::text || '_' || replace(v_job.track_id::text, '-', '') || '_' || extract(epoch from now())::bigint::text;
    v_raw_response := jsonb_build_object(
      'platform', v_job.platform,
      'releaseId', v_job.release_id,
      'trackId', v_job.track_id,
      'platformTrackId', v_platform_track_id,
      'status', 'PUBLISHED',
      'mock', true,
      'acceptedAt', now()
    );

    UPDATE public.distribution_jobs
    SET status = 'PUBLISHED',
        last_error = NULL,
        updated_at = now(),
        processed_at = now()
    WHERE id = v_job.id;

    UPDATE public.platform_deliveries
    SET status = 'PUBLISHED',
        platform_track_id = v_platform_track_id,
        raw_response = v_raw_response,
        error_code = NULL,
        error_message = NULL,
        retryable = NULL,
        delivered_at = now(),
        updated_at = now()
    WHERE track_id = v_job.track_id
      AND platform = v_job.platform;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;
