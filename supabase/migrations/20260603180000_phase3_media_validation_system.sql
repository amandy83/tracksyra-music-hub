-- Phase 3: Media Validation System.
-- Production-safe, additive, and idempotent.

DO $$
BEGIN
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 3 prerequisite missing: public.releases';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 3 prerequisite missing: public.tracks';
  END IF;
  IF to_regprocedure('public.has_role(uuid,public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'Phase 3 prerequisite missing: public.has_role(uuid, public.app_role)';
  END IF;
END $$;

ALTER TYPE public.release_status ADD VALUE IF NOT EXISTS 'validating';
ALTER TYPE public.release_status ADD VALUE IF NOT EXISTS 'validation_failed';
ALTER TYPE public.release_status ADD VALUE IF NOT EXISTS 'validation_passed';

ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS artwork_hash TEXT;

CREATE TABLE IF NOT EXISTS public.media_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL CHECK (validation_type IN ('audio','artwork','metadata','isrc','copyright','duplicate')),
  status TEXT NOT NULL CHECK (status IN ('pending','passed','failed','warning')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  mime_type TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','passed','failed','warning')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copyright_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  suspicious_title BOOLEAN NOT NULL DEFAULT false,
  suspicious_artist BOOLEAN NOT NULL DEFAULT false,
  suspicious_metadata BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.release_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  matched_release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  matched_track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  duplicate_type TEXT NOT NULL CHECK (duplicate_type IN ('title_artist','artwork_hash','audio_hash','isrc')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning','blocker')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_validation_results_release ON public.media_validation_results(release_id);
CREATE INDEX IF NOT EXISTS idx_media_validation_results_track ON public.media_validation_results(track_id);
CREATE INDEX IF NOT EXISTS idx_media_validation_results_type ON public.media_validation_results(validation_type);
CREATE INDEX IF NOT EXISTS idx_media_validation_results_status ON public.media_validation_results(status);
CREATE INDEX IF NOT EXISTS idx_copyright_flags_release ON public.copyright_flags(release_id);
CREATE INDEX IF NOT EXISTS idx_copyright_flags_track ON public.copyright_flags(track_id);
CREATE INDEX IF NOT EXISTS idx_release_duplicates_release ON public.release_duplicates(release_id);
CREATE INDEX IF NOT EXISTS idx_release_duplicates_type ON public.release_duplicates(duplicate_type);
CREATE INDEX IF NOT EXISTS idx_releases_artwork_hash_validation
  ON public.releases(artwork_hash)
  WHERE artwork_hash IS NOT NULL;

ALTER TABLE public.media_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copyright_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_duplicates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='media_validation_results' AND policyname='owners view media validation results'
  ) THEN
    CREATE POLICY "owners view media validation results"
      ON public.media_validation_results
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.releases r
        WHERE r.id = media_validation_results.release_id
          AND r.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='media_validation_results' AND policyname='admins manage media validation results'
  ) THEN
    CREATE POLICY "admins manage media validation results"
      ON public.media_validation_results
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='copyright_flags' AND policyname='owners view copyright flags'
  ) THEN
    CREATE POLICY "owners view copyright flags"
      ON public.copyright_flags
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.releases r
        WHERE r.id = copyright_flags.release_id
          AND r.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='copyright_flags' AND policyname='admins manage copyright flags'
  ) THEN
    CREATE POLICY "admins manage copyright flags"
      ON public.copyright_flags
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='release_duplicates' AND policyname='owners view release duplicates'
  ) THEN
    CREATE POLICY "owners view release duplicates"
      ON public.release_duplicates
      FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.releases r
        WHERE r.id = release_duplicates.release_id
          AND r.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='release_duplicates' AND policyname='admins manage release duplicates'
  ) THEN
    CREATE POLICY "admins manage release duplicates"
      ON public.release_duplicates
      FOR ALL
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.release_validation_summary(p_release_id UUID)
RETURNS TABLE (
  validation_type TEXT,
  status TEXT,
  failure_count INTEGER,
  warning_count INTEGER,
  latest_details JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      mvr.validation_type,
      mvr.status,
      mvr.details,
      row_number() OVER (PARTITION BY mvr.validation_type ORDER BY mvr.created_at DESC, mvr.id DESC) AS rn
    FROM public.media_validation_results mvr
    WHERE mvr.release_id = p_release_id
  )
  SELECT
    r.validation_type,
    CASE
      WHEN count(*) FILTER (WHERE r.status = 'failed') > 0 THEN 'failed'
      WHEN count(*) FILTER (WHERE r.status = 'warning') > 0 THEN 'warning'
      WHEN count(*) FILTER (WHERE r.status = 'passed') > 0 THEN 'passed'
      ELSE 'pending'
    END AS status,
    count(*) FILTER (WHERE r.status = 'failed')::INTEGER AS failure_count,
    count(*) FILTER (WHERE r.status = 'warning')::INTEGER AS warning_count,
    COALESCE((array_agg(r.details ORDER BY r.rn) FILTER (WHERE r.rn = 1))[1], '{}'::jsonb) AS latest_details
  FROM ranked r
  GROUP BY r.validation_type
  ORDER BY r.validation_type;
$$;

CREATE OR REPLACE FUNCTION public.is_release_media_validation_blocked(p_release_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.media_validation_results
      WHERE release_id = p_release_id
        AND validation_type = 'artwork'
        AND status = 'passed'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.media_validation_results
      WHERE release_id = p_release_id
        AND validation_type = 'metadata'
        AND status = 'passed'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.media_validation_results
      WHERE release_id = p_release_id
        AND validation_type = 'isrc'
        AND status = 'passed'
    )
    OR EXISTS (
      SELECT 1
      FROM public.tracks t
      WHERE t.release_id = p_release_id
        AND NOT EXISTS (
          SELECT 1 FROM public.media_validation_results mvr
          WHERE mvr.release_id = p_release_id
            AND mvr.track_id = t.id
            AND mvr.validation_type = 'audio'
            AND mvr.status = 'passed'
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.media_validation_results
      WHERE release_id = p_release_id
        AND status = 'failed'
    )
    OR EXISTS (
      SELECT 1 FROM public.release_duplicates
      WHERE release_id = p_release_id
        AND severity = 'blocker'
    );
$$;

CREATE OR REPLACE FUNCTION public.record_release_validation(
  p_release_id UUID,
  p_results JSONB,
  p_copyright_flags JSONB DEFAULT '[]'::jsonb,
  p_duplicates JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
  v_result JSONB;
  v_flag JSONB;
  v_duplicate JSONB;
  v_blocked BOOLEAN;
  v_status TEXT;
BEGIN
  SELECT user_id INTO v_owner
  FROM public.releases
  WHERE id = p_release_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Release % not found', p_release_id;
  END IF;

  IF auth.uid() <> v_owner AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to validate release %', p_release_id;
  END IF;

  DELETE FROM public.release_duplicates WHERE release_id = p_release_id;
  DELETE FROM public.copyright_flags WHERE release_id = p_release_id;
  DELETE FROM public.media_validation_results WHERE release_id = p_release_id;

  UPDATE public.releases
  SET status = 'validating'::public.release_status
  WHERE id = p_release_id
    AND status IN ('draft','uploaded','validation_failed','validating');

  FOR v_result IN SELECT * FROM jsonb_array_elements(COALESCE(p_results, '[]'::jsonb))
  LOOP
    INSERT INTO public.media_validation_results (
      release_id,
      track_id,
      validation_type,
      status,
      details,
      width,
      height,
      mime_type,
      validation_status
    )
    VALUES (
      p_release_id,
      NULLIF(v_result->>'track_id', '')::UUID,
      v_result->>'validation_type',
      COALESCE(NULLIF(v_result->>'status', ''), 'pending'),
      COALESCE(v_result->'details', '{}'::jsonb),
      NULLIF(v_result->>'width', '')::INTEGER,
      NULLIF(v_result->>'height', '')::INTEGER,
      NULLIF(v_result->>'mime_type', ''),
      COALESCE(NULLIF(v_result->>'validation_status', ''), COALESCE(NULLIF(v_result->>'status', ''), 'pending'))
    );
  END LOOP;

  FOR v_flag IN SELECT * FROM jsonb_array_elements(COALESCE(p_copyright_flags, '[]'::jsonb))
  LOOP
    INSERT INTO public.copyright_flags (
      release_id,
      track_id,
      suspicious_title,
      suspicious_artist,
      suspicious_metadata,
      reason,
      details
    )
    VALUES (
      p_release_id,
      NULLIF(v_flag->>'track_id', '')::UUID,
      COALESCE((v_flag->>'suspicious_title')::BOOLEAN, false),
      COALESCE((v_flag->>'suspicious_artist')::BOOLEAN, false),
      COALESCE((v_flag->>'suspicious_metadata')::BOOLEAN, false),
      NULLIF(v_flag->>'reason', ''),
      COALESCE(v_flag->'details', '{}'::jsonb)
    );
  END LOOP;

  FOR v_duplicate IN SELECT * FROM jsonb_array_elements(COALESCE(p_duplicates, '[]'::jsonb))
  LOOP
    INSERT INTO public.release_duplicates (
      release_id,
      matched_release_id,
      track_id,
      matched_track_id,
      duplicate_type,
      severity,
      details
    )
    VALUES (
      p_release_id,
      NULLIF(v_duplicate->>'matched_release_id', '')::UUID,
      NULLIF(v_duplicate->>'track_id', '')::UUID,
      NULLIF(v_duplicate->>'matched_track_id', '')::UUID,
      v_duplicate->>'duplicate_type',
      COALESCE(NULLIF(v_duplicate->>'severity', ''), 'warning'),
      COALESCE(v_duplicate->'details', '{}'::jsonb)
    );
  END LOOP;

  v_blocked := public.is_release_media_validation_blocked(p_release_id);
  v_status := CASE WHEN v_blocked THEN 'validation_failed' ELSE 'validation_passed' END;

  UPDATE public.releases
  SET status = v_status::public.release_status,
      rejection_reason = CASE
        WHEN v_blocked THEN 'Media validation failed. Review validation results for exact failure reasons.'
        ELSE rejection_reason
      END
  WHERE id = p_release_id;

  RETURN jsonb_build_object('release_id', p_release_id, 'blocked', v_blocked, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_release_for_admin_review(p_release_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner UUID;
BEGIN
  SELECT user_id INTO v_owner
  FROM public.releases
  WHERE id = p_release_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Release % not found', p_release_id;
  END IF;

  IF auth.uid() <> v_owner AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not allowed to submit release %', p_release_id;
  END IF;

  IF public.is_release_media_validation_blocked(p_release_id) THEN
    UPDATE public.releases
    SET status = 'validation_failed'::public.release_status,
        rejection_reason = 'Media validation failed. Review validation results for exact failure reasons.'
    WHERE id = p_release_id;

    RAISE EXCEPTION 'Release % is blocked by media validation and cannot enter admin review', p_release_id;
  END IF;

  UPDATE public.releases
  SET status = 'under_review'::public.release_status,
      rejection_reason = NULL
  WHERE id = p_release_id
    AND status IN ('uploaded','validation_passed','under_review');

  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'under_review');
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_release_validation_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::TEXT IN ('under_review','approved','sent_to_stores','processing') THEN
    IF public.is_release_media_validation_blocked(NEW.id) THEN
      RAISE EXCEPTION 'Release % is blocked by media validation and cannot move to %', NEW.id, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_release_validation_gate ON public.releases;
CREATE TRIGGER trg_enforce_release_validation_gate
BEFORE UPDATE OF status ON public.releases
FOR EACH ROW
EXECUTE FUNCTION public.enforce_release_validation_gate();

COMMENT ON TABLE public.media_validation_results IS 'Phase 3 validation audit trail for audio, artwork, metadata, ISRC, copyright, and duplicate checks.';
COMMENT ON TABLE public.copyright_flags IS 'Phase 3 copyright review flags surfaced to admins before review/distribution.';
COMMENT ON TABLE public.release_duplicates IS 'Phase 3 duplicate release/audio/artwork/ISRC findings.';
COMMENT ON FUNCTION public.is_release_media_validation_blocked(UUID) IS 'Blocks review/distribution when required validation is missing or failed, or blocker duplicates exist.';
COMMENT ON FUNCTION public.submit_release_for_admin_review(UUID) IS 'Moves a release into admin review only after Phase 3 media validation has passed.';
