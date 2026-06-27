-- Phase 9: Too Lost production integration hardening.
-- Adds encrypted OAuth state/token storage and provider account metadata.

ALTER TABLE public.distribution_provider_credentials
  ADD COLUMN IF NOT EXISTS access_token_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS token_type TEXT,
  ADD COLUMN IF NOT EXISTS token_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS connected_account_id TEXT,
  ADD COLUMN IF NOT EXISTS connected_account_name TEXT,
  ADD COLUMN IF NOT EXISTS connected_account_email TEXT,
  ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ;

ALTER TABLE public.distribution_provider_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier_encrypted JSONB,
  ADD COLUMN IF NOT EXISTS return_to_path TEXT;

UPDATE public.distribution_provider_credentials
SET token_scopes = COALESCE(token_scopes, ARRAY[]::TEXT[])
WHERE provider = 'too_lost';

ALTER TABLE public.distribution_provider_credentials
  ALTER COLUMN token_scopes SET DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.distribution_provider_credentials.access_token_encrypted IS 'Encrypted Too Lost access token envelope.';
COMMENT ON COLUMN public.distribution_provider_credentials.refresh_token_encrypted IS 'Encrypted Too Lost refresh token envelope.';
COMMENT ON COLUMN public.distribution_provider_oauth_states.code_verifier_encrypted IS 'Encrypted PKCE code verifier envelope.';
