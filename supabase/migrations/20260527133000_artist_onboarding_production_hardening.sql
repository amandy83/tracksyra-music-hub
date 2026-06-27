-- Production hardening for artist onboarding, admin approval, and email delivery.

ALTER TABLE public.artist_requests
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email'
    CHECK (auth_provider IS NULL OR auth_provider IN ('email', 'google', 'apple', 'facebook')),
  ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

UPDATE public.artist_requests
SET auth_provider = 'email'
WHERE auth_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_artist_requests_provider_user
  ON public.artist_requests(auth_provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN (
    'APPROVE_ARTIST_REQUEST',
    'REJECT_ARTIST_REQUEST',
    'ARTIST_ID_ASSIGNED',
    'EMAIL_SENT_APPROVAL'
  )),
  actor_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON public.admin_audit_logs(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins view audit logs" ON public.admin_audit_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins insert audit logs" ON public.admin_audit_logs
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'RETRYING')),
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status ON public.email_delivery_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_to_email ON public.email_delivery_logs(lower(to_email), created_at DESC);

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view email delivery logs" ON public.email_delivery_logs;
CREATE POLICY "admins view email delivery logs" ON public.email_delivery_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert email delivery logs" ON public.email_delivery_logs;
CREATE POLICY "admins insert email delivery logs" ON public.email_delivery_logs
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.is_admin_action_allowed()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    OR COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    OR has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.assert_admin_action()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_action_allowed() THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ADMIN_ACTION';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_audit(
  p_action TEXT,
  p_target_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_admin_action();

  INSERT INTO public.admin_audit_logs (action, actor_admin_id, target_id, metadata)
  VALUES (p_action, auth.uid(), p_target_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
    RAISE EXCEPTION 'Artist request must be linked to an auth user before approval';
  END IF;

  v_artist_id := COALESCE(v_request.artist_id, v_request.user_id);

  UPDATE public.artist_requests
  SET
    status = 'APPROVED',
    artist_id = v_artist_id,
    admin_notes = p_admin_notes,
    approved_by = auth.uid(),
    approved_at = now(),
    rejected_by = NULL,
    rejected_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  UPDATE public.profiles
  SET
    artist_name = COALESCE(NULLIF(artist_name, ''), v_request.name),
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
  PERFORM public.log_admin_audit(
    'ARTIST_ID_ASSIGNED',
    v_request.id,
    jsonb_build_object('artist_id', v_request.artist_id)
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
  SET
    status = 'REJECTED',
    admin_notes = p_admin_notes,
    rejected_by = auth.uid(),
    rejected_at = now()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  PERFORM public.log_admin_audit(
    'REJECT_ARTIST_REQUEST',
    v_request.id,
    jsonb_build_object('email', v_request.email, 'notes_present', p_admin_notes IS NOT NULL)
  );

  RETURN v_request;
END;
$$;

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
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_action_allowed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_admin_action() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_audit(TEXT, UUID, JSONB) TO authenticated;
