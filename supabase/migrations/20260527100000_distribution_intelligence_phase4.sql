-- Phase 4: Distribution intelligence, webhook audit, retry, and analytics layer.

ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE public.delivery_status ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'IN_REVIEW';
ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE public.distribution_job_status ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE public.distribution_jobs
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_distribution_jobs_retry
  ON public.distribution_jobs(status, next_retry_at)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS public.distribution_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  release_id UUID,
  track_id UUID,
  platform public.dsp_platform,
  normalized_status TEXT,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_webhooks_release
  ON public.distribution_webhook_events(release_id, received_at);

CREATE TABLE IF NOT EXISTS public.distribution_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.distribution_jobs(id) ON DELETE SET NULL,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  platform public.dsp_platform NOT NULL,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  source TEXT NOT NULL,
  event_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_state_history_release
  ON public.distribution_state_history(release_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_distribution_state_history_event
  ON public.distribution_state_history(event_id, release_id, track_id, platform, next_status)
  WHERE event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.distribution_retry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.distribution_jobs(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  platform public.dsp_platform NOT NULL,
  attempt INTEGER NOT NULL,
  retry_at TIMESTAMPTZ,
  error_code TEXT NOT NULL,
  error_message TEXT,
  retryable BOOLEAN NOT NULL DEFAULT false,
  dead_lettered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_retry_logs_job
  ON public.distribution_retry_logs(job_id, created_at);

CREATE TABLE IF NOT EXISTS public.distribution_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.dsp_platform NOT NULL,
  total_releases_submitted INTEGER NOT NULL DEFAULT 0,
  platform_success_rate NUMERIC NOT NULL DEFAULT 0,
  average_delivery_time_seconds NUMERIC,
  rejection_rate NUMERIC NOT NULL DEFAULT 0,
  failure_classification_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_analytics_platform_time
  ON public.distribution_analytics(platform, calculated_at DESC);

ALTER TABLE public.distribution_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_retry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view distribution webhook events" ON public.distribution_webhook_events;
CREATE POLICY "admins view distribution webhook events" ON public.distribution_webhook_events
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage distribution webhook events" ON public.distribution_webhook_events;
CREATE POLICY "admins manage distribution webhook events" ON public.distribution_webhook_events
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view distribution state history" ON public.distribution_state_history;
CREATE POLICY "owners view distribution state history" ON public.distribution_state_history
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.releases r WHERE r.id = distribution_state_history.release_id AND r.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage distribution state history" ON public.distribution_state_history;
CREATE POLICY "admins manage distribution state history" ON public.distribution_state_history
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage distribution retry logs" ON public.distribution_retry_logs;
CREATE POLICY "admins manage distribution retry logs" ON public.distribution_retry_logs
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view distribution analytics" ON public.distribution_analytics;
CREATE POLICY "admins view distribution analytics" ON public.distribution_analytics
FOR SELECT USING (has_role(auth.uid(), 'admin'));
