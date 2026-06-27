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

CREATE OR REPLACE FUNCTION public.role_rank(_role public.app_role)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _role::text
    WHEN 'super_admin' THEN 100
    WHEN 'admin' THEN 100
    WHEN 'publisher' THEN 80
    WHEN 'label' THEN 60
    WHEN 'artist' THEN 10
    ELSE 0
  END;
$$;

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

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM unnest(_roles) requested(role)
      WHERE public.has_role(_user_id, requested.role)
    );
$$;

CREATE TABLE IF NOT EXISTS public.publisher_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (publisher_user_id, label_user_id)
);

CREATE TABLE IF NOT EXISTS public.label_artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (label_user_id, artist_user_id)
);

CREATE TABLE IF NOT EXISTS public.artist_assignment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  publisher_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  label_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  artist_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publisher_labels_publisher ON public.publisher_labels(publisher_user_id);
CREATE INDEX IF NOT EXISTS idx_publisher_labels_label ON public.publisher_labels(label_user_id);
CREATE INDEX IF NOT EXISTS idx_label_artists_label ON public.label_artists(label_user_id);
CREATE INDEX IF NOT EXISTS idx_label_artists_artist ON public.label_artists(artist_user_id);

ALTER TABLE public.publisher_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.label_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_assignment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_publisher_label(_publisher_user_id UUID, _label_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.publisher_labels pl
      WHERE pl.publisher_user_id = _publisher_user_id
        AND pl.label_user_id = _label_user_id
        AND pl.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_label_artist(_label_user_id UUID, _artist_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.label_artists la
      WHERE la.label_user_id = _label_user_id
        AND la.artist_user_id = _artist_user_id
        AND la.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_artist(_artist_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() = _artist_user_id
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.label_artists la
      WHERE la.artist_user_id = _artist_user_id
        AND la.label_user_id = auth.uid()
        AND la.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.publisher_labels pl
      JOIN public.label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
      WHERE pl.publisher_user_id = auth.uid()
        AND la.artist_user_id = _artist_user_id
        AND pl.status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _permission
    WHEN 'super_admin.full_access' THEN public.has_role(auth.uid(), 'super_admin'::public.app_role)
    WHEN 'distribution.manage' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher']::public.app_role[])
    WHEN 'release.approve' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher']::public.app_role[])
    WHEN 'playlist.operations' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher']::public.app_role[])
    WHEN 'analytics.view' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label','artist']::public.app_role[])
    WHEN 'revenue.report' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label','artist']::public.app_role[])
    WHEN 'label.manage_artists' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label']::public.app_role[])
    WHEN 'catalog.manage' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label','artist']::public.app_role[])
    WHEN 'promo_assets.create' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label','artist']::public.app_role[])
    WHEN 'playlist.pitch.submit' THEN public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label','artist']::public.app_role[])
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "role hierarchy users view roles" ON public.user_roles;
CREATE POLICY "role hierarchy users view roles" ON public.user_roles
FOR SELECT USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.publisher_labels pl
    WHERE pl.publisher_user_id = auth.uid()
      AND pl.label_user_id = user_roles.user_id
      AND pl.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.publisher_labels pl
    JOIN public.label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
    WHERE pl.publisher_user_id = auth.uid()
      AND la.artist_user_id = user_roles.user_id
      AND pl.status = 'active'
  )
  OR EXISTS (
    SELECT 1
    FROM public.label_artists la
    WHERE la.label_user_id = auth.uid()
      AND la.artist_user_id = user_roles.user_id
      AND la.status = 'active'
  )
);

DROP POLICY IF EXISTS "super admins manage roles" ON public.user_roles;
CREATE POLICY "super admins manage roles" ON public.user_roles
FOR ALL USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "publishers and super admins view publisher labels" ON public.publisher_labels;
CREATE POLICY "publishers and super admins view publisher labels" ON public.publisher_labels
FOR SELECT USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR publisher_user_id = auth.uid()
  OR label_user_id = auth.uid()
);

DROP POLICY IF EXISTS "super admins manage publisher labels" ON public.publisher_labels;
CREATE POLICY "super admins manage publisher labels" ON public.publisher_labels
FOR ALL USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "labels and publishers view label artists" ON public.label_artists;
CREATE POLICY "labels and publishers view label artists" ON public.label_artists
FOR SELECT USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR label_user_id = auth.uid()
  OR artist_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    WHERE pl.publisher_user_id = auth.uid()
      AND pl.label_user_id = label_artists.label_user_id
      AND pl.status = 'active'
  )
);

DROP POLICY IF EXISTS "labels publishers and super admins manage artist assignments" ON public.label_artists;
CREATE POLICY "labels publishers and super admins manage artist assignments" ON public.label_artists
FOR ALL USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR label_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    WHERE pl.publisher_user_id = auth.uid()
      AND pl.label_user_id = label_artists.label_user_id
      AND pl.status = 'active'
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR label_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    WHERE pl.publisher_user_id = auth.uid()
      AND pl.label_user_id = label_artists.label_user_id
      AND pl.status = 'active'
  )
);

DROP POLICY IF EXISTS "assignment audit visible to hierarchy managers" ON public.artist_assignment_audit_logs;
CREATE POLICY "assignment audit visible to hierarchy managers" ON public.artist_assignment_audit_logs
FOR SELECT USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR publisher_user_id = auth.uid()
  OR label_user_id = auth.uid()
  OR artist_user_id = auth.uid()
);

DROP POLICY IF EXISTS "assignment audit insert by hierarchy managers" ON public.artist_assignment_audit_logs;
CREATE POLICY "assignment audit insert by hierarchy managers" ON public.artist_assignment_audit_logs
FOR INSERT WITH CHECK (
  actor_user_id = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['super_admin','publisher','label']::public.app_role[])
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_publisher_labels_updated_at ON public.publisher_labels;
CREATE TRIGGER touch_publisher_labels_updated_at
BEFORE UPDATE ON public.publisher_labels
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_label_artists_updated_at ON public.label_artists;
CREATE TRIGGER touch_label_artists_updated_at
BEFORE UPDATE ON public.label_artists
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy view profiles" ON public.profiles;
    CREATE POLICY "role hierarchy view profiles" ON public.profiles
    FOR SELECT USING (
      id = auth.uid()
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.can_access_artist(id)
      OR EXISTS (SELECT 1 FROM public.publisher_labels pl WHERE pl.publisher_user_id = auth.uid() AND pl.label_user_id = profiles.id AND pl.status = 'active')
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.music_releases') AND relkind IN ('r','p')) THEN
    DROP POLICY IF EXISTS "role hierarchy view music releases" ON public.music_releases;
    CREATE POLICY "role hierarchy view music releases" ON public.music_releases
    FOR SELECT USING (public.can_access_artist(owner_user_id));
    DROP POLICY IF EXISTS "role hierarchy manage music releases" ON public.music_releases;
    CREATE POLICY "role hierarchy manage music releases" ON public.music_releases
    FOR ALL USING (public.can_access_artist(owner_user_id))
    WITH CHECK (public.can_access_artist(owner_user_id));
  END IF;

  IF to_regclass('public.releases') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy view releases" ON public.releases;
    CREATE POLICY "role hierarchy view releases" ON public.releases
    FOR SELECT USING (public.can_access_artist(user_id));
    DROP POLICY IF EXISTS "role hierarchy manage releases" ON public.releases;
    CREATE POLICY "role hierarchy manage releases" ON public.releases
    FOR ALL USING (public.can_access_artist(user_id))
    WITH CHECK (public.can_access_artist(user_id));
  END IF;

  IF to_regclass('public.tracks') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy manage tracks" ON public.tracks;
    CREATE POLICY "role hierarchy manage tracks" ON public.tracks
    FOR ALL USING (public.can_access_artist(user_id))
    WITH CHECK (public.can_access_artist(user_id));
  END IF;

  IF to_regclass('public.songs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy manage songs" ON public.songs;
    CREATE POLICY "role hierarchy manage songs" ON public.songs
    FOR ALL USING (public.can_access_artist(user_id))
    WITH CHECK (public.can_access_artist(user_id));
  END IF;

  IF to_regclass('public.playlist_pitches') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy manage playlist pitches" ON public.playlist_pitches;
    CREATE POLICY "role hierarchy manage playlist pitches" ON public.playlist_pitches
    FOR ALL USING (
      public.can_access_artist(user_id)
      OR public.has_permission('playlist.operations')
    )
    WITH CHECK (
      public.can_access_artist(user_id)
      OR public.has_permission('playlist.operations')
    );
  END IF;

  IF to_regclass('public.promo_assets') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy manage promo assets" ON public.promo_assets;
    CREATE POLICY "role hierarchy manage promo assets" ON public.promo_assets
    FOR ALL USING (public.can_access_artist(user_id))
    WITH CHECK (public.can_access_artist(user_id));
  END IF;

  IF to_regclass('public.royalty_records') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy view royalty records" ON public.royalty_records;
    CREATE POLICY "role hierarchy view royalty records" ON public.royalty_records
    FOR SELECT USING (public.can_access_artist(artist_id));
  END IF;

  IF to_regclass('public.streaming_stats') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy view streaming stats" ON public.streaming_stats;
    CREATE POLICY "role hierarchy view streaming stats" ON public.streaming_stats
    FOR SELECT USING (
      EXISTS (
        SELECT 1
        FROM public.tracks t
        WHERE t.id = streaming_stats.track_id
          AND public.can_access_artist(t.user_id)
      )
    );
  END IF;

  IF to_regclass('public.review_queue') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy review queue access" ON public.review_queue;
    CREATE POLICY "role hierarchy review queue access" ON public.review_queue
    FOR SELECT USING (
      artist_id = auth.uid()
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'publisher'::public.app_role)
    );
  END IF;

  IF to_regclass('public.review_audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS "role hierarchy review audit access" ON public.review_audit_log;
    CREATE POLICY "role hierarchy review audit access" ON public.review_audit_log
    FOR SELECT USING (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'publisher'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.review_queue q
        WHERE q.release_id = review_audit_log.release_id
          AND q.artist_id = auth.uid()
      )
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_review_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(p_user_id, ARRAY['super_admin','publisher']::public.app_role[]);
$$;

GRANT SELECT ON public.publisher_labels TO authenticated;
GRANT SELECT ON public.label_artists TO authenticated;
GRANT SELECT, INSERT ON public.artist_assignment_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(UUID, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_artist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_label_artist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_publisher_label(UUID, UUID) TO authenticated;
