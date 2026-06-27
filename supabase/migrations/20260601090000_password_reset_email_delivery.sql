CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.email_delivery_logs
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS smtp_response TEXT;

ALTER TABLE public.email_delivery_logs
  DROP CONSTRAINT IF EXISTS email_delivery_logs_status_check;

ALTER TABLE public.email_delivery_logs
  ADD CONSTRAINT email_delivery_logs_status_check
  CHECK (status IN ('SENT', 'FAILED', 'RETRYING', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED'));

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_message_id
  ON public.email_delivery_logs(message_id);

CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  recipient TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained')),
  event_timestamp TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_events_message_id
  ON public.email_events(message_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_recipient
  ON public.email_events(lower(recipient), event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_event_type
  ON public.email_events(event_type, event_timestamp DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view email events" ON public.email_events;
CREATE POLICY "admins view email events" ON public.email_events
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage email events" ON public.email_events;
CREATE POLICY "admins manage email events" ON public.email_events
FOR ALL USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.email_monitoring
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.to_email AS recipient,
  COALESCE(d.provider_response->>'templateType', 'UNKNOWN') AS email_type,
  d.subject,
  d.status AS delivery_status,
  d.message_id,
  COALESCE(events.opens, 0)::INT AS opens,
  COALESCE(events.clicks, 0)::INT AS clicks,
  COALESCE(events.bounces, 0)::INT AS bounces,
  COALESCE(events.complaints, 0)::INT AS complaints,
  GREATEST(
    d.created_at,
    COALESCE(events.last_activity, d.created_at)
  ) AS last_activity,
  d.created_at,
  d.smtp_response,
  d.provider_response
FROM public.email_delivery_logs d
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE event_type = 'opened') AS opens,
    count(*) FILTER (WHERE event_type = 'clicked') AS clicks,
    count(*) FILTER (WHERE event_type = 'bounced') AS bounces,
    count(*) FILTER (WHERE event_type = 'complained') AS complaints,
    max(event_timestamp) AS last_activity
  FROM public.email_events e
  WHERE (d.message_id IS NOT NULL AND e.message_id = d.message_id)
    OR (d.message_id IS NULL AND lower(e.recipient) = lower(d.to_email))
) events ON TRUE;

GRANT SELECT ON public.email_monitoring TO authenticated;

NOTIFY pgrst, 'reload schema';
