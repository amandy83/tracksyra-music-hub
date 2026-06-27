-- Phase 3.6.1: Promo Assets Studio FFmpeg processing pipeline.

ALTER TABLE public.promo_assets
  ADD COLUMN IF NOT EXISTS bitrate BIGINT,
  ADD COLUMN IF NOT EXISTS codec TEXT,
  ADD COLUMN IF NOT EXISTS audio_codec TEXT,
  ADD COLUMN IF NOT EXISTS optimized_url TEXT;

CREATE TABLE IF NOT EXISTS public.promo_asset_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_asset_id UUID NOT NULL REFERENCES public.promo_assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_asset_jobs_asset_created ON public.promo_asset_jobs(promo_asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_asset_jobs_status_created ON public.promo_asset_jobs(status, created_at);

ALTER TABLE public.promo_asset_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own promo asset jobs" ON public.promo_asset_jobs;
CREATE POLICY "artists view own promo asset jobs"
ON public.promo_asset_jobs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.promo_assets pa
    WHERE pa.id = promo_asset_jobs.promo_asset_id
      AND pa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage promo asset jobs" ON public.promo_asset_jobs;
CREATE POLICY "admins manage promo asset jobs"
ON public.promo_asset_jobs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.enqueue_promo_asset_processing_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.promo_asset_jobs (promo_asset_id, status, progress)
  VALUES (NEW.id, 'queued', 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_promo_asset_processing_job ON public.promo_assets;
CREATE TRIGGER trg_enqueue_promo_asset_processing_job
AFTER INSERT ON public.promo_assets
FOR EACH ROW EXECUTE FUNCTION public.enqueue_promo_asset_processing_job();

INSERT INTO public.promo_asset_jobs (promo_asset_id, status, progress)
SELECT pa.id, 'queued', 0
FROM public.promo_assets pa
WHERE (pa.optimized_url IS NULL OR pa.thumbnail_url IS NULL OR pa.validation_status = 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.promo_asset_jobs paj
    WHERE paj.promo_asset_id = pa.id
  );

CREATE OR REPLACE FUNCTION public.claim_next_promo_asset_job()
RETURNS TABLE (
  id UUID,
  promo_asset_id UUID,
  status TEXT,
  progress INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_job AS (
    SELECT paj.id
    FROM public.promo_asset_jobs paj
    WHERE paj.status = 'queued'
    ORDER BY paj.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.promo_asset_jobs paj
  SET status = 'processing',
      progress = 0,
      started_at = now(),
      completed_at = NULL,
      error_message = NULL
  FROM next_job
  WHERE paj.id = next_job.id
  RETURNING paj.id, paj.promo_asset_id, paj.status, paj.progress, paj.created_at;
END;
$$;

CREATE OR REPLACE VIEW public.promo_asset_processing_logs
WITH (security_invoker = true) AS
SELECT
  paj.id AS job_id,
  paj.promo_asset_id,
  pa.title AS asset_title,
  pa.user_id AS artist_id,
  COALESCE(p.artist_name, p.full_name, pa.user_id::TEXT) AS artist_name,
  paj.status,
  paj.progress,
  paj.error_message,
  paj.started_at,
  paj.completed_at,
  paj.created_at
FROM public.promo_asset_jobs paj
JOIN public.promo_assets pa ON pa.id = paj.promo_asset_id
LEFT JOIN public.profiles p ON p.id = pa.user_id;

GRANT SELECT ON public.promo_asset_jobs TO authenticated;
GRANT SELECT ON public.promo_asset_processing_logs TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_promo_asset_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_promo_asset_job() TO service_role;

COMMENT ON TABLE public.promo_asset_jobs IS 'Backend FFmpeg processing queue for promo asset metadata, thumbnails, and optimized MP4 renditions.';
