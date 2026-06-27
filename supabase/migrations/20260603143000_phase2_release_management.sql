-- Phase 2 Release Management: drafts, release package constraints, contributors, and upload guardrails.

DO $$
BEGIN
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 Release Management prerequisite missing: public.releases. Apply/repair 20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql first.';
  END IF;
  IF to_regclass('public.tracks') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 Release Management prerequisite missing: public.tracks. Apply/repair 20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql first.';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 Release Management prerequisite missing: public.profiles. Apply/repair 20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql first.';
  END IF;
  IF to_regclass('public.songs') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 Release Management prerequisite missing: public.songs. Apply/repair 20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql first.';
  END IF;
  IF to_regclass('public.upload_logs') IS NULL THEN
    RAISE EXCEPTION 'Phase 2 Release Management prerequisite missing: public.upload_logs. Apply/repair 20260514092104_7bcf91aa-f204-4bcf-b7bb-6311114c905e.sql first.';
  END IF;
END $$;

ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE public.releases
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.songs SET artist_id = user_id WHERE artist_id IS NULL;
UPDATE public.releases SET artist_id = user_id WHERE artist_id IS NULL;
UPDATE public.tracks SET artist_id = user_id WHERE artist_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON public.songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_artist_id ON public.releases(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON public.tracks(artist_id);

CREATE OR REPLACE FUNCTION public.set_artist_id_from_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.artist_id IS NULL THEN
    NEW.artist_id := NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_songs_artist_id ON public.songs;
CREATE TRIGGER trg_songs_artist_id
BEFORE INSERT OR UPDATE ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.set_artist_id_from_user_id();

DROP TRIGGER IF EXISTS trg_releases_artist_id ON public.releases;
CREATE TRIGGER trg_releases_artist_id
BEFORE INSERT OR UPDATE ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.set_artist_id_from_user_id();

DROP TRIGGER IF EXISTS trg_tracks_artist_id ON public.tracks;
CREATE TRIGGER trg_tracks_artist_id
BEFORE INSERT OR UPDATE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.set_artist_id_from_user_id();

ALTER TABLE public.upload_logs
  ADD COLUMN IF NOT EXISTS release_type TEXT,
  ADD COLUMN IF NOT EXISTS track_count INTEGER,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'releases_release_type_check'
      AND conrelid = 'public.releases'::regclass
  ) THEN
    ALTER TABLE public.releases
      ADD CONSTRAINT releases_release_type_check CHECK (release_type IN ('single','ep','album'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tracks_audio_file_size_check'
      AND conrelid = 'public.tracks'::regclass
  ) THEN
    ALTER TABLE public.tracks
      ADD CONSTRAINT tracks_audio_file_size_check CHECK (file_size_bytes IS NULL OR (file_size_bytes > 0 AND file_size_bytes <= 524288000));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.release_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  role TEXT NOT NULL CHECK (role IN ('primary_artist','featured_artist','producer','composer','lyricist','songwriter','engineer','label')),
  share_percent NUMERIC(5,2) CHECK (share_percent IS NULL OR (share_percent >= 0 AND share_percent <= 100)),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_contributors_release ON public.release_contributors(release_id);
CREATE INDEX IF NOT EXISTS idx_release_contributors_track ON public.release_contributors(track_id);
CREATE INDEX IF NOT EXISTS idx_release_contributors_user ON public.release_contributors(user_id);

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.release_contributors'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.release_contributors'::regclass AND attname = 'release_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.release_contributors'::regclass AND attname = 'track_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.release_contributors'::regclass AND attname = 'name'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.release_contributors'::regclass AND attname = 'role')
    ]::smallint[]
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.release_contributors DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_release_contributors_release_scope
ON public.release_contributors(release_id, name, role)
WHERE track_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_release_contributors_track_scope
ON public.release_contributors(release_id, track_id, name, role)
WHERE track_id IS NOT NULL;

ALTER TABLE public.release_contributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner select release contributors" ON public.release_contributors;
CREATE POLICY "owner select release contributors" ON public.release_contributors
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner insert release contributors" ON public.release_contributors;
CREATE POLICY "owner insert release contributors" ON public.release_contributors
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
);

DROP POLICY IF EXISTS "owner update draft release contributors" ON public.release_contributors;
CREATE POLICY "owner update draft release contributors" ON public.release_contributors
FOR UPDATE USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner delete draft release contributors" ON public.release_contributors;
CREATE POLICY "owner delete draft release contributors" ON public.release_contributors
FOR DELETE USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
);

DROP POLICY IF EXISTS "admin all release contributors" ON public.release_contributors;
CREATE POLICY "admin all release contributors" ON public.release_contributors
FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_release_contributors_updated ON public.release_contributors;
CREATE TRIGGER trg_release_contributors_updated
BEFORE UPDATE ON public.release_contributors
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_contributor_mutation_unless_release_editable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release_id UUID;
  v_release_status TEXT;
BEGIN
  v_release_id := COALESCE(NEW.release_id, OLD.release_id);
  SELECT status INTO v_release_status
  FROM public.releases
  WHERE id = v_release_id;

  IF v_release_status IS NULL THEN
    RAISE EXCEPTION 'Contributor mutation blocked: release % does not exist', v_release_id;
  END IF;

  IF v_release_status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Contributor mutation blocked: release % is not editable while status is %', v_release_id, v_release_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_contributor_mutation_unless_release_editable ON public.release_contributors;
CREATE TRIGGER trg_prevent_contributor_mutation_unless_release_editable
BEFORE INSERT OR UPDATE OR DELETE ON public.release_contributors
FOR EACH ROW EXECUTE FUNCTION public.prevent_contributor_mutation_unless_release_editable();

CREATE OR REPLACE FUNCTION public.validate_release_track_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'Direct insert of submitted releases is not allowed. Insert as draft, add tracks/contributors, then update status.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> 'draft' THEN
    SELECT count(*) INTO v_track_count FROM public.tracks WHERE release_id = NEW.id;
    IF NEW.release_type = 'single' AND v_track_count <> 1 THEN
      RAISE EXCEPTION 'Single releases must contain exactly 1 track';
    ELSIF NEW.release_type = 'ep' AND (v_track_count < 2 OR v_track_count > 6) THEN
      RAISE EXCEPTION 'EP releases must contain 2-6 tracks';
    ELSIF NEW.release_type = 'album' AND (v_track_count < 7 OR v_track_count > 40) THEN
      RAISE EXCEPTION 'Album releases must contain 7-40 tracks';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_release_track_count ON public.releases;
CREATE TRIGGER trg_validate_release_track_count
BEFORE INSERT OR UPDATE OF status, release_type ON public.releases
FOR EACH ROW
EXECUTE FUNCTION public.validate_release_track_count();

CREATE OR REPLACE FUNCTION public.prevent_track_mutation_unless_release_editable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release_id UUID;
  v_release_status TEXT;
BEGIN
  v_release_id := COALESCE(NEW.release_id, OLD.release_id);
  SELECT status INTO v_release_status
  FROM public.releases
  WHERE id = v_release_id;

  IF v_release_status IS NULL THEN
    RAISE EXCEPTION 'Track mutation blocked: release % does not exist', v_release_id;
  END IF;

  IF v_release_status NOT IN ('draft','rejected') THEN
    RAISE EXCEPTION 'Track mutation blocked: release % is not editable while status is %', v_release_id, v_release_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_track_mutation_unless_release_editable ON public.tracks;
CREATE TRIGGER trg_prevent_track_mutation_unless_release_editable
BEFORE INSERT OR UPDATE OR DELETE ON public.tracks
FOR EACH ROW EXECUTE FUNCTION public.prevent_track_mutation_unless_release_editable();

DROP POLICY IF EXISTS "owner insert tracks" ON public.tracks;
CREATE POLICY "owner insert tracks" ON public.tracks
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
);

DROP POLICY IF EXISTS "owner update tracks" ON public.tracks;
CREATE POLICY "owner update tracks" ON public.tracks
FOR UPDATE USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
);

DROP POLICY IF EXISTS "owner delete tracks" ON public.tracks;
CREATE POLICY "owner delete tracks" ON public.tracks
FOR DELETE USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.releases r
    WHERE r.id = release_id
      AND r.user_id = auth.uid()
      AND r.status IN ('draft','rejected')
  )
);

CREATE OR REPLACE FUNCTION public.set_release_submitted_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'draft' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_release_submitted_at ON public.releases;
CREATE TRIGGER trg_set_release_submitted_at
BEFORE INSERT OR UPDATE OF status ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.set_release_submitted_at();

-- Supabase Storage guardrails. Audio remains private; covers remain public but owner-scoped for writes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('audio', 'audio', false, 524288000, ARRAY['audio/mpeg','audio/wav','audio/x-wav','audio/flac','audio/aiff','audio/x-aiff']),
  ('covers', 'covers', true, 10485760, ARRAY['image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Audio owner upload" ON storage.objects;
CREATE POLICY "Audio owner upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'audio'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND lower(coalesce((storage.extension(name)), '')) IN ('wav','flac','mp3','aiff','aif')
);

DROP POLICY IF EXISTS "Covers owner upload" ON storage.objects;
CREATE POLICY "Covers owner upload" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND lower(coalesce((storage.extension(name)), '')) IN ('jpg','jpeg','png')
);

DROP VIEW IF EXISTS public.music_releases CASCADE;

CREATE VIEW public.music_releases AS
SELECT
  r.id,
  r.title,
  COALESCE(r.artist_id, r.user_id) AS artist_id,
  r.user_id AS owner_user_id,
  r.primary_artist AS primary_artist_name,
  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT trim(featured_artist))
      FROM public.tracks t
      CROSS JOIN LATERAL regexp_split_to_table(COALESCE(t.featured_artists, ''), ',') AS featured_artist
      WHERE t.release_id = r.id AND trim(featured_artist) <> ''
    ),
    '[]'::jsonb
  ) AS featured_artists,
  r.genre,
  r.language,
  r.release_date,
  r.cover_art_url AS cover_url,
  r.release_type AS type,
  r.status::text AS status,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'trackId', t.id,
        'title', t.title,
        'audioUrl', t.audio_url,
        'isrc', t.isrc,
        'explicit', t.explicit,
        'durationSec', t.duration_sec,
        'fileSizeBytes', t.file_size_bytes,
        'audioFormat', t.audio_format,
        'trackNumber', t.track_number
      )
      ORDER BY t.track_number, t.created_at
    )
    FROM public.tracks t
    WHERE t.release_id = r.id
  ) AS audio_files,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', c.name,
        'role', c.role,
        'trackId', c.track_id,
        'sharePercent', c.share_percent
      )
      ORDER BY c.created_at
    )
    FROM public.release_contributors c
    WHERE c.release_id = r.id
  ) AS contributors,
  r.created_at
FROM public.releases r
UNION ALL
SELECT
  s.id,
  s.title,
  COALESCE(s.artist_id, s.user_id) AS artist_id,
  s.user_id AS owner_user_id,
  s.primary_artist AS primary_artist_name,
  COALESCE(to_jsonb(string_to_array(NULLIF(s.featured_artists, ''), ',')), '[]'::jsonb) AS featured_artists,
  s.genre,
  s.language,
  s.release_date,
  s.cover_art_url AS cover_url,
  'single' AS type,
  s.status,
  jsonb_build_array(
    jsonb_build_object(
      'trackId', s.id,
      'title', s.title,
      'audioUrl', s.audio_url,
      'isrc', s.isrc,
      'explicit', s.explicit,
      'durationSec', NULL,
      'fileSizeBytes', NULL,
      'audioFormat', NULL,
      'trackNumber', 1
    )
  ) AS audio_files,
  '[]'::jsonb AS contributors,
  s.created_at
FROM public.songs s;

NOTIFY pgrst, 'reload schema';
