-- Phase 8: Real-time artist dashboard + live event system.
-- Append-only event log, ordered entity streams, subscription audit, and replayable dashboard snapshots.

CREATE TABLE IF NOT EXISTS public.realtime_entity_sequences (
  sequence_key TEXT PRIMARY KEY,
  last_sequence BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.realtime_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'STREAM_RECEIVED',
    'ROYALTY_UPDATED',
    'WALLET_CREDITED',
    'FRAUD_FLAGGED',
    'DISTRIBUTION_STATUS_CHANGED',
    'PAYOUT_REQUESTED',
    'PAYOUT_COMPLETED',
    'DASHBOARD_SNAPSHOT_UPDATED'
  )),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'track', 'platform', 'payout', 'release')),
  entity_id TEXT NOT NULL,
  artist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  platform public.dsp_platform,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  sequence_key TEXT NOT NULL,
  sequence_number BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id),
  UNIQUE(sequence_key, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_realtime_event_log_artist
  ON public.realtime_event_log(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_event_log_track
  ON public.realtime_event_log(track_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_event_log_sequence
  ON public.realtime_event_log(sequence_key, sequence_number DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_event_log_type
  ON public.realtime_event_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_event_log_channels
  ON public.realtime_event_log USING GIN (channels);

CREATE OR REPLACE FUNCTION public.prevent_realtime_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'realtime_event_log is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_realtime_event_update ON public.realtime_event_log;
CREATE TRIGGER trg_prevent_realtime_event_update
BEFORE UPDATE ON public.realtime_event_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_realtime_event_mutation();

DROP TRIGGER IF EXISTS trg_prevent_realtime_event_delete ON public.realtime_event_log;
CREATE TRIGGER trg_prevent_realtime_event_delete
BEFORE DELETE ON public.realtime_event_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_realtime_event_mutation();

CREATE TABLE IF NOT EXISTS public.realtime_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  socket_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_user
  ON public.realtime_subscriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_channel
  ON public.realtime_subscriptions(channel, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stream_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  revenue_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  fraud_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  distribution_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  rolling_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_dashboard_snapshots_artist
  ON public.live_dashboard_snapshots(artist_id, calculated_at DESC);

ALTER TABLE public.realtime_entity_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage realtime sequences" ON public.realtime_entity_sequences;
CREATE POLICY "admins manage realtime sequences" ON public.realtime_entity_sequences
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view realtime events" ON public.realtime_event_log;
CREATE POLICY "owners view realtime events" ON public.realtime_event_log
FOR SELECT USING (
  artist_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = realtime_event_log.track_id AND t.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.releases r WHERE r.id = realtime_event_log.release_id AND r.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.payout_requests p WHERE p.id::text = realtime_event_log.entity_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage realtime events" ON public.realtime_event_log;
CREATE POLICY "admins manage realtime events" ON public.realtime_event_log
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view realtime subscriptions" ON public.realtime_subscriptions;
CREATE POLICY "owners view realtime subscriptions" ON public.realtime_subscriptions
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admins manage realtime subscriptions" ON public.realtime_subscriptions;
CREATE POLICY "admins manage realtime subscriptions" ON public.realtime_subscriptions
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view live dashboard snapshots" ON public.live_dashboard_snapshots;
CREATE POLICY "owners view live dashboard snapshots" ON public.live_dashboard_snapshots
FOR SELECT USING (artist_id = auth.uid());

DROP POLICY IF EXISTS "admins manage live dashboard snapshots" ON public.live_dashboard_snapshots;
CREATE POLICY "admins manage live dashboard snapshots" ON public.live_dashboard_snapshots
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_event_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_dashboard_snapshots;
