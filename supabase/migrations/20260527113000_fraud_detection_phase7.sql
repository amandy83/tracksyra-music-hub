-- Phase 7: Fraud detection + anti-bot intelligence.
-- Deterministic, explainable fraud scoring before any royalty or wallet processing.

CREATE TABLE IF NOT EXISTS public.fraud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  platform public.dsp_platform NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('CLEAN', 'SUSPICIOUS', 'BLOCKED')),
  fraud_score INTEGER NOT NULL CHECK (fraud_score >= 0 AND fraud_score <= 100),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_event JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_events_track_time
  ON public.fraud_events(track_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_user_time
  ON public.fraud_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_platform_decision
  ON public.fraud_events(platform, decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_score
  ON public.fraud_events(fraud_score DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_fraud_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'fraud_events is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_fraud_event_update ON public.fraud_events;
CREATE TRIGGER trg_prevent_fraud_event_update
BEFORE UPDATE ON public.fraud_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_event_mutation();

DROP TRIGGER IF EXISTS trg_prevent_fraud_event_delete ON public.fraud_events;
CREATE TRIGGER trg_prevent_fraud_event_delete
BEFORE DELETE ON public.fraud_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_event_mutation();

CREATE TABLE IF NOT EXISTS public.fraud_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_event_id UUID NOT NULL REFERENCES public.fraud_events(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('PENDING', 'APPROVE', 'REJECT', 'ESCALATE')),
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_fraud_review
  ON public.fraud_reviews(fraud_event_id)
  WHERE decision = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_fraud_reviews_event
  ON public.fraud_reviews(fraud_event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_reviews_decision
  ON public.fraud_reviews(decision, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_fraud_review_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'fraud_reviews is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_fraud_review_update ON public.fraud_reviews;
CREATE TRIGGER trg_prevent_fraud_review_update
BEFORE UPDATE ON public.fraud_reviews
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_review_mutation();

DROP TRIGGER IF EXISTS trg_prevent_fraud_review_delete ON public.fraud_reviews;
CREATE TRIGGER trg_prevent_fraud_review_delete
BEFORE DELETE ON public.fraud_reviews
FOR EACH ROW EXECUTE FUNCTION public.prevent_fraud_review_mutation();

CREATE TABLE IF NOT EXISTS public.fraud_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraud_rate_per_platform JSONB NOT NULL DEFAULT '[]'::jsonb,
  fraud_rate_per_artist JSONB NOT NULL DEFAULT '[]'::jsonb,
  flagged_tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_stream_counts JSONB NOT NULL DEFAULT '[]'::jsonb,
  suspicious_geographic_clusters JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_analytics_snapshots_calculated
  ON public.fraud_analytics_snapshots(calculated_at DESC);

CREATE TABLE IF NOT EXISTS public.fraud_user_risk_scores (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_user_risk_scores_score
  ON public.fraud_user_risk_scores(risk_score DESC, updated_at DESC);

CREATE OR REPLACE VIEW public.fraud_review_queue AS
SELECT
  fr.id AS review_id,
  fr.fraud_event_id,
  fe.event_id,
  fe.track_id,
  fe.user_id,
  fe.platform,
  fe.fraud_score,
  fe.reasons,
  fe.feature_vector,
  fe.raw_event,
  fr.created_at AS queued_at
FROM public.fraud_reviews fr
JOIN public.fraud_events fe ON fe.id = fr.fraud_event_id
WHERE fr.decision = 'PENDING'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fraud_reviews terminal
    WHERE terminal.fraud_event_id = fr.fraud_event_id
      AND terminal.decision IN ('APPROVE', 'REJECT', 'ESCALATE')
  );

ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_user_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage fraud events" ON public.fraud_events;
CREATE POLICY "admins manage fraud events" ON public.fraud_events
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view own fraud events" ON public.fraud_events;
CREATE POLICY "owners view own fraud events" ON public.fraud_events
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage fraud reviews" ON public.fraud_reviews;
CREATE POLICY "admins manage fraud reviews" ON public.fraud_reviews
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view fraud analytics" ON public.fraud_analytics_snapshots;
CREATE POLICY "admins view fraud analytics" ON public.fraud_analytics_snapshots
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage fraud risk scores" ON public.fraud_user_risk_scores;
CREATE POLICY "admins manage fraud risk scores" ON public.fraud_user_risk_scores
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view own fraud risk score" ON public.fraud_user_risk_scores;
CREATE POLICY "owners view own fraud risk score" ON public.fraud_user_risk_scores
FOR SELECT USING (user_id = auth.uid());
