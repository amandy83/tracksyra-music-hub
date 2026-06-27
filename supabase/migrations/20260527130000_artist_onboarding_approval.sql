-- Artist onboarding + admin approval workflow.

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artist_requests_email ON public.artist_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_artist_requests_user_id ON public.artist_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_artist_requests_status ON public.artist_requests (status, created_at DESC);

ALTER TABLE public.artist_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public submit artist requests" ON public.artist_requests;
CREATE POLICY "public submit artist requests" ON public.artist_requests
FOR INSERT
WITH CHECK (
  status = 'PENDING'
  AND artist_id IS NULL
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "artists view own requests" ON public.artist_requests;
CREATE POLICY "artists view own requests" ON public.artist_requests
FOR SELECT
USING (
  auth.uid() = user_id
  OR lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
  OR has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "admins manage artist requests" ON public.artist_requests;
CREATE POLICY "admins manage artist requests" ON public.artist_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS artist_requests_updated_at ON public.artist_requests;
CREATE TRIGGER artist_requests_updated_at
BEFORE UPDATE ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_artist_id_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.artist_id IS NOT NULL AND NEW.artist_id IS DISTINCT FROM OLD.artist_id THEN
    RAISE EXCEPTION 'artist_id is immutable after approval';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artist_requests_artist_id_immutable ON public.artist_requests;
CREATE TRIGGER artist_requests_artist_id_immutable
BEFORE UPDATE ON public.artist_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_artist_id_mutation();

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
  IF NOT has_role(auth.uid(), 'admin') THEN
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

  IF v_request.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET
      artist_name = COALESCE(NULLIF(artist_name, ''), v_request.name),
      updated_at = now()
    WHERE id = v_request.user_id;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_request.user_id, 'artist')
    ON CONFLICT DO NOTHING;
  END IF;

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
  IF NOT has_role(auth.uid(), 'admin') THEN
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
  SET
    status = 'REJECTED',
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
  OR has_role(auth.uid(), 'admin');
$$;

-- Keep public requests linked when an artist creates an auth account after submitting.
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.prevent_artist_id_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_artist_request_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_artist_request_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_artist_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_artist() TO authenticated;
