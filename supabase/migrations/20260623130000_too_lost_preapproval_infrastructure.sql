-- Phase 5.1: Too Lost pre-approval infrastructure.
-- No live API credentials are required by this migration.

CREATE TABLE IF NOT EXISTS public.distribution_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL UNIQUE,
  auth_type TEXT NOT NULL DEFAULT 'oauth2' CHECK (auth_type IN ('oauth2')),
  client_id_set BOOLEAN NOT NULL DEFAULT false,
  client_secret_set BOOLEAN NOT NULL DEFAULT false,
  webhook_secret_set BOOLEAN NOT NULL DEFAULT false,
  client_id_hint TEXT,
  client_secret_ref TEXT,
  webhook_secret_ref TEXT,
  access_token_ref TEXT,
  refresh_token_ref TEXT,
  token_expires_at TIMESTAMPTZ,
  credential_status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (credential_status IN ('pending_approval','configured','expired','revoked')),
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.distribution_provider_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier_ref TEXT NOT NULL,
  redirect_uri TEXT,
  scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','completed','expired','failed')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.distribution_provider_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PASS','WARN','FAIL','SKIPPED')),
  response_time_ms INTEGER,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_provider_health_checks_provider_time
  ON public.distribution_provider_health_checks(provider, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.distribution_provider_sandbox_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.distribution_provider NOT NULL DEFAULT 'too_lost',
  run_type TEXT NOT NULL CHECK (run_type IN ('oauth','release_submission','analytics_sync','webhook','failure_recovery')),
  status TEXT NOT NULL CHECK (status IN ('PASS','WARN','FAIL','SKIPPED')),
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.distribution_providers
  ADD COLUMN IF NOT EXISTS sandbox_mode BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS live_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS oauth_authorize_url TEXT,
  ADD COLUMN IF NOT EXISTS oauth_token_url TEXT,
  ADD COLUMN IF NOT EXISTS oauth_redirect_uri TEXT,
  ADD COLUMN IF NOT EXISTS webhook_endpoint_path TEXT NOT NULL DEFAULT '/api/webhooks/too-lost';

INSERT INTO public.distribution_provider_credentials (provider, auth_type, credential_status)
VALUES ('too_lost', 'oauth2', 'pending_approval')
ON CONFLICT (provider) DO NOTHING;

UPDATE public.distribution_providers
SET sandbox_mode = true,
    live_approved = false,
    oauth_authorize_url = COALESCE(oauth_authorize_url, 'https://api.toolost.com/oauth/authorize'),
    oauth_token_url = COALESCE(oauth_token_url, 'https://api.toolost.com/oauth/token'),
    webhook_endpoint_path = '/api/webhooks/too-lost',
    sync_status = CASE WHEN sync_status = 'credentials_required' THEN 'pending_app_approval' ELSE sync_status END,
    config = config || jsonb_build_object(
      'preapproval_ready', true,
      'auth_type', 'oauth2',
      'sandbox_mode', true,
      'live_api_calls_enabled', false
    ),
    updated_at = now()
WHERE provider = 'too_lost';

ALTER TABLE public.distribution_provider_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_provider_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_provider_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_provider_sandbox_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage distribution provider credentials" ON public.distribution_provider_credentials;
CREATE POLICY "admins manage distribution provider credentials" ON public.distribution_provider_credentials
  FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "admins manage distribution provider oauth states" ON public.distribution_provider_oauth_states;
CREATE POLICY "admins manage distribution provider oauth states" ON public.distribution_provider_oauth_states
  FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "admins view distribution provider health checks" ON public.distribution_provider_health_checks;
CREATE POLICY "admins view distribution provider health checks" ON public.distribution_provider_health_checks
  FOR SELECT USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher'));

DROP POLICY IF EXISTS "admins insert distribution provider health checks" ON public.distribution_provider_health_checks;
CREATE POLICY "admins insert distribution provider health checks" ON public.distribution_provider_health_checks
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "admins view distribution provider sandbox runs" ON public.distribution_provider_sandbox_runs;
CREATE POLICY "admins view distribution provider sandbox runs" ON public.distribution_provider_sandbox_runs
  FOR SELECT USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher'));

DROP POLICY IF EXISTS "admins insert distribution provider sandbox runs" ON public.distribution_provider_sandbox_runs;
CREATE POLICY "admins insert distribution provider sandbox runs" ON public.distribution_provider_sandbox_runs
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE VIEW public.too_lost_provider_readiness AS
SELECT
  p.provider,
  p.display_name,
  p.is_enabled,
  p.sync_status,
  p.sandbox_mode,
  p.live_approved,
  p.api_base_url,
  p.oauth_authorize_url,
  p.oauth_token_url,
  p.oauth_redirect_uri,
  p.webhook_endpoint_path,
  c.client_id_set,
  c.client_secret_set,
  c.webhook_secret_set,
  c.credential_status,
  c.last_validated_at,
  c.validation_error,
  p.updated_at
FROM public.distribution_providers p
LEFT JOIN public.distribution_provider_credentials c ON c.provider = p.provider
WHERE p.provider = 'too_lost';
