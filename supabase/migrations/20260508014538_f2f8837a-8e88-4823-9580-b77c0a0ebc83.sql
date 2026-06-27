
-- 1. App role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'artist');

-- 2. user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. user_roles policies
CREATE POLICY "users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Auto-assign 'artist' role on signup (extend handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
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
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'artist')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. form_submissions table (Publisher / Contact form data)
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_type text NOT NULL DEFAULT 'publisher',
  email text,
  name text,
  phone text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can submit form" ON public.form_submissions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admins view all submissions" ON public.form_submissions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update submissions" ON public.form_submissions
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete submissions" ON public.form_submissions
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Admin can view/manage all songs, pitches, ad campaigns
CREATE POLICY "admins view all songs" ON public.songs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update all songs" ON public.songs
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins view all pitches" ON public.playlist_pitches
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update all pitches" ON public.playlist_pitches
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins view all ads" ON public.ad_campaigns
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update all ads" ON public.ad_campaigns
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 8. Seed admin user
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@tracksyra.app') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated', 'authenticated',
      'admin@tracksyra.app',
      extensions.crypt('Tracksyra@Admin2026!', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Tracksyra Admin","artist_name":"Admin"}'::jsonb,
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', 'admin@tracksyra.app', 'email_verified', true),
      'email', new_user_id::text, now(), now(), now()
    );

    INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSE
    -- Ensure existing admin has admin role
    INSERT INTO public.user_roles (user_id, role)
    SELECT id, 'admin' FROM auth.users WHERE email = 'admin@tracksyra.app'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
