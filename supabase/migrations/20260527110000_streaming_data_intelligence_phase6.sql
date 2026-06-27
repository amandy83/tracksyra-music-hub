-- Phase 6: Streaming data intelligence layer.
-- Provider-agnostic stream ingestion, idempotent processing, royalty recalculation hooks, and stream analytics.

CREATE TABLE IF NOT EXISTS public.streaming_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  platform public.dsp_platform NOT NULL,
  stream_count_increment INTEGER NOT NULL CHECK (stream_count_increment >= 0),
  listener_country TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  ingestion_mode TEXT NOT NULL CHECK (ingestion_mode IN ('REALTIME', 'DAILY_BATCH')),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(event_id)
);

CREATE INDEX IF NOT EXISTS idx_streaming_events_track_time
  ON public.streaming_events(track_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_events_platform_time
  ON public.streaming_events(platform, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_events_provider_time
  ON public.streaming_events(provider, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_events_country
  ON public.streaming_events(listener_country, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_streaming_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'streaming_events is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_prevent_streaming_event_update ON public.streaming_events;
CREATE TRIGGER trg_prevent_streaming_event_update
BEFORE UPDATE ON public.streaming_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_streaming_event_mutation();

DROP TRIGGER IF EXISTS trg_prevent_streaming_event_delete ON public.streaming_events;
CREATE TRIGGER trg_prevent_streaming_event_delete
BEFORE DELETE ON public.streaming_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_streaming_event_mutation();

CREATE TABLE IF NOT EXISTS public.streaming_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  platform public.dsp_platform NOT NULL,
  stat_date DATE NOT NULL,
  listener_country TEXT NOT NULL,
  streams_count INTEGER NOT NULL DEFAULT 0 CHECK (streams_count >= 0),
  last_event_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(track_id, platform, stat_date, listener_country)
);

CREATE INDEX IF NOT EXISTS idx_streaming_stats_track_date
  ON public.streaming_stats(track_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_stats_platform_date
  ON public.streaming_stats(platform, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_stats_country_date
  ON public.streaming_stats(listener_country, stat_date DESC);

CREATE TABLE IF NOT EXISTS public.stream_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSED', 'FAILED')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_processing_logs_batch
  ON public.stream_processing_logs(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_processing_logs_provider
  ON public.stream_processing_logs(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_processing_logs_status
  ON public.stream_processing_logs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stream_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_streams_per_track JSONB NOT NULL DEFAULT '[]'::jsonb,
  streams_per_platform JSONB NOT NULL DEFAULT '[]'::jsonb,
  geographic_distribution JSONB NOT NULL DEFAULT '[]'::jsonb,
  daily_trends JSONB NOT NULL DEFAULT '[]'::jsonb,
  weekly_trends JSONB NOT NULL DEFAULT '[]'::jsonb,
  monthly_trends JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_trending_tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stream_analytics_snapshots_calculated
  ON public.stream_analytics_snapshots(calculated_at DESC);

CREATE OR REPLACE VIEW public.streaming_track_totals AS
SELECT
  track_id,
  platform,
  SUM(streams_count)::int AS streams_count,
  MAX(last_event_at) AS last_event_at
FROM public.streaming_stats
GROUP BY track_id, platform;

ALTER TABLE public.streaming_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaming_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners view streaming events" ON public.streaming_events;
CREATE POLICY "owners view streaming events" ON public.streaming_events
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = streaming_events.track_id AND t.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage streaming events" ON public.streaming_events;
CREATE POLICY "admins manage streaming events" ON public.streaming_events
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "owners view streaming stats" ON public.streaming_stats;
CREATE POLICY "owners view streaming stats" ON public.streaming_stats
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = streaming_stats.track_id AND t.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admins manage streaming stats" ON public.streaming_stats;
CREATE POLICY "admins manage streaming stats" ON public.streaming_stats
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view stream processing logs" ON public.stream_processing_logs;
CREATE POLICY "admins view stream processing logs" ON public.stream_processing_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage stream processing logs" ON public.stream_processing_logs;
CREATE POLICY "admins manage stream processing logs" ON public.stream_processing_logs
FOR ALL USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins view stream analytics snapshots" ON public.stream_analytics_snapshots;
CREATE POLICY "admins view stream analytics snapshots" ON public.stream_analytics_snapshots
FOR SELECT USING (has_role(auth.uid(), 'admin'));
