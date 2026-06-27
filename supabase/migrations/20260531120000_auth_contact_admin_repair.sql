CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'artist');
EXCEPTION
  WHEN duplicate_object THEN NULL;
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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles viewable by owner" ON public.profiles;
CREATE POLICY "Profiles viewable by owner" ON public.profiles
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
CREATE POLICY "Insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
CREATE POLICY "Update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Delete own profile" ON public.profiles;
CREATE POLICY "Delete own profile" ON public.profiles
FOR DELETE USING (auth.uid() = id);

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, _role);
$$;

DROP POLICY IF EXISTS "users view own roles" ON public.user_roles;
CREATE POLICY "users view own roles" ON public.user_roles
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles
FOR ALL USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view all profiles" ON public.profiles;
CREATE POLICY "admins view all profiles" ON public.profiles
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type TEXT NOT NULL DEFAULT 'publisher',
  email TEXT,
  name TEXT,
  phone TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can submit form" ON public.form_submissions;
CREATE POLICY "anyone can submit form" ON public.form_submissions
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "admins view all submissions" ON public.form_submissions;
CREATE POLICY "admins view all submissions" ON public.form_submissions
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update submissions" ON public.form_submissions;
CREATE POLICY "admins update submissions" ON public.form_submissions
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete submissions" ON public.form_submissions;
CREATE POLICY "admins delete submissions" ON public.form_submissions
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS form_submissions_updated_at ON public.form_submissions;
CREATE TRIGGER form_submissions_updated_at
BEFORE UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.smtp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT false,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT 'TrackSyra',
  from_email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage smtp" ON public.smtp_settings;
CREATE POLICY "admins manage smtp" ON public.smtp_settings
FOR ALL USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS smtp_settings_updated_at ON public.smtp_settings;
CREATE TRIGGER smtp_settings_updated_at
BEFORE UPDATE ON public.smtp_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  related_table TEXT,
  related_id UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status, created_at);
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view email logs" ON public.email_logs;
CREATE POLICY "admins view email logs" ON public.email_logs
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage email logs" ON public.email_logs;
CREATE POLICY "admins manage email logs" ON public.email_logs
FOR ALL USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS email_logs_updated_at ON public.email_logs;
CREATE TRIGGER email_logs_updated_at
BEFORE UPDATE ON public.email_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.artist_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  artist_id UUID UNIQUE,
  request_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_notes TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  provider_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_requests
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_artist_requests_email ON public.artist_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_artist_requests_user_id ON public.artist_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_artist_requests_status ON public.artist_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_requests_provider_user
  ON public.artist_requests(auth_provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

ALTER TABLE public.artist_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public submit artist requests" ON public.artist_requests;
CREATE POLICY "public submit artist requests" ON public.artist_requests
FOR INSERT WITH CHECK (
  status = 'PENDING'
  AND artist_id IS NULL
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "artists view own requests" ON public.artist_requests;
CREATE POLICY "artists view own requests" ON public.artist_requests
FOR SELECT USING (
  auth.uid() = user_id
  OR lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "admins manage artist requests" ON public.artist_requests;
CREATE POLICY "admins manage artist requests" ON public.artist_requests
FOR ALL USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS artist_requests_updated_at ON public.artist_requests;
CREATE TRIGGER artist_requests_updated_at
BEFORE UPDATE ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Songs viewable by owner" ON public.songs;
CREATE POLICY "Songs viewable by owner" ON public.songs
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Insert own songs" ON public.songs;
CREATE POLICY "Insert own songs" ON public.songs
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own songs" ON public.songs;
CREATE POLICY "Update own songs" ON public.songs
FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Delete own songs" ON public.songs;
CREATE POLICY "Delete own songs" ON public.songs
FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins view all songs" ON public.songs;
CREATE POLICY "admins view all songs" ON public.songs
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update all songs" ON public.songs;
CREATE POLICY "admins update all songs" ON public.songs
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_songs_updated ON public.songs;
CREATE TRIGGER trg_songs_updated
BEFORE UPDATE ON public.songs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.playlist_pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id UUID,
  target_playlist TEXT NOT NULL,
  platform TEXT NOT NULL,
  pitch_story TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.playlist_pitches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own pitches" ON public.playlist_pitches;
CREATE POLICY "users manage own pitches" ON public.playlist_pitches
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admins view all pitches" ON public.playlist_pitches;
CREATE POLICY "admins view all pitches" ON public.playlist_pitches
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update all pitches" ON public.playlist_pitches;
CREATE POLICY "admins update all pitches" ON public.playlist_pitches
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS playlist_pitches_updated_at ON public.playlist_pitches;
CREATE TRIGGER playlist_pitches_updated_at
BEFORE UPDATE ON public.playlist_pitches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.queue_email(
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_subject TEXT,
  p_template TEXT,
  p_template_data JSONB,
  p_related_table TEXT,
  p_related_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.email_logs (
    recipient_email,
    recipient_name,
    subject,
    template,
    template_data,
    status,
    related_table,
    related_id
  )
  VALUES (
    p_recipient_email,
    p_recipient_name,
    p_subject,
    p_template,
    COALESCE(p_template_data, '{}'::jsonb),
    'pending',
    p_related_table,
    p_related_id
  )
  RETURNING id INTO v_id;

  IF to_regprocedure('public.enqueue_email_queue(text,text,text,text,text,jsonb,timestamp with time zone,integer)') IS NOT NULL THEN
    PERFORM public.enqueue_email_queue(
      p_recipient_email,
      p_subject,
      '<p>' || COALESCE(p_template_data->>'message', p_subject) || '</p>',
      COALESCE(p_template_data->>'message', p_subject),
      p_template,
      COALESCE(p_template_data, '{}'::jsonb) || jsonb_build_object(
        'name', COALESCE(p_recipient_name, p_template_data->>'name', 'Artist'),
        'related_table', p_related_table,
        'related_id', p_related_id,
        'artist_request_id', CASE WHEN p_related_table = 'artist_requests' THEN p_related_id ELSE NULL END,
        'user_id', CASE WHEN p_related_table = 'auth.users' THEN p_related_id ELSE NULL END
      )
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_artist_request_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(NEW.email)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      NEW.user_id := v_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_requests_link_user ON public.artist_requests;
CREATE TRIGGER artist_requests_link_user
BEFORE INSERT OR UPDATE OF email, user_id ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.link_artist_request_user();

CREATE OR REPLACE FUNCTION public.notify_artist_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.queue_email(
    NEW.email,
    NEW.name,
    'Your artist request is pending',
    'artist_request_pending',
    jsonb_build_object(
      'name', NEW.name,
      'message', 'Your request is under review. We will notify you once approved.'
    ),
    'artist_requests',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_request_pending_email ON public.artist_requests;
CREATE TRIGGER artist_request_pending_email
AFTER INSERT ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_artist_request_insert();

CREATE OR REPLACE FUNCTION public.notify_form_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.queue_email(
      NEW.email,
      NEW.name,
      CASE WHEN NEW.status='approved' THEN 'Your TrackSyra application is approved'
           ELSE 'Update on your TrackSyra application' END,
      CASE WHEN NEW.status='approved' THEN 'form_approved' ELSE 'form_rejected' END,
      jsonb_build_object('name', NEW.name, 'form_type', NEW.form_type, 'notes', NEW.admin_notes),
      'form_submissions',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_submissions_status_email ON public.form_submissions;
CREATE TRIGGER form_submissions_status_email
AFTER UPDATE ON public.form_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_form_status();

CREATE OR REPLACE FUNCTION public.notify_artist_request_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'APPROVED' THEN
    PERFORM public.queue_email(
      NEW.email,
      NEW.name,
      'Your artist request is approved',
      'artist_request_approved',
      jsonb_build_object(
        'name', NEW.name,
        'artist_id', NEW.artist_id,
        'dashboard_url', '/dashboard',
        'message', 'Your request is approved. Your dashboard access is now enabled.'
      ),
      'artist_requests',
      NEW.id
    );
  ELSIF NEW.status = 'REJECTED' THEN
    PERFORM public.queue_email(
      NEW.email,
      NEW.name,
      'Update on your artist request',
      'artist_request_rejected',
      jsonb_build_object(
        'name', NEW.name,
        'notes', NEW.admin_notes,
        'message', 'Your artist request was not approved at this time.'
      ),
      'artist_requests',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_request_status_email ON public.artist_requests;
CREATE TRIGGER artist_request_status_email
AFTER UPDATE OF status ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_artist_request_status();

CREATE OR REPLACE FUNCTION public.approve_artist_request(p_request_id UUID, p_admin_notes TEXT DEFAULT NULL)
RETURNS public.artist_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.artist_requests;
  v_artist_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve artist requests';
  END IF;

  SELECT * INTO v_request
  FROM public.artist_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Artist request not found';
  END IF;

  IF v_request.user_id = auth.uid() OR lower(v_request.email) = lower(COALESCE((auth.jwt() ->> 'email'), '')) THEN
    RAISE EXCEPTION 'Self-approval is not allowed';
  END IF;

  IF v_request.status = 'APPROVED' THEN
    RETURN v_request;
  END IF;

  IF v_request.user_id IS NULL THEN
    RAISE EXCEPTION 'Artist request must be linked to an auth user before approval';
  END IF;

  v_artist_id := COALESCE(v_request.artist_id, v_request.user_id);

  UPDATE public.artist_requests
  SET status = 'APPROVED',
      artist_id = v_artist_id,
      admin_notes = p_admin_notes,
      approved_by = auth.uid(),
      approved_at = now(),
      rejected_by = NULL,
      rejected_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_request.user_id, 'artist')
  ON CONFLICT DO NOTHING;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_artist_request(p_request_id UUID, p_admin_notes TEXT DEFAULT NULL)
RETURNS public.artist_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.artist_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject artist requests';
  END IF;

  SELECT * INTO v_request
  FROM public.artist_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Artist request not found';
  END IF;

  IF v_request.user_id = auth.uid() OR lower(v_request.email) = lower(COALESCE((auth.jwt() ->> 'email'), '')) THEN
    RAISE EXCEPTION 'Self-rejection is not allowed';
  END IF;

  UPDATE public.artist_requests
  SET status = 'REJECTED',
      admin_notes = p_admin_notes,
      rejected_by = auth.uid(),
      rejected_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_approved_artist()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.artist_requests ar
    WHERE ar.status = 'APPROVED'
      AND (
        ar.user_id = auth.uid()
        OR lower(ar.email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
      )
  )
  OR public.has_role(auth.uid(), 'admin');
$$;

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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'artist')
  ON CONFLICT DO NOTHING;

  UPDATE public.artist_requests
  SET user_id = NEW.id
  WHERE user_id IS NULL
    AND lower(email) = lower(NEW.email);

  IF NEW.email IS NOT NULL THEN
    PERFORM public.queue_email(
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'artist_name', 'Artist'),
      'Welcome to TrackSyra',
      'welcome',
      jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', 'Artist')),
      'auth.users',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.link_artist_request_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_request_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_form_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_artist() TO authenticated;

NOTIFY pgrst, 'reload schema';
