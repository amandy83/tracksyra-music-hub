-- Safe repair for 20260506074939_420563c5-2c02-4864-9103-2dd59fe6296a.sql.
-- Idempotent, production-safe, and non-destructive.

BEGIN;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite: auth.users';
  END IF;

  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite: storage.buckets';
  END IF;

  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite: storage.objects';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  artist_name TEXT,
  phone TEXT,
  country TEXT,
  main_genre TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS id UUID,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS artist_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS main_genre TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'p'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.profiles
      GROUP BY id
      HAVING id IS NULL OR count(*) > 1
    ) THEN
      RAISE NOTICE 'Skipped profiles primary key: id contains NULL or duplicate values.';
    ELSE
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE created_at IS NULL OR updated_at IS NULL
  ) THEN
    ALTER TABLE public.profiles
      ALTER COLUMN created_at SET NOT NULL,
      ALTER COLUMN updated_at SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped profiles timestamp NOT NULL constraints: NULL values exist.';
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Profiles viewable by owner'
  ) THEN
    CREATE POLICY "Profiles viewable by owner"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Insert own profile'
  ) THEN
    CREATE POLICY "Insert own profile"
      ON public.profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Update own profile'
  ) THEN
    CREATE POLICY "Update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Delete own profile'
  ) THEN
    CREATE POLICY "Delete own profile"
      ON public.profiles FOR DELETE
      USING (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, artist_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'artist_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  primary_artist TEXT NOT NULL,
  featured_artists TEXT,
  songwriter_credits TEXT,
  genre TEXT,
  language TEXT,
  release_date DATE,
  isrc TEXT,
  upc TEXT,
  copyright_info TEXT,
  explicit BOOLEAN NOT NULL DEFAULT false,
  lyrics TEXT,
  audio_url TEXT,
  cover_art_url TEXT,
  platforms TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS primary_artist TEXT,
  ADD COLUMN IF NOT EXISTS featured_artists TEXT,
  ADD COLUMN IF NOT EXISTS songwriter_credits TEXT,
  ADD COLUMN IF NOT EXISTS genre TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS release_date DATE,
  ADD COLUMN IF NOT EXISTS isrc TEXT,
  ADD COLUMN IF NOT EXISTS upc TEXT,
  ADD COLUMN IF NOT EXISTS copyright_info TEXT,
  ADD COLUMN IF NOT EXISTS explicit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lyrics TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_art_url TEXT,
  ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.songs
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN explicit SET DEFAULT false,
  ALTER COLUMN platforms SET DEFAULT '{}',
  ALTER COLUMN status SET DEFAULT 'submitted',
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.songs'::regclass
      AND contype = 'p'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.songs
      GROUP BY id
      HAVING id IS NULL OR count(*) > 1
    ) THEN
      RAISE NOTICE 'Skipped songs primary key: id contains NULL or duplicate values.';
    ELSE
      ALTER TABLE public.songs ADD CONSTRAINT songs_pkey PRIMARY KEY (id);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.songs'::regclass
      AND conname = 'songs_user_id_fkey'
  ) THEN
    ALTER TABLE public.songs
      ADD CONSTRAINT songs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE public.songs VALIDATE CONSTRAINT songs_user_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.songs
    WHERE user_id IS NULL
       OR title IS NULL
       OR primary_artist IS NULL
       OR explicit IS NULL
       OR platforms IS NULL
       OR status IS NULL
       OR created_at IS NULL
       OR updated_at IS NULL
  ) THEN
    ALTER TABLE public.songs
      ALTER COLUMN user_id SET NOT NULL,
      ALTER COLUMN title SET NOT NULL,
      ALTER COLUMN primary_artist SET NOT NULL,
      ALTER COLUMN explicit SET NOT NULL,
      ALTER COLUMN platforms SET NOT NULL,
      ALTER COLUMN status SET NOT NULL,
      ALTER COLUMN created_at SET NOT NULL,
      ALTER COLUMN updated_at SET NOT NULL;
  ELSE
    RAISE NOTICE 'Skipped songs NOT NULL constraints: NULL values exist in required columns.';
  END IF;
END $$;

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'songs'
      AND policyname = 'Songs viewable by owner'
  ) THEN
    CREATE POLICY "Songs viewable by owner"
      ON public.songs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'songs'
      AND policyname = 'Insert own songs'
  ) THEN
    CREATE POLICY "Insert own songs"
      ON public.songs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'songs'
      AND policyname = 'Update own songs'
  ) THEN
    CREATE POLICY "Update own songs"
      ON public.songs FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'songs'
      AND policyname = 'Delete own songs'
  ) THEN
    CREATE POLICY "Delete own songs"
      ON public.songs FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_songs_updated ON public.songs;
CREATE TRIGGER trg_songs_updated
BEFORE UPDATE ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('covers', 'covers', true),
  ('audio', 'audio', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars public read'
  ) THEN
    CREATE POLICY "Avatars public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars owner upload'
  ) THEN
    CREATE POLICY "Avatars owner upload"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars owner update'
  ) THEN
    CREATE POLICY "Avatars owner update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Avatars owner delete'
  ) THEN
    CREATE POLICY "Avatars owner delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Covers public read'
  ) THEN
    CREATE POLICY "Covers public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'covers');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Covers owner upload'
  ) THEN
    CREATE POLICY "Covers owner upload"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Covers owner update'
  ) THEN
    CREATE POLICY "Covers owner update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Covers owner delete'
  ) THEN
    CREATE POLICY "Covers owner delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'covers' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Audio owner read'
  ) THEN
    CREATE POLICY "Audio owner read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Audio owner upload'
  ) THEN
    CREATE POLICY "Audio owner upload"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Audio owner update'
  ) THEN
    CREATE POLICY "Audio owner update"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Audio owner delete'
  ) THEN
    CREATE POLICY "Audio owner delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'audio' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

COMMIT;
