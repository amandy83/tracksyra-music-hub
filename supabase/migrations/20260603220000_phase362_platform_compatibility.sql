-- Phase 3.6.2: Promo asset platform compatibility validation.

CREATE TABLE IF NOT EXISTS public.promo_asset_platform_validation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_asset_id UUID NOT NULL REFERENCES public.promo_assets(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('spotify_canvas','apple_motion_artwork','youtube_shorts','tiktok_preview','instagram_reels')),
  status TEXT NOT NULL CHECK (status IN ('pass','warning','fail')),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  validation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_asset_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_asset ON public.promo_asset_platform_validation(promo_asset_id);
CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_status ON public.promo_asset_platform_validation(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_platform ON public.promo_asset_platform_validation(platform, status);

ALTER TABLE public.promo_asset_platform_validation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own promo asset platform validation" ON public.promo_asset_platform_validation;
CREATE POLICY "artists view own promo asset platform validation"
ON public.promo_asset_platform_validation
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.promo_assets pa
    WHERE pa.id = promo_asset_platform_validation.promo_asset_id
      AND pa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage promo asset platform validation" ON public.promo_asset_platform_validation;
CREATE POLICY "admins manage promo asset platform validation"
ON public.promo_asset_platform_validation
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.validate_promo_asset_platforms(asset_id UUID)
RETURNS TABLE (
  id UUID,
  promo_asset_id UUID,
  platform TEXT,
  status TEXT,
  score INTEGER,
  validation_details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    pav.id,
    pav.promo_asset_id,
    pav.platform,
    pav.status,
    pav.score,
    pav.validation_details,
    pav.created_at
  FROM public.promo_asset_platform_validation pav
  JOIN public.promo_assets pa ON pa.id = pav.promo_asset_id
  WHERE pav.promo_asset_id = asset_id
    AND (
      pa.user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY
    CASE pav.platform
      WHEN 'spotify_canvas' THEN 1
      WHEN 'apple_motion_artwork' THEN 2
      WHEN 'youtube_shorts' THEN 3
      WHEN 'tiktok_preview' THEN 4
      WHEN 'instagram_reels' THEN 5
      ELSE 99
    END;
$$;

CREATE OR REPLACE VIEW public.promo_asset_compatibility_matrix
WITH (security_invoker = true) AS
SELECT
  pa.id AS promo_asset_id,
  pa.title AS asset_title,
  pa.user_id AS artist_id,
  COALESCE(p.artist_name, p.full_name, pa.user_id::TEXT) AS artist_name,
  pa.approval_status,
  pa.optimized_url,
  bool_or(pav.status = 'fail') AS has_failures,
  bool_or(pav.status = 'warning') AS has_warnings,
  COALESCE(jsonb_object_agg(
    pav.platform,
    jsonb_build_object(
      'status', pav.status,
      'score', pav.score,
      'details', pav.validation_details
    )
  ) FILTER (WHERE pav.platform IS NOT NULL), '{}'::jsonb) AS platform_results,
  max(pav.created_at) AS validated_at
FROM public.promo_assets pa
LEFT JOIN public.profiles p ON p.id = pa.user_id
LEFT JOIN public.promo_asset_platform_validation pav ON pav.promo_asset_id = pa.id
GROUP BY pa.id, pa.title, pa.user_id, p.artist_name, p.full_name, pa.approval_status, pa.optimized_url;

CREATE OR REPLACE FUNCTION public.enqueue_promo_asset_platform_revalidation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.promo_asset_platform_validation
  WHERE promo_asset_id = NEW.id;

  IF OLD.optimized_url IS NOT NULL
     AND NEW.optimized_url IS DISTINCT FROM OLD.optimized_url
     AND to_regclass('public.promo_asset_jobs') IS NOT NULL THEN
    INSERT INTO public.promo_asset_jobs (promo_asset_id, status, progress)
    VALUES (NEW.id, 'queued', 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promo_asset_platform_revalidation ON public.promo_assets;
CREATE TRIGGER trg_promo_asset_platform_revalidation
AFTER UPDATE OF optimized_url ON public.promo_assets
FOR EACH ROW
WHEN (NEW.optimized_url IS DISTINCT FROM OLD.optimized_url)
EXECUTE FUNCTION public.enqueue_promo_asset_platform_revalidation();

GRANT SELECT ON public.promo_asset_platform_validation TO authenticated;
GRANT SELECT ON public.promo_asset_compatibility_matrix TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_asset_platforms(UUID) TO authenticated;

COMMENT ON TABLE public.promo_asset_platform_validation IS 'Per-platform compatibility results generated from real FFprobe metadata for optimized promo videos.';
