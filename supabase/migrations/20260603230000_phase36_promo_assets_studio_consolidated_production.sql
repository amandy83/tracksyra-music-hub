-- Promo Assets Studio consolidated production deployment.
-- Safe to run repeatedly in Supabase SQL Editor.

BEGIN;

DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    v_missing := array_append(v_missing, 'public.profiles');
  END IF;
  IF to_regclass('public.releases') IS NULL THEN
    v_missing := array_append(v_missing, 'public.releases');
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    v_missing := array_append(v_missing, 'public.tracks');
  END IF;
  IF to_regclass('public.upload_logs') IS NULL THEN
    v_missing := array_append(v_missing, 'public.upload_logs');
  END IF;
  IF to_regtype('public.app_role') IS NULL THEN
    v_missing := array_append(v_missing, 'type public.app_role');
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    v_missing := array_append(v_missing, 'function public.has_role(uuid, public.app_role)');
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    v_missing := array_append(v_missing, 'function public.set_updated_at()');
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    v_missing := array_append(v_missing, 'storage.buckets');
  END IF;
  IF to_regclass('storage.objects') IS NULL THEN
    v_missing := array_append(v_missing, 'storage.objects');
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
    ) THEN
      v_missing := array_append(v_missing, 'public.profiles.id');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'artist_name'
    ) THEN
      v_missing := array_append(v_missing, 'public.profiles.artist_name');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name'
    ) THEN
      v_missing := array_append(v_missing, 'public.profiles.full_name');
    END IF;
  END IF;

  IF to_regclass('public.releases') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'releases' AND column_name = 'id'
    ) THEN
      v_missing := array_append(v_missing, 'public.releases.id');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'releases' AND column_name = 'user_id'
    ) THEN
      v_missing := array_append(v_missing, 'public.releases.user_id');
    END IF;
  END IF;

  IF to_regclass('public.tracks') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'id'
    ) THEN
      v_missing := array_append(v_missing, 'public.tracks.id');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'user_id'
    ) THEN
      v_missing := array_append(v_missing, 'public.tracks.user_id');
    END IF;
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Promo Assets Studio deployment prerequisite(s) missing: %', array_to_string(v_missing, ', ');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('spotify_canvas','apple_motion_artwork','youtube_shorts','tiktok_preview','instagram_reel','instagram_reels')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds NUMERIC(10,3),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  fps NUMERIC(8,3),
  bitrate BIGINT,
  codec TEXT,
  audio_codec TEXT,
  optimized_url TEXT,
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 104857600),
  mime_type TEXT NOT NULL DEFAULT 'video/mp4' CHECK (mime_type IN ('video/mp4','video/quicktime')),
  validation_status TEXT NOT NULL DEFAULT 'processing' CHECK (validation_status IN ('draft','processing','passed','failed')),
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','processing','under_review','approved','rejected','live','changes_requested')),
  dsp_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (dsp_status IN ('not_submitted','queued','syncing','delivered','failed','live')),
  rejection_reason TEXT,
  validation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  views BIGINT NOT NULL DEFAULT 0 CHECK (views >= 0),
  clicks BIGINT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  external_asset_id TEXT,
  provider_name TEXT CHECK (provider_name IS NULL OR provider_name IN ('too_lost','fuga','symphonyos','internal_upload')),
  sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (sync_status IN ('not_synced','queued','syncing','synced','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_promo_assets_user_created ON public.promo_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_assets_release ON public.promo_assets(release_id);
CREATE INDEX IF NOT EXISTS idx_promo_assets_track ON public.promo_assets(track_id);
CREATE INDEX IF NOT EXISTS idx_promo_assets_approval ON public.promo_assets(approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_assets_dsp ON public.promo_assets(dsp_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_asset_jobs_asset_created ON public.promo_asset_jobs(promo_asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_asset_jobs_status_created ON public.promo_asset_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_asset ON public.promo_asset_platform_validation(promo_asset_id);
CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_status ON public.promo_asset_platform_validation(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_asset_platform_validation_platform ON public.promo_asset_platform_validation(platform, status);

ALTER TABLE public.promo_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_asset_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_asset_platform_validation ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_assets' AND policyname = 'artists view own promo assets'
  ) THEN
    DROP POLICY "artists view own promo assets" ON public.promo_assets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_assets' AND policyname = 'artists create own promo assets'
  ) THEN
    DROP POLICY "artists create own promo assets" ON public.promo_assets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_assets' AND policyname = 'artists update own draft promo assets'
  ) THEN
    DROP POLICY "artists update own draft promo assets" ON public.promo_assets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_assets' AND policyname = 'admins manage promo assets'
  ) THEN
    DROP POLICY "admins manage promo assets" ON public.promo_assets;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_asset_jobs' AND policyname = 'artists view own promo asset jobs'
  ) THEN
    DROP POLICY "artists view own promo asset jobs" ON public.promo_asset_jobs;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_asset_jobs' AND policyname = 'admins manage promo asset jobs'
  ) THEN
    DROP POLICY "admins manage promo asset jobs" ON public.promo_asset_jobs;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_asset_platform_validation' AND policyname = 'artists view own promo asset platform validation'
  ) THEN
    DROP POLICY "artists view own promo asset platform validation" ON public.promo_asset_platform_validation;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'promo_asset_platform_validation' AND policyname = 'admins manage promo asset platform validation'
  ) THEN
    DROP POLICY "admins manage promo asset platform validation" ON public.promo_asset_platform_validation;
  END IF;
END $$;

CREATE POLICY "artists view own promo assets"
ON public.promo_assets
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "artists create own promo assets"
ON public.promo_assets
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND approval_status IN ('draft','processing','under_review')
  AND (release_id IS NULL OR EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid()))
  AND (track_id IS NULL OR EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid()))
);

CREATE POLICY "artists update own draft promo assets"
ON public.promo_assets
FOR UPDATE
USING (user_id = auth.uid() AND approval_status IN ('draft','rejected','changes_requested'))
WITH CHECK (user_id = auth.uid() AND approval_status IN ('draft','processing','under_review'));

CREATE POLICY "admins manage promo assets"
ON public.promo_assets
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

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

CREATE POLICY "admins manage promo asset jobs"
ON public.promo_asset_jobs
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

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

CREATE POLICY "admins manage promo asset platform validation"
ON public.promo_asset_platform_validation
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'artists upload own promo asset objects'
  ) THEN
    DROP POLICY "artists upload own promo asset objects" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'artists view own promo asset objects'
  ) THEN
    DROP POLICY "artists view own promo asset objects" ON storage.objects;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'admins view promo asset objects'
  ) THEN
    DROP POLICY "admins view promo asset objects" ON storage.objects;
  END IF;
END $$;

CREATE POLICY "artists upload own promo asset objects"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'promo-assets'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

CREATE POLICY "artists view own promo asset objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'promo-assets'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

CREATE POLICY "admins view promo asset objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'promo-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.review_promo_asset(
  p_asset_id UUID,
  p_action TEXT,
  p_reason TEXT
)
RETURNS public.promo_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.promo_assets;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  IF p_action NOT IN ('approve','reject','changes_requested') THEN
    RAISE EXCEPTION 'Unsupported promo asset action %', p_action;
  END IF;

  IF p_action IN ('reject','changes_requested') AND (p_reason IS NULL OR length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'Reason is required for rejection or changes requested';
  END IF;

  UPDATE public.promo_assets
  SET approval_status = CASE
        WHEN p_action = 'approve' THEN 'approved'
        WHEN p_action = 'reject' THEN 'rejected'
        ELSE 'changes_requested'
      END,
      dsp_status = CASE WHEN p_action = 'approve' THEN 'queued' ELSE 'not_submitted' END,
      sync_status = CASE WHEN p_action = 'approve' THEN 'queued' ELSE 'not_synced' END,
      rejection_reason = CASE WHEN p_action = 'approve' THEN NULL ELSE trim(p_reason) END
  WHERE id = p_asset_id
  RETURNING * INTO v_asset;

  IF v_asset.id IS NULL THEN
    RAISE EXCEPTION 'Promo asset % not found', p_asset_id;
  END IF;

  IF to_regclass('public.app_notifications') IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (
      v_asset.user_id,
      CASE
        WHEN p_action = 'approve' THEN 'Promo asset approved'
        WHEN p_action = 'reject' THEN 'Promo asset rejected'
        ELSE 'Promo asset changes requested'
      END,
      CASE
        WHEN p_action = 'approve' THEN 'Your promo asset "' || v_asset.title || '" was approved.'
        WHEN p_action = 'reject' THEN 'Your promo asset "' || v_asset.title || '" was rejected: ' || trim(p_reason)
        ELSE 'Changes were requested for "' || v_asset.title || '": ' || trim(p_reason)
      END,
      'promo_asset_' || p_action,
      'promo_assets',
      v_asset.id
    );
  END IF;

  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_promo_asset_validation(
  p_asset_id UUID,
  p_validation_status TEXT,
  p_validation_details JSONB,
  p_duration_seconds NUMERIC DEFAULT NULL,
  p_width INTEGER DEFAULT NULL,
  p_height INTEGER DEFAULT NULL,
  p_fps NUMERIC DEFAULT NULL
)
RETURNS public.promo_assets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset public.promo_assets;
BEGIN
  IF p_validation_status NOT IN ('passed','failed') THEN
    RAISE EXCEPTION 'Validation status must be passed or failed';
  END IF;

  UPDATE public.promo_assets
  SET validation_status = p_validation_status,
      validation_details = COALESCE(p_validation_details, '{}'::jsonb),
      duration_seconds = COALESCE(p_duration_seconds, duration_seconds),
      width = COALESCE(p_width, width),
      height = COALESCE(p_height, height),
      fps = COALESCE(p_fps, fps),
      approval_status = CASE
        WHEN p_validation_status = 'passed' THEN 'under_review'
        ELSE 'rejected'
      END,
      rejection_reason = CASE
        WHEN p_validation_status = 'failed' THEN COALESCE(p_validation_details->>'summary', 'Promo asset validation failed.')
        ELSE rejection_reason
      END
  WHERE id = p_asset_id
  RETURNING * INTO v_asset;

  IF v_asset.id IS NULL THEN
    RAISE EXCEPTION 'Promo asset % not found', p_asset_id;
  END IF;

  RETURN v_asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.promo_asset_analytics_summary()
RETURNS TABLE (
  total_assets INTEGER,
  approved_assets INTEGER,
  pending_assets INTEGER,
  rejected_assets INTEGER,
  dsp_delivered_assets INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::INTEGER AS total_assets,
    COUNT(*) FILTER (WHERE approval_status IN ('approved','live'))::INTEGER AS approved_assets,
    COUNT(*) FILTER (WHERE approval_status IN ('processing','under_review','draft'))::INTEGER AS pending_assets,
    COUNT(*) FILTER (WHERE approval_status = 'rejected')::INTEGER AS rejected_assets,
    COUNT(*) FILTER (WHERE dsp_status IN ('delivered','live'))::INTEGER AS dsp_delivered_assets
  FROM public.promo_assets
  WHERE user_id = auth.uid()
     OR public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.enqueue_promo_asset_processing_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.promo_asset_jobs (promo_asset_id, status, progress)
  VALUES (NEW.id, 'queued', 0);
  RETURN NEW;
END;
$$;

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

DROP TRIGGER IF EXISTS trg_promo_assets_updated_at ON public.promo_assets;
CREATE TRIGGER trg_promo_assets_updated_at
BEFORE UPDATE ON public.promo_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_enqueue_promo_asset_processing_job ON public.promo_assets;
CREATE TRIGGER trg_enqueue_promo_asset_processing_job
AFTER INSERT ON public.promo_assets
FOR EACH ROW EXECUTE FUNCTION public.enqueue_promo_asset_processing_job();

DROP TRIGGER IF EXISTS trg_promo_asset_platform_revalidation ON public.promo_assets;
CREATE TRIGGER trg_promo_asset_platform_revalidation
AFTER UPDATE OF optimized_url ON public.promo_assets
FOR EACH ROW
WHEN (NEW.optimized_url IS DISTINCT FROM OLD.optimized_url)
EXECUTE FUNCTION public.enqueue_promo_asset_platform_revalidation();

DO $$
BEGIN
  IF to_regclass('public.promo_asset_processing_logs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'promo_asset_processing_logs'
         AND c.relkind = 'v'
     ) THEN
    RAISE EXCEPTION 'public.promo_asset_processing_logs exists and is not a view';
  END IF;

  IF to_regclass('public.promo_asset_compatibility_matrix') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname = 'promo_asset_compatibility_matrix'
         AND c.relkind = 'v'
     ) THEN
    RAISE EXCEPTION 'public.promo_asset_compatibility_matrix exists and is not a view';
  END IF;
END $$;

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

CREATE OR REPLACE VIEW public.promo_asset_compatibility_matrix
WITH (security_invoker = true) AS
SELECT
  pa.id AS promo_asset_id,
  pa.title AS asset_title,
  pa.user_id AS artist_id,
  COALESCE(p.artist_name, p.full_name, pa.user_id::TEXT) AS artist_name,
  pa.approval_status,
  pa.optimized_url,
  COALESCE(bool_or(pav.status = 'fail'), false) AS has_failures,
  COALESCE(bool_or(pav.status = 'warning'), false) AS has_warnings,
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('promo-assets', 'promo-assets', false, 104857600, ARRAY['video/mp4','video/quicktime','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO public.promo_asset_jobs (promo_asset_id, status, progress)
SELECT pa.id, 'queued', 0
FROM public.promo_assets pa
WHERE (pa.optimized_url IS NULL OR pa.thumbnail_url IS NULL OR pa.validation_status = 'processing')
  AND NOT EXISTS (
    SELECT 1
    FROM public.promo_asset_jobs paj
    WHERE paj.promo_asset_id = pa.id
  );

GRANT SELECT, INSERT, UPDATE ON public.promo_assets TO authenticated;
GRANT SELECT ON public.promo_asset_jobs TO authenticated;
GRANT SELECT ON public.promo_asset_platform_validation TO authenticated;
GRANT SELECT ON public.promo_asset_processing_logs TO authenticated;
GRANT SELECT ON public.promo_asset_compatibility_matrix TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_promo_asset(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promo_asset_analytics_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_asset_platforms(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_promo_asset_validation(UUID, TEXT, JSONB, NUMERIC, INTEGER, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_next_promo_asset_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_promo_asset_validation(UUID, TEXT, JSONB, NUMERIC, INTEGER, INTEGER, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_promo_asset_job() TO service_role;

DO $$
DECLARE
  v_table REGCLASS;
  v_schema TEXT;
  v_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'public.promo_assets'::REGCLASS,
      'public.promo_asset_jobs'::REGCLASS,
      'public.promo_asset_platform_validation'::REGCLASS
    ]
    LOOP
      SELECT n.nspname, c.relname
      INTO v_schema, v_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = v_table;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = v_schema
          AND tablename = v_name
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', v_table);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMENT ON TABLE public.promo_assets IS 'Independent Promo Assets Studio assets for Canvas, motion artwork, shorts, previews, and reels.';
COMMENT ON TABLE public.promo_asset_jobs IS 'Backend FFmpeg processing queue for promo asset metadata, thumbnails, and optimized MP4 renditions.';
COMMENT ON TABLE public.promo_asset_platform_validation IS 'Per-platform compatibility results generated from real FFprobe metadata for optimized promo videos.';

COMMIT;
