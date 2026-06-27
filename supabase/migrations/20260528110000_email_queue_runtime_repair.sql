-- Runtime repair for BullMQ email delivery.
-- Keeps the legacy email_logs/admin UI path, but guarantees the production
-- worker queue tables/functions exist for deployed projects that missed the
-- earlier email queue migration.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'artist');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN := FALSE;
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    RETURN FALSE;
  END IF;

  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = $2)'
    INTO v_has_role
    USING _user_id, _role;

  RETURN COALESCE(v_has_role, FALSE);
END;
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

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
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
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage email logs" ON public.email_logs;
CREATE POLICY "admins manage email logs" ON public.email_logs
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS email_logs_updated_at ON public.email_logs;
CREATE TRIGGER email_logs_updated_at
BEFORE UPDATE ON public.email_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

CREATE TABLE IF NOT EXISTS public.email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  template_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING')),
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT,
  deduplication_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_at ON public.email_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_retry_count ON public.email_queue(retry_count);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_deduplication_key ON public.email_queue(deduplication_key);
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view email queue" ON public.email_queue;
CREATE POLICY "admins view email queue" ON public.email_queue
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS email_queue_updated_at ON public.email_queue;
CREATE TRIGGER email_queue_updated_at
BEFORE UPDATE ON public.email_queue
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.email_queue_deduplication_key(
  p_to_email TEXT,
  p_template_type TEXT,
  p_payload JSONB
) RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
      extensions.digest(
      lower(COALESCE(p_to_email, '')) || '|' ||
      upper(COALESCE(p_template_type, '')) || '|' ||
      COALESCE(
        p_payload->>'artist_request_id',
        p_payload->>'related_id',
        p_payload->>'user_id',
        p_payload->>'id',
        p_payload::text
      ),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.email_escape_html(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(replace(replace(COALESCE(p_value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#039;');
$$;

CREATE OR REPLACE FUNCTION public.email_template_html(
  p_template_type TEXT,
  p_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_template TEXT := lower(COALESCE(p_template_type, ''));
  v_name TEXT := public.email_escape_html(COALESCE(p_payload->>'name', 'Artist'));
  v_message TEXT := public.email_escape_html(COALESCE(p_payload->>'message', ''));
BEGIN
  IF v_template IN ('artist_pending', 'artist_request_pending') THEN
    RETURN '<p>Hi ' || v_name || ', your request is under review. We will notify you once approved.</p>';
  ELSIF v_template IN ('artist_approved', 'artist_request_approved') THEN
    RETURN '<p>Hi ' || v_name || ', your request is approved.</p>' ||
      '<p>Your Artist ID is: <strong>' || public.email_escape_html(COALESCE(p_payload->>'artist_id', '')) || '</strong></p>' ||
      '<p>You can now log in to your artist dashboard and upload releases.</p>' ||
      '<p><a href="' || public.email_escape_html(COALESCE(p_payload->>'dashboard_url', '/dashboard')) || '">Open artist dashboard</a></p>';
  ELSIF v_template IN ('artist_rejected', 'artist_request_rejected') THEN
    RETURN '<p>Hi ' || v_name || ', your artist request was not approved at this time.</p>' ||
      CASE WHEN COALESCE(p_payload->>'notes', '') <> '' THEN '<p>Notes: ' || public.email_escape_html(p_payload->>'notes') || '</p>' ELSE '' END;
  ELSIF v_template = 'welcome' THEN
    RETURN '<p>Hi ' || v_name || ', your account is ready. Start uploading songs, pitch playlists, and track your royalties from one dashboard.</p>';
  END IF;

  RETURN '<p>' || COALESCE(NULLIF(v_message, ''), 'Thanks for being part of TrackSyra.') || '</p>';
END;
$$;

CREATE OR REPLACE FUNCTION public.email_template_text(p_html TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(regexp_replace(COALESCE(p_html, ''), '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email_queue(
  p_to_email TEXT,
  p_subject TEXT,
  p_html_content TEXT,
  p_text_content TEXT,
  p_template_type TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_scheduled_at TIMESTAMPTZ DEFAULT now(),
  p_max_retries INT DEFAULT 3
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_payload JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_template_type TEXT;
  v_deduplication_key TEXT;
BEGIN
  v_template_type := CASE lower(COALESCE(p_template_type, 'GENERIC'))
    WHEN 'artist_request_pending' THEN 'ARTIST_PENDING'
    WHEN 'artist_pending' THEN 'ARTIST_PENDING'
    WHEN 'artist_request_approved' THEN 'ARTIST_APPROVED'
    WHEN 'artist_approved' THEN 'ARTIST_APPROVED'
    WHEN 'welcome' THEN 'WELCOME_EMAIL'
    ELSE upper(COALESCE(p_template_type, 'GENERIC'))
  END;

  v_deduplication_key := public.email_queue_deduplication_key(p_to_email, v_template_type, v_payload);

  INSERT INTO public.email_queue (
    to_email, subject, html_content, text_content, template_type, payload,
    max_retries, deduplication_key, scheduled_at
  )
  VALUES (
    p_to_email, p_subject, p_html_content, p_text_content, v_template_type, v_payload,
    COALESCE(p_max_retries, 3), v_deduplication_key, COALESCE(p_scheduled_at, now())
  )
  ON CONFLICT (deduplication_key) DO UPDATE
  SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
  v_payload JSONB;
  v_html TEXT;
BEGIN
  v_payload := COALESCE(p_template_data, '{}'::jsonb) ||
    jsonb_build_object(
      'name', COALESCE(p_recipient_name, p_template_data->>'name', 'Artist'),
      'related_table', p_related_table,
      'related_id', p_related_id,
      'artist_request_id', CASE WHEN p_related_table = 'artist_requests' THEN p_related_id ELSE NULL END,
      'user_id', CASE WHEN p_related_table = 'auth.users' THEN p_related_id ELSE NULL END
    );
  v_html := public.email_template_html(p_template, v_payload);

  INSERT INTO public.email_logs (
    recipient_email, recipient_name, subject, template, template_data,
    status, related_table, related_id
  )
  VALUES (
    p_recipient_email, p_recipient_name, p_subject, p_template,
    COALESCE(p_template_data, '{}'::jsonb), 'queued', p_related_table, p_related_id
  );

  v_id := public.enqueue_email_queue(
    p_recipient_email,
    p_subject,
    v_html,
    public.email_template_text(v_html),
    p_template,
    v_payload
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.dequeue_email_queue(p_limit INT DEFAULT 25)
RETURNS SETOF public.email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.email_queue
    WHERE status IN ('PENDING', 'RETRYING')
      AND scheduled_at <= now()
      AND retry_count <= max_retries
    ORDER BY scheduled_at ASC, created_at ASC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_queue q
  SET status = 'PROCESSING',
      updated_at = now()
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.email_queue_deduplication_key(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_escape_html(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_template_html(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_template_text(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email_queue(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dequeue_email_queue(INT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
