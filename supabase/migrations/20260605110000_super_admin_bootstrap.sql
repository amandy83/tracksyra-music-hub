-- Production-ready super-admin bootstrap and user management controls.

DO $$
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'super_admin', 'publisher', 'label', 'artist');
  ELSE
    NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

UPDATE public.user_roles
SET role = 'super_admin'::public.app_role
WHERE role::text = 'admin';

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role
        OR ur.role::text = 'super_admin'
        OR (ur.role::text = 'admin' AND _role::text IN ('admin', 'super_admin'))
        OR (_role::text = 'admin' AND ur.role::text = 'super_admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(p_user_id, 'super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.prevent_unsafe_super_admin_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_super_admin_count INTEGER;
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role::text = 'super_admin' THEN
    SELECT COUNT(*) INTO v_super_admin_count
    FROM public.user_roles
    WHERE role::text = 'super_admin';

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove or modify the last super_admin role';
    END IF;
  END IF;

  IF v_actor IS NOT NULL AND NOT public.is_super_admin(v_actor) THEN
    IF TG_OP = 'INSERT' AND NEW.role::text = 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can grant super_admin';
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role::text = 'super_admin' THEN
      RAISE EXCEPTION 'Only super_admin can edit or remove super_admin';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_unsafe_super_admin_role_change ON public.user_roles;
CREATE TRIGGER prevent_unsafe_super_admin_role_change
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_unsafe_super_admin_role_change();

DROP POLICY IF EXISTS "super admins manage roles" ON public.user_roles;
CREATE POLICY "super admins manage roles" ON public.user_roles
FOR ALL USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.list_platform_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  artist_name TEXT,
  roles TEXT[],
  status TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    p.full_name,
    p.artist_name,
    COALESCE(array_agg(ur.role::TEXT ORDER BY ur.role::TEXT) FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::TEXT[]) AS roles,
    CASE
      WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'banned'
      WHEN u.email_confirmed_at IS NULL THEN 'unconfirmed'
      ELSE 'active'
    END AS status,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE public.is_super_admin()
  GROUP BY u.id, u.email, p.full_name, p.artist_name, u.banned_until, u.email_confirmed_at, u.created_at, u.last_sign_in_at
  ORDER BY u.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.assign_platform_role(p_user_id UUID, p_role public.app_role)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_super_admin BOOLEAN;
  v_super_admin_count INTEGER;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super_admin can assign platform roles';
  END IF;

  IF p_role::TEXT = 'admin' THEN
    p_role := 'super_admin'::public.app_role;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role::TEXT = 'super_admin'
  ) INTO v_current_super_admin;

  IF v_current_super_admin AND p_role::TEXT <> 'super_admin' THEN
    SELECT COUNT(*) INTO v_super_admin_count
    FROM public.user_roles
    WHERE role::TEXT = 'super_admin';

    IF v_super_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last super_admin';
    END IF;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_platform_settings_manager()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin();
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_platform_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_platform_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_platform_settings_manager() TO authenticated;
