-- Phase 1 auth, approval, RBAC, and notification hardening.
-- Goal: an artist can create an account, wait for approval, then access the dashboard.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

CREATE TABLE IF NOT EXISTS public.app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'INFO'
    CHECK (notification_type IN ('INFO','SUCCESS','WARNING','ERROR')),
  entity_table TEXT,
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_notifications_user_time
  ON public.app_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_unread
  ON public.app_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view own notifications" ON public.app_notifications;
CREATE POLICY "owners view own notifications" ON public.app_notifications
FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners mark own notifications read" ON public.app_notifications;

DROP POLICY IF EXISTS "admins manage notifications" ON public.app_notifications;
CREATE POLICY "admins manage notifications" ON public.app_notifications
FOR ALL USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.mark_app_notification_read(p_notification_id UUID)
RETURNS public.app_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification public.app_notifications;
BEGIN
  UPDATE public.app_notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND user_id = auth.uid()
  RETURNING * INTO v_notification;

  IF v_notification.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN v_notification;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_artist_request(
  p_name TEXT,
  p_email TEXT,
  p_request_data JSONB DEFAULT '{}'::jsonb,
  p_auth_provider TEXT DEFAULT 'email',
  p_provider_user_id TEXT DEFAULT NULL
) RETURNS public.artist_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_name TEXT := trim(COALESCE(p_name, ''));
  v_user_id UUID;
  v_existing public.artist_requests;
  v_request public.artist_requests;
BEGIN
  IF v_name = '' OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'INVALID_ARTIST_NAME';
  END IF;

  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  IF COALESCE(p_auth_provider, 'email') NOT IN ('email','google','apple','facebook') THEN
    RAISE EXCEPTION 'INVALID_AUTH_PROVIDER';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.artist_requests
  WHERE lower(email) = v_email
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    SELECT id
    INTO v_user_id
    FROM auth.users
    WHERE lower(email) = v_email
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.artist_requests (
    user_id,
    name,
    email,
    status,
    auth_provider,
    provider_user_id,
    request_data
  )
  VALUES (
    v_user_id,
    v_name,
    v_email,
    'PENDING',
    COALESCE(p_auth_provider, 'email'),
    p_provider_user_id,
    COALESCE(p_request_data, '{}'::jsonb) - 'password' - 'confirmPassword'
  )
  RETURNING * INTO v_request;

  IF to_regclass('public.app_notifications') IS NOT NULL AND v_user_id IS NOT NULL THEN
    INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
    VALUES (
      v_user_id,
      'Artist request submitted',
      'Your artist request is under review. We will notify you once approved.',
      'INFO',
      'artist_requests',
      v_request.id
    );
  END IF;

  RETURN v_request;
END $$;

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
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
    artist_name = COALESCE(NULLIF(public.profiles.artist_name, ''), EXCLUDED.artist_name),
    updated_at = now();

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
      jsonb_build_object(
        'name', COALESCE(NEW.raw_user_meta_data->>'full_name', 'Artist'),
        'message', 'Your account has been created. Artist dashboard access starts after admin approval.'
      ),
      'auth.users',
      NEW.id
    );
  END IF;

  RETURN NEW;
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
  IF NEW.user_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = lower(NEW.email)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

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
        'dashboard_url', 'https://hello.tracksyra.com/dashboard',
        'message', 'Your request is approved. Your dashboard access is now enabled.'
      ),
      'artist_requests',
      NEW.id
    );

    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      VALUES (
        NEW.user_id,
        'Artist request approved',
        'Your TrackSyra dashboard access is now enabled.',
        'SUCCESS',
        'artist_requests',
        NEW.id
      );
    END IF;

    INSERT INTO public.admin_audit_logs (action, actor_admin_id, target_id, metadata)
    VALUES (
      'EMAIL_SENT_APPROVAL',
      NEW.approved_by,
      NEW.id,
      jsonb_build_object('artist_id', NEW.artist_id, 'to_email', NEW.email)
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

    IF NEW.user_id IS NOT NULL THEN
      INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
      VALUES (
        NEW.user_id,
        'Artist request not approved',
        'Your artist request was not approved. Contact support if you need another review.',
        'WARNING',
        'artist_requests',
        NEW.id
      );
    END IF;
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
  PERFORM public.assert_admin_action();

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
    SELECT id INTO v_request.user_id
    FROM auth.users
    WHERE lower(email) = lower(v_request.email)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_request.user_id IS NULL THEN
    RAISE EXCEPTION 'Artist request must be linked to an auth user before approval';
  END IF;

  v_artist_id := COALESCE(v_request.artist_id, v_request.user_id);

  UPDATE public.artist_requests
  SET status = 'APPROVED',
      user_id = v_request.user_id,
      artist_id = v_artist_id,
      admin_notes = p_admin_notes,
      approved_by = auth.uid(),
      approved_at = now(),
      rejected_by = NULL,
      rejected_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  UPDATE public.profiles
  SET artist_name = COALESCE(NULLIF(artist_name, ''), v_request.name),
      updated_at = now()
  WHERE id = v_request.user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_request.user_id, 'artist')
  ON CONFLICT DO NOTHING;

  PERFORM public.log_admin_audit(
    'APPROVE_ARTIST_REQUEST',
    v_request.id,
    jsonb_build_object('artist_id', v_request.artist_id, 'email', v_request.email)
  );

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
  PERFORM public.assert_admin_action();

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

  IF v_request.user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.artist_requests approved
       WHERE approved.user_id = v_request.user_id
         AND approved.status = 'APPROVED'
     ) THEN
    DELETE FROM public.user_roles
    WHERE user_id = v_request.user_id
      AND role = 'artist';
  END IF;

  PERFORM public.log_admin_audit(
    'REJECT_ARTIST_REQUEST',
    v_request.id,
    jsonb_build_object('email', v_request.email, 'notes_present', p_admin_notes IS NOT NULL)
  );

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
  SELECT public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.artist_requests ar
    WHERE ar.status = 'APPROVED'
      AND (
        ar.user_id = auth.uid()
        OR lower(ar.email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
      )
  );
$$;

DELETE FROM public.user_roles ur
WHERE ur.role = 'artist'
  AND NOT EXISTS (
    SELECT 1
    FROM public.artist_requests ar
    WHERE ar.status = 'APPROVED'
      AND ar.user_id = ur.user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles admin_role
    WHERE admin_role.user_id = ur.user_id
      AND admin_role.role = 'admin'
  );

REVOKE EXECUTE ON FUNCTION public.submit_artist_request(TEXT, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_app_notification_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_artist_request(TEXT, TEXT, JSONB, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_app_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_artist() TO authenticated;

NOTIFY pgrst, 'reload schema';
