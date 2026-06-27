-- Unified MusicRelease compatibility layer.
-- Existing tables remain in place. New code should treat releases + tracks as the authoritative write path.

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

CREATE OR REPLACE VIEW public.music_releases AS
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
  s.created_at
FROM public.songs s;
