-- Phase 5: Royalty + monetization engine.
-- Deterministic royalty calculation, split distribution, payout wallets, and auditable payout logs.

CREATE TABLE IF NOT EXISTS public.royalty_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  platform public.dsp_platform NOT NULL,
  streams_count INTEGER NOT NULL CHECK (streams_count >= 0),
  revenue_per_stream NUMERIC(18, 8) NOT NULL CHECK (revenue_per_stream >= 0),
  total_revenue NUMERIC(18, 6) NOT NULL CHECK (total_revenue >= 0),
  artist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  calculation_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(calculation_key)
);

CREATE INDEX IF NOT EXISTS idx_royalty_records_track
  ON public.royalty_records(track_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_records_release
  ON public.royalty_records(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_records_artist
  ON public.royalty_records(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_records_platform
  ON public.royalty_records(platform, created_at DESC);

CREATE TABLE IF NOT EXISTS public.royalty_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  percentage_share NUMERIC(5, 2) NOT NULL CHECK (percentage_share > 0 AND percentage_share <= 100),
  role TEXT NOT NULL DEFAULT 'artist',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_royalty_splits_track
  ON public.royalty_splits(track_id);
CREATE INDEX IF NOT EXISTS idx_royalty_splits_user
  ON public.royalty_splits(user_id);

CREATE OR REPLACE FUNCTION public.validate_royalty_split_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC(8, 2);
BEGIN
  SELECT COALESCE(SUM(percentage_share), 0)
    INTO v_total
  FROM public.royalty_splits
  WHERE track_id = NEW.track_id
    AND id <> NEW.id;

  IF v_total + NEW.percentage_share > 100 THEN
    RAISE EXCEPTION 'Royalty split total cannot exceed 100 for track %', NEW.track_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_royalty_split_total ON public.royalty_splits;
CREATE TRIGGER trg_validate_royalty_split_total
BEFORE INSERT OR UPDATE ON public.royalty_splits
FOR EACH ROW EXECUTE FUNCTION public.validate_royalty_split_total();

CREATE TABLE IF NOT EXISTS public.payout_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  pending_balance NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  available_balance NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  locked_balance NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_payout_wallets_user
  ON public.payout_wallets(user_id);

CREATE TABLE IF NOT EXISTS public.payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  wallet_id UUID REFERENCES public.payout_wallets(id) ON DELETE RESTRICT,
  amount NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  state TEXT NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED')),
  idempotency_key TEXT,
  risk_decision_id TEXT,
  governance_approval_id TEXT,
  failure_reason TEXT,
  correlation_id TEXT NOT NULL,
  requested_by TEXT,

  -- Compatibility columns for the existing server/src/payouts scaffold.
  event_id TEXT,
  entity_type TEXT,
  entity_id UUID,
  amount_inr NUMERIC(18, 2),
  status TEXT,
  last_error TEXT,
  approved_at_iso TEXT,
  queued_at_iso TEXT,
  completed_at_iso TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key),
  UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user_state
  ON public.payout_requests(user_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_wallet
  ON public.payout_requests(wallet_id);

CREATE TABLE IF NOT EXISTS public.payout_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.payout_wallets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE RESTRICT,
  royalty_record_id UUID REFERENCES public.royalty_records(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('ROYALTY_CREDIT', 'PAYOUT_LOCK', 'PAYOUT_RELEASE', 'PAYOUT_DEBIT')),
  amount NUMERIC(18, 6) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_transactions_wallet
  ON public.payout_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_user
  ON public.payout_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_royalty
  ON public.payout_transactions(royalty_record_id);
CREATE INDEX IF NOT EXISTS idx_payout_transactions_request
  ON public.payout_transactions(payout_request_id);

CREATE OR REPLACE FUNCTION public.prevent_payout_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'payout_transactions is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_payout_transaction_update ON public.payout_transactions;
CREATE TRIGGER trg_prevent_payout_transaction_update
BEFORE UPDATE ON public.payout_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_payout_transaction_mutation();

DROP TRIGGER IF EXISTS trg_prevent_payout_transaction_delete ON public.payout_transactions;
CREATE TRIGGER trg_prevent_payout_transaction_delete
BEFORE DELETE ON public.payout_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_payout_transaction_mutation();

CREATE TABLE IF NOT EXISTS public.revenue_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_platform_revenue JSONB NOT NULL DEFAULT '[]'::jsonb,
  revenue_per_artist JSONB NOT NULL DEFAULT '[]'::jsonb,
  revenue_per_track JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_earning_releases JSONB NOT NULL DEFAULT '[]'::jsonb,
  payout_success_rate NUMERIC NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revenue_analytics_calculated_at
  ON public.revenue_analytics_snapshots(calculated_at DESC);

CREATE OR REPLACE VIEW public.payout_history AS
SELECT
  pr.id AS payout_request_id,
  pr.user_id,
  pr.amount,
  pr.currency,
  pr.state,
  pr.risk_decision_id,
  pr.governance_approval_id,
  pr.failure_reason,
  pr.created_at,
  pr.updated_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'transaction_id', pt.id,
        'transaction_type', pt.transaction_type,
        'amount', pt.amount,
        'created_at', pt.created_at,
        'metadata', pt.metadata
      )
      ORDER BY pt.created_at
    ) FILTER (WHERE pt.id IS NOT NULL),
    '[]'::jsonb
  ) AS transactions
FROM public.payout_requests pr
LEFT JOIN public.payout_transactions pt ON pt.payout_request_id = pr.id
GROUP BY pr.id;

ALTER TABLE public.royalty_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view royalty records" ON public.royalty_records;
CREATE POLICY "owners view royalty records" ON public.royalty_records
FOR SELECT USING (
  artist_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.royalty_splits rs
    WHERE rs.track_id = royalty_records.track_id AND rs.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "admins manage royalty records" ON public.royalty_records;
CREATE POLICY "admins manage royalty records" ON public.royalty_records
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view royalty splits" ON public.royalty_splits;
CREATE POLICY "owners view royalty splits" ON public.royalty_splits
FOR SELECT USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = royalty_splits.track_id AND t.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage royalty splits" ON public.royalty_splits;
CREATE POLICY "admins manage royalty splits" ON public.royalty_splits
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view payout wallets" ON public.payout_wallets;
CREATE POLICY "owners view payout wallets" ON public.payout_wallets
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage payout wallets" ON public.payout_wallets;
CREATE POLICY "admins manage payout wallets" ON public.payout_wallets
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view payout requests" ON public.payout_requests;
CREATE POLICY "owners view payout requests" ON public.payout_requests
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage payout requests" ON public.payout_requests;
CREATE POLICY "admins manage payout requests" ON public.payout_requests
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view payout transactions" ON public.payout_transactions;
CREATE POLICY "owners view payout transactions" ON public.payout_transactions
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins insert payout transactions" ON public.payout_transactions;
CREATE POLICY "admins insert payout transactions" ON public.payout_transactions
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view revenue analytics" ON public.revenue_analytics_snapshots;
CREATE POLICY "admins view revenue analytics" ON public.revenue_analytics_snapshots
FOR SELECT USING (has_role(auth.uid(), 'admin'));
