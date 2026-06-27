-- Phase 3.6: Promo Assets Studio.
-- Independent promotional video asset management for artists and admins.

DO $$
BEGIN
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 3.6 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 3.6 prerequisite missing: public.tracks';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 3.6 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('spotify_canvas','apple_motion_artwork','youtube_shorts','tiktok_preview','instagram_reel')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds NUMERIC(10,3),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  fps NUMERIC(8,3),
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

CREATE INDEX IF NOT EXISTS idx_promo_assets_user_created ON public.promo_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_assets_release ON public.promo_assets(release_id);
CREATE INDEX IF NOT EXISTS idx_promo_assets_track ON public.promo_assets(track_id);
CREATE INDEX IF NOT EXISTS idx_promo_assets_approval ON public.promo_assets(approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_assets_dsp ON public.promo_assets(dsp_status, created_at DESC);

ALTER TABLE public.promo_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artists view own promo assets" ON public.promo_assets;
CREATE POLICY "artists view own promo assets"
ON public.promo_assets
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "artists create own promo assets" ON public.promo_assets;
CREATE POLICY "artists create own promo assets"
ON public.promo_assets
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND approval_status IN ('draft','processing','under_review')
  AND (release_id IS NULL OR EXISTS (SELECT 1 FROM public.releases r WHERE r.id = release_id AND r.user_id = auth.uid()))
  AND (track_id IS NULL OR EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "artists update own draft promo assets" ON public.promo_assets;
CREATE POLICY "artists update own draft promo assets"
ON public.promo_assets
FOR UPDATE
USING (user_id = auth.uid() AND approval_status IN ('draft','rejected','changes_requested'))
WITH CHECK (user_id = auth.uid() AND approval_status IN ('draft','processing','under_review'));

DROP POLICY IF EXISTS "admins manage promo assets" ON public.promo_assets;
CREATE POLICY "admins manage promo assets"
ON public.promo_assets
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.touch_promo_assets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promo_assets_updated_at ON public.promo_assets;
CREATE TRIGGER trg_promo_assets_updated_at
BEFORE UPDATE ON public.promo_assets
FOR EACH ROW EXECUTE FUNCTION public.touch_promo_assets_updated_at();

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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('promo-assets', 'promo-assets', false, 104857600, ARRAY['video/mp4','video/quicktime','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "artists upload own promo asset objects" ON storage.objects;
CREATE POLICY "artists upload own promo asset objects"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'promo-assets'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "artists view own promo asset objects" ON storage.objects;
CREATE POLICY "artists view own promo asset objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'promo-assets'
  AND auth.uid()::TEXT = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "admins view promo asset objects" ON storage.objects;
CREATE POLICY "admins view promo asset objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'promo-assets'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

GRANT EXECUTE ON FUNCTION public.review_promo_asset(UUID, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_promo_asset_validation(UUID, TEXT, JSONB, NUMERIC, INTEGER, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_asset_analytics_summary() TO authenticated;

COMMENT ON TABLE public.promo_assets IS 'Independent Promo Assets Studio assets for Canvas, motion artwork, shorts, previews, and reels.';
