-- Phase 7: Production-grade royalty accounting, statements, earnings, and payouts.

CREATE TABLE IF NOT EXISTS public.royalty_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly','quarterly','annual')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','closed','published')),
  closed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_type, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.earnings_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('too_lost','spotify_analytics','apple_music_analytics','csv_import')),
  period_id UUID REFERENCES public.royalty_periods(id) ON DELETE SET NULL,
  imported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_name TEXT,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','validated','processed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  gross_revenue NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.royalty_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES public.royalty_periods(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('artist','label','publisher','super_admin')),
  statement_type TEXT NOT NULL CHECK (statement_type IN ('monthly','quarterly','annual')),
  gross_revenue NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (gross_revenue >= 0),
  net_revenue NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (net_revenue >= 0),
  payable_amount NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (payable_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','published','void')),
  pdf_url TEXT,
  csv_url TEXT,
  xlsx_url TEXT,
  generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_id, user_id, role)
);

CREATE TABLE IF NOT EXISTS public.royalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID REFERENCES public.royalty_periods(id) ON DELETE SET NULL,
  statement_id UUID REFERENCES public.royalty_statements(id) ON DELETE SET NULL,
  royalty_record_id UUID REFERENCES public.royalty_records(id) ON DELETE SET NULL,
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('too_lost','spotify_analytics','apple_music_analytics','csv_import','manual_adjustment')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earning','adjustment','reversal','withholding')),
  gross_amount NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  split_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100 CHECK (split_percentage >= 0 AND split_percentage <= 100),
  net_amount NUMERIC(18, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  dsp TEXT,
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

ALTER TABLE public.royalty_splits
  ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES public.releases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS split_role TEXT,
  ADD COLUMN IF NOT EXISTS participant_role TEXT,
  ADD COLUMN IF NOT EXISTS effective_start DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_end DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.royalty_splits
SET split_role = COALESCE(split_role, role, 'artist'),
    participant_role = COALESCE(participant_role, role, 'artist')
WHERE split_role IS NULL OR participant_role IS NULL;

ALTER TABLE public.royalty_splits
  DROP CONSTRAINT IF EXISTS royalty_splits_split_role_check;
ALTER TABLE public.royalty_splits
  ADD CONSTRAINT royalty_splits_split_role_check
  CHECK (COALESCE(split_role, role) IN ('artist','label','publisher'));

CREATE TABLE IF NOT EXISTS public.royalty_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('artist','label','publisher','super_admin')),
  currency TEXT NOT NULL DEFAULT 'USD',
  lifetime_earnings NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (lifetime_earnings >= 0),
  available_balance NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_earnings NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (pending_earnings >= 0),
  paid_earnings NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (paid_earnings >= 0),
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role, currency)
);

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS payout_method_id UUID,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_review_status_check;
ALTER TABLE public.payout_requests
  ADD CONSTRAINT payout_requests_review_status_check
  CHECK (review_status IN ('requested','under_review','approved','rejected','paid','failed'));

CREATE TABLE IF NOT EXISTS public.payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('razorpay','stripe','bank_transfer')),
  method_type TEXT NOT NULL CHECK (method_type IN ('upi','card','bank_account','stripe_account')),
  display_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  account_holder_name TEXT,
  account_last4 TEXT,
  provider_reference TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'payout_requests' AND constraint_name = 'payout_requests_payout_method_id_fkey'
  ) THEN
    ALTER TABLE public.payout_requests
      ADD CONSTRAINT payout_requests_payout_method_id_fkey
      FOREIGN KEY (payout_method_id) REFERENCES public.payout_methods(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payout_history' AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.payout_history;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.payout_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_request_id UUID NOT NULL REFERENCES public.payout_requests(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  provider TEXT,
  provider_reference TEXT,
  receipt_url TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.royalty_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_royalty_periods_status ON public.royalty_periods(status, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_statements_user ON public.royalty_statements(user_id, statement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_transactions_user ON public.royalty_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_transactions_release ON public.royalty_transactions(release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_transactions_dsp ON public.royalty_transactions(dsp, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royalty_balances_user ON public.royalty_balances(user_id, role);
CREATE INDEX IF NOT EXISTS idx_payout_methods_user ON public.payout_methods(user_id, is_default DESC);
CREATE INDEX IF NOT EXISTS idx_payout_history_request ON public.payout_history(payout_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_imports_source ON public.earnings_imports(source, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_royalty_split_total_exact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_track_id UUID;
  v_total NUMERIC(8, 2);
  v_count INTEGER;
BEGIN
  v_track_id := COALESCE(NEW.track_id, OLD.track_id);
  IF v_track_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(percentage_share), 0), COUNT(*)
    INTO v_total, v_count
  FROM public.royalty_splits
  WHERE track_id = v_track_id
    AND (effective_end IS NULL OR effective_end >= CURRENT_DATE);

  IF v_count > 0 AND ROUND(v_total, 2) <> 100.00 THEN
    RAISE EXCEPTION 'Royalty split total must equal 100 for track %, got %', v_track_id, v_total;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_validate_royalty_split_total_exact ON public.royalty_splits;
CREATE CONSTRAINT TRIGGER trg_validate_royalty_split_total_exact
AFTER INSERT OR UPDATE OR DELETE ON public.royalty_splits
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_royalty_split_total_exact();

CREATE OR REPLACE FUNCTION public.refresh_royalty_balance(p_user_id UUID, p_role TEXT DEFAULT 'artist', p_currency TEXT DEFAULT 'USD')
RETURNS public.royalty_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance public.royalty_balances;
BEGIN
  INSERT INTO public.royalty_balances (
    user_id, role, currency, lifetime_earnings, available_balance, pending_earnings, paid_earnings, last_transaction_at, updated_at
  )
  SELECT
    p_user_id,
    p_role,
    p_currency,
    COALESCE(SUM(CASE WHEN rt.net_amount > 0 THEN rt.net_amount ELSE 0 END), 0),
    GREATEST(
      COALESCE(SUM(CASE WHEN rt.net_amount > 0 THEN rt.net_amount ELSE 0 END), 0)
      - COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE user_id = p_user_id AND review_status IN ('approved','paid')), 0),
      0
    ),
    COALESCE(SUM(CASE WHEN rs.status IN ('draft','generated') THEN rt.net_amount ELSE 0 END), 0),
    COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE user_id = p_user_id AND review_status = 'paid'), 0),
    MAX(rt.created_at),
    now()
  FROM public.royalty_transactions rt
  LEFT JOIN public.royalty_statements rs ON rs.id = rt.statement_id
  WHERE rt.user_id = p_user_id AND rt.currency = p_currency
  ON CONFLICT (user_id, role, currency) DO UPDATE SET
    lifetime_earnings = EXCLUDED.lifetime_earnings,
    available_balance = EXCLUDED.available_balance,
    pending_earnings = EXCLUDED.pending_earnings,
    paid_earnings = EXCLUDED.paid_earnings,
    last_transaction_at = EXCLUDED.last_transaction_at,
    updated_at = now()
  RETURNING * INTO v_balance;

  RETURN v_balance;
END $$;

CREATE OR REPLACE FUNCTION public.transition_payout_request(
  p_payout_request_id UUID,
  p_next_status TEXT,
  p_actor_user_id UUID DEFAULT auth.uid(),
  p_notes TEXT DEFAULT NULL,
  p_receipt_url TEXT DEFAULT NULL
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous TEXT;
  v_row public.payout_requests;
BEGIN
  SELECT review_status INTO v_previous
  FROM public.payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF v_previous IS NULL THEN
    RAISE EXCEPTION 'Payout request not found: %', p_payout_request_id;
  END IF;

  IF p_next_status NOT IN ('under_review','approved','rejected','paid','failed') THEN
    RAISE EXCEPTION 'Unsupported payout status: %', p_next_status;
  END IF;

  IF v_previous = 'requested' AND p_next_status NOT IN ('under_review','rejected') THEN
    RAISE EXCEPTION 'Invalid payout transition % -> %', v_previous, p_next_status;
  ELSIF v_previous = 'under_review' AND p_next_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid payout transition % -> %', v_previous, p_next_status;
  ELSIF v_previous = 'approved' AND p_next_status NOT IN ('paid','failed') THEN
    RAISE EXCEPTION 'Invalid payout transition % -> %', v_previous, p_next_status;
  ELSIF v_previous IN ('rejected','paid','failed') THEN
    RAISE EXCEPTION 'Payout status % is terminal', v_previous;
  END IF;

  UPDATE public.payout_requests
  SET review_status = p_next_status,
      state = CASE WHEN p_next_status = 'paid' THEN 'COMPLETED' WHEN p_next_status = 'rejected' THEN 'REJECTED' WHEN p_next_status = 'failed' THEN 'FAILED' ELSE state END,
      reviewed_by = CASE WHEN p_next_status IN ('approved','rejected') THEN p_actor_user_id ELSE reviewed_by END,
      reviewed_at = CASE WHEN p_next_status IN ('approved','rejected') THEN now() ELSE reviewed_at END,
      paid_at = CASE WHEN p_next_status = 'paid' THEN now() ELSE paid_at END,
      receipt_url = COALESCE(p_receipt_url, receipt_url),
      rejection_reason = CASE WHEN p_next_status = 'rejected' THEN p_notes ELSE rejection_reason END,
      updated_at = now()
  WHERE id = p_payout_request_id
  RETURNING * INTO v_row;

  INSERT INTO public.payout_history (
    payout_request_id, actor_user_id, from_status, to_status, action, provider, receipt_url, notes
  ) VALUES (
    p_payout_request_id, p_actor_user_id, v_previous, p_next_status, 'payout_' || p_next_status, v_row.provider, p_receipt_url, p_notes
  );

  INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
  SELECT v_row.user_id,
    CASE
      WHEN p_next_status = 'approved' THEN 'Payout Approved'
      WHEN p_next_status = 'rejected' THEN 'Payout Rejected'
      WHEN p_next_status = 'paid' THEN 'Payout Paid'
      ELSE 'Payout Updated'
    END,
    COALESCE(p_notes, 'Your payout request status changed to ' || p_next_status || '.'),
    CASE WHEN p_next_status = 'rejected' THEN 'WARNING' ELSE 'SUCCESS' END,
    'payout_requests',
    v_row.id
  WHERE to_regclass('public.app_notifications') IS NOT NULL;

  PERFORM public.refresh_royalty_balance(v_row.user_id, 'artist', v_row.currency);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.generate_royalty_statement(
  p_period_id UUID,
  p_user_id UUID,
  p_role TEXT,
  p_statement_type TEXT
)
RETURNS public.royalty_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_statement public.royalty_statements;
BEGIN
  INSERT INTO public.royalty_statements (
    period_id, user_id, role, statement_type, gross_revenue, net_revenue, payable_amount, status, generated_at
  )
  SELECT
    p_period_id,
    p_user_id,
    p_role,
    p_statement_type,
    COALESCE(SUM(gross_amount), 0),
    COALESCE(SUM(net_amount), 0),
    COALESCE(SUM(net_amount), 0),
    'generated',
    now()
  FROM public.royalty_transactions
  WHERE period_id = p_period_id AND user_id = p_user_id
  ON CONFLICT (period_id, user_id, role) DO UPDATE SET
    statement_type = EXCLUDED.statement_type,
    gross_revenue = EXCLUDED.gross_revenue,
    net_revenue = EXCLUDED.net_revenue,
    payable_amount = EXCLUDED.payable_amount,
    status = 'generated',
    generated_at = now(),
    updated_at = now()
  RETURNING * INTO v_statement;

  UPDATE public.royalty_transactions
  SET statement_id = v_statement.id
  WHERE period_id = p_period_id AND user_id = p_user_id;

  INSERT INTO public.app_notifications (user_id, title, message, notification_type, entity_table, entity_id)
  SELECT p_user_id, 'Statement Ready', 'Your ' || p_statement_type || ' royalty statement is ready.', 'INFO', 'royalty_statements', v_statement.id
  WHERE to_regclass('public.app_notifications') IS NOT NULL;

  PERFORM public.refresh_royalty_balance(p_user_id, p_role, v_statement.currency);
  RETURN v_statement;
END $$;

CREATE OR REPLACE VIEW public.artist_royalty_dashboard AS
SELECT
  rb.user_id,
  rb.lifetime_earnings,
  rb.available_balance,
  rb.pending_earnings,
  rb.paid_earnings,
  COALESCE(monthly.monthly_trends, '[]'::jsonb) AS monthly_trends,
  COALESCE(top_releases.top_releases, '[]'::jsonb) AS top_releases
FROM public.royalty_balances rb
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('month', month, 'revenue', revenue) ORDER BY month) AS monthly_trends
  FROM (
    SELECT date_trunc('month', created_at)::date AS month, SUM(net_amount) AS revenue
    FROM public.royalty_transactions
    WHERE user_id = rb.user_id
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12
  ) m
) monthly ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('release_id', release_id, 'revenue', revenue) ORDER BY revenue DESC) AS top_releases
  FROM (
    SELECT release_id, SUM(net_amount) AS revenue
    FROM public.royalty_transactions
    WHERE user_id = rb.user_id AND release_id IS NOT NULL
    GROUP BY release_id
    ORDER BY revenue DESC
    LIMIT 10
  ) r
) top_releases ON true
WHERE rb.role = 'artist';

CREATE OR REPLACE VIEW public.label_royalty_dashboard AS
SELECT
  la.label_user_id AS user_id,
  COALESCE(SUM(rt.net_amount), 0) AS catalog_revenue,
  COALESCE(jsonb_agg(DISTINCT jsonb_build_object('artist_id', la.artist_user_id, 'revenue', artist_revenue.revenue)) FILTER (WHERE la.artist_user_id IS NOT NULL), '[]'::jsonb) AS artist_breakdown,
  COALESCE(SUM(rt.net_amount) FILTER (WHERE rt.created_at >= now() - interval '30 days'), 0) AS revenue_growth
FROM public.label_artists la
LEFT JOIN public.royalty_transactions rt ON rt.user_id = la.artist_user_id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(net_amount), 0) AS revenue
  FROM public.royalty_transactions
  WHERE user_id = la.artist_user_id
) artist_revenue ON true
WHERE la.status = 'active'
GROUP BY la.label_user_id;

CREATE OR REPLACE VIEW public.publisher_royalty_dashboard AS
SELECT
  pl.publisher_user_id AS user_id,
  COALESCE(SUM(rt.net_amount), 0) AS publishing_revenue,
  COALESCE(jsonb_agg(DISTINCT jsonb_build_object('writer_id', la.artist_user_id, 'share', rs.percentage_share)) FILTER (WHERE la.artist_user_id IS NOT NULL), '[]'::jsonb) AS writer_shares,
  COALESCE(SUM(rt.net_amount) FILTER (WHERE rt.transaction_type IN ('earning','adjustment')), 0) AS rights_revenue
FROM public.publisher_labels pl
LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id AND la.status = 'active'
LEFT JOIN public.royalty_transactions rt ON rt.user_id = la.artist_user_id
LEFT JOIN public.royalty_splits rs ON rs.user_id = la.artist_user_id AND rs.split_role = 'publisher'
WHERE pl.status = 'active'
GROUP BY pl.publisher_user_id;

CREATE OR REPLACE VIEW public.super_admin_royalty_dashboard AS
SELECT
  COALESCE((SELECT SUM(net_amount) FROM public.royalty_transactions), 0) AS global_revenue,
  COALESCE((SELECT COUNT(*) FROM public.payout_requests WHERE review_status IN ('requested','under_review','approved')), 0) AS payout_queue,
  COALESCE((SELECT COUNT(*) FROM public.royalty_transactions WHERE transaction_type IN ('adjustment','reversal')), 0) AS royalty_adjustments,
  COALESCE((SELECT COUNT(*) FROM public.royalty_audit_logs), 0) AS audit_logs;

CREATE OR REPLACE VIEW public.royalty_analytics_dashboard AS
SELECT
  COALESCE((SELECT jsonb_agg(jsonb_build_object('dsp', dsp, 'revenue', revenue) ORDER BY revenue DESC) FROM (
    SELECT COALESCE(dsp, source) AS dsp, SUM(net_amount) AS revenue FROM public.royalty_transactions GROUP BY 1
  ) q), '[]'::jsonb) AS revenue_by_dsp,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('release_id', release_id, 'revenue', revenue) ORDER BY revenue DESC) FROM (
    SELECT release_id, SUM(net_amount) AS revenue FROM public.royalty_transactions WHERE release_id IS NOT NULL GROUP BY release_id
  ) q), '[]'::jsonb) AS revenue_by_release,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('artist_id', user_id, 'revenue', revenue) ORDER BY revenue DESC) FROM (
    SELECT user_id, SUM(net_amount) AS revenue FROM public.royalty_transactions GROUP BY user_id
  ) q), '[]'::jsonb) AS revenue_by_artist,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'revenue', revenue) ORDER BY month) FROM (
    SELECT date_trunc('month', created_at)::date AS month, SUM(net_amount) AS revenue FROM public.royalty_transactions GROUP BY 1
  ) q), '[]'::jsonb) AS revenue_trends;

CREATE OR REPLACE VIEW public.payout_history_summary AS
SELECT
  pr.id AS payout_request_id,
  pr.user_id,
  pr.amount,
  pr.currency,
  pr.state,
  pr.review_status,
  pr.provider,
  pr.receipt_url,
  pr.rejection_reason,
  pr.created_at,
  pr.updated_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_id', phe.id,
        'from_status', phe.from_status,
        'to_status', phe.to_status,
        'action', phe.action,
        'provider_reference', phe.provider_reference,
        'receipt_url', phe.receipt_url,
        'notes', phe.notes,
        'created_at', phe.created_at
      )
      ORDER BY phe.created_at
    ) FILTER (WHERE phe.id IS NOT NULL),
    '[]'::jsonb
  ) AS events
FROM public.payout_requests pr
LEFT JOIN public.payout_history phe ON phe.payout_request_id = pr.id
GROUP BY pr.id;

ALTER VIEW public.artist_royalty_dashboard SET (security_invoker = on);
ALTER VIEW public.label_royalty_dashboard SET (security_invoker = on);
ALTER VIEW public.publisher_royalty_dashboard SET (security_invoker = on);
ALTER VIEW public.super_admin_royalty_dashboard SET (security_invoker = on);
ALTER VIEW public.royalty_analytics_dashboard SET (security_invoker = on);
ALTER VIEW public.payout_history_summary SET (security_invoker = on);

ALTER TABLE public.royalty_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalty_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role hierarchy view royalty statements" ON public.royalty_statements;
CREATE POLICY "role hierarchy view royalty statements" ON public.royalty_statements FOR SELECT USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin')
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    WHERE pl.publisher_user_id = auth.uid() AND (pl.label_user_id = royalty_statements.user_id OR la.artist_user_id = royalty_statements.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1 FROM public.label_artists la WHERE la.label_user_id = auth.uid() AND la.artist_user_id = royalty_statements.user_id
  ))
);

DROP POLICY IF EXISTS "role hierarchy view royalty transactions" ON public.royalty_transactions;
CREATE POLICY "role hierarchy view royalty transactions" ON public.royalty_transactions FOR SELECT USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin')
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    WHERE pl.publisher_user_id = auth.uid() AND (pl.label_user_id = royalty_transactions.user_id OR la.artist_user_id = royalty_transactions.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1 FROM public.label_artists la WHERE la.label_user_id = auth.uid() AND la.artist_user_id = royalty_transactions.user_id
  ))
);

DROP POLICY IF EXISTS "role hierarchy view royalty balances" ON public.royalty_balances;
CREATE POLICY "role hierarchy view royalty balances" ON public.royalty_balances FOR SELECT USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin')
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1 FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    WHERE pl.publisher_user_id = auth.uid() AND (pl.label_user_id = royalty_balances.user_id OR la.artist_user_id = royalty_balances.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1 FROM public.label_artists la WHERE la.label_user_id = auth.uid() AND la.artist_user_id = royalty_balances.user_id
  ))
);

DROP POLICY IF EXISTS "phase7 role hierarchy view royalty splits" ON public.royalty_splits;
CREATE POLICY "phase7 role hierarchy view royalty splits" ON public.royalty_splits FOR SELECT USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = royalty_splits.track_id AND t.user_id = auth.uid())
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1
    FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE pl.publisher_user_id = auth.uid()
      AND (pl.label_user_id = royalty_splits.user_id OR la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1
    FROM public.label_artists la
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE la.label_user_id = auth.uid()
      AND (la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
);

DROP POLICY IF EXISTS "phase7 catalog managers write royalty splits" ON public.royalty_splits;
CREATE POLICY "phase7 catalog managers write royalty splits" ON public.royalty_splits
FOR ALL USING (
  has_role(auth.uid(), 'super_admin')
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1
    FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE pl.publisher_user_id = auth.uid()
      AND (pl.label_user_id = royalty_splits.user_id OR la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1
    FROM public.label_artists la
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE la.label_user_id = auth.uid()
      AND (la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin')
  OR (has_role(auth.uid(), 'publisher') AND EXISTS (
    SELECT 1
    FROM public.publisher_labels pl
    LEFT JOIN public.label_artists la ON la.label_user_id = pl.label_user_id
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE pl.publisher_user_id = auth.uid()
      AND (pl.label_user_id = royalty_splits.user_id OR la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
  OR (has_role(auth.uid(), 'label') AND EXISTS (
    SELECT 1
    FROM public.label_artists la
    LEFT JOIN public.tracks t ON t.id = royalty_splits.track_id
    WHERE la.label_user_id = auth.uid()
      AND (la.artist_user_id = royalty_splits.user_id OR la.artist_user_id = t.user_id)
  ))
);

DROP POLICY IF EXISTS "owners manage payout methods" ON public.payout_methods;
CREATE POLICY "owners manage payout methods" ON public.payout_methods
FOR ALL USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'))
WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "owners view payout history" ON public.payout_history;
CREATE POLICY "owners view payout history" ON public.payout_history FOR SELECT USING (
  has_role(auth.uid(), 'super_admin')
  OR EXISTS (SELECT 1 FROM public.payout_requests pr WHERE pr.id = payout_history.payout_request_id AND pr.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage royalty accounting" ON public.royalty_periods;
CREATE POLICY "admins manage royalty accounting" ON public.royalty_periods
FOR ALL USING (has_role(auth.uid(), 'super_admin')) WITH CHECK (has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "admins manage earnings imports" ON public.earnings_imports;
CREATE POLICY "admins manage earnings imports" ON public.earnings_imports
FOR ALL USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher'))
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher'));

DROP POLICY IF EXISTS "admins view royalty audit logs" ON public.royalty_audit_logs;
CREATE POLICY "admins view royalty audit logs" ON public.royalty_audit_logs
FOR SELECT USING (has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "phase7 admins manage payout requests" ON public.payout_requests;
CREATE POLICY "phase7 admins manage payout requests" ON public.payout_requests
FOR ALL USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher'))
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'publisher') OR user_id = auth.uid());
