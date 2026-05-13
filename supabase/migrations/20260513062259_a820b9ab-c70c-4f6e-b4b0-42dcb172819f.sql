
-- SMTP settings (single row, admin only)
CREATE TABLE public.smtp_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL,
  port integer NOT NULL DEFAULT 587,
  secure boolean NOT NULL DEFAULT false,
  username text NOT NULL,
  password text NOT NULL,
  from_name text NOT NULL DEFAULT 'TrackSyra',
  from_email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage smtp" ON public.smtp_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER smtp_settings_updated_at
  BEFORE UPDATE ON public.smtp_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Email logs
CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  template text NOT NULL,
  template_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  related_table text,
  related_id uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_status ON public.email_logs(status, created_at);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view email logs" ON public.email_logs
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage email logs" ON public.email_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: queue an email row (security definer so triggers can insert)
CREATE OR REPLACE FUNCTION public.queue_email(
  p_recipient_email text,
  p_recipient_name text,
  p_subject text,
  p_template text,
  p_template_data jsonb,
  p_related_table text,
  p_related_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.email_logs (recipient_email, recipient_name, subject, template, template_data, related_table, related_id)
  VALUES (p_recipient_email, p_recipient_name, p_subject, p_template, COALESCE(p_template_data, '{}'::jsonb), p_related_table, p_related_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Trigger: welcome email on signup (extends existing handle_new_user)
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

  IF NEW.email IS NOT NULL THEN
    PERFORM public.queue_email(
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'artist_name', 'Artist'),
      'Welcome to TrackSyra 🎵',
      'welcome',
      jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', 'Artist')),
      'auth.users',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Make sure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: form_submissions status change
CREATE OR REPLACE FUNCTION public.notify_form_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.queue_email(
      NEW.email,
      NEW.name,
      CASE WHEN NEW.status='approved' THEN 'Your TrackSyra application is approved 🎉'
           ELSE 'Update on your TrackSyra application' END,
      CASE WHEN NEW.status='approved' THEN 'form_approved' ELSE 'form_rejected' END,
      jsonb_build_object('name', NEW.name, 'form_type', NEW.form_type, 'notes', NEW.admin_notes),
      'form_submissions', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER form_submissions_status_email
  AFTER UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_form_status();

-- Trigger: songs status change
CREATE OR REPLACE FUNCTION public.notify_song_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT u.email, COALESCE(p.full_name, p.artist_name, 'Artist')
      INTO v_email, v_name
      FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = NEW.user_id;
    IF v_email IS NOT NULL THEN
      PERFORM public.queue_email(
        v_email, v_name,
        CASE WHEN NEW.status='approved' THEN 'Your song "' || NEW.title || '" is approved ✅'
             ELSE 'Your song "' || NEW.title || '" needs changes' END,
        CASE WHEN NEW.status='approved' THEN 'song_approved' ELSE 'song_rejected' END,
        jsonb_build_object('name', v_name, 'title', NEW.title, 'artist', NEW.primary_artist),
        'songs', NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER songs_status_email
  AFTER UPDATE ON public.songs
  FOR EACH ROW EXECUTE FUNCTION public.notify_song_status();

-- Trigger: playlist_pitches status change
CREATE OR REPLACE FUNCTION public.notify_pitch_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  IF NEW.status IN ('approved','rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT u.email, COALESCE(p.full_name, p.artist_name, 'Artist')
      INTO v_email, v_name
      FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = NEW.user_id;
    IF v_email IS NOT NULL THEN
      PERFORM public.queue_email(
        v_email, v_name,
        CASE WHEN NEW.status='approved' THEN 'Playlist pitch approved 🎯'
             ELSE 'Playlist pitch update' END,
        CASE WHEN NEW.status='approved' THEN 'pitch_approved' ELSE 'pitch_rejected' END,
        jsonb_build_object('name', v_name, 'playlist', NEW.target_playlist, 'platform', NEW.platform, 'notes', NEW.admin_notes),
        'playlist_pitches', NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pitches_status_email
  AFTER UPDATE ON public.playlist_pitches
  FOR EACH ROW EXECUTE FUNCTION public.notify_pitch_status();
