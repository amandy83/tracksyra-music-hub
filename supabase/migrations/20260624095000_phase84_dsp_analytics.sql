-- Phase 8.4: DSP Analytics.

CREATE TABLE IF NOT EXISTS public.dsp_analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  streams INTEGER NOT NULL DEFAULT 0 CHECK (streams >= 0),
  saves INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0),
  playlist_adds INTEGER NOT NULL DEFAULT 0 CHECK (playlist_adds >= 0),
  followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  engagement INTEGER NOT NULL DEFAULT 0 CHECK (engagement >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_dsp_analytics_snapshots_user_date
  ON public.dsp_analytics_snapshots(user_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS public.dsp_audience_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  country TEXT NOT NULL DEFAULT 'Unknown',
  city TEXT NOT NULL DEFAULT 'Unknown',
  followers INTEGER NOT NULL DEFAULT 0 CHECK (followers >= 0),
  reach INTEGER NOT NULL DEFAULT 0 CHECK (reach >= 0),
  engagement INTEGER NOT NULL DEFAULT 0 CHECK (engagement >= 0),
  growth_rate NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_date, country, city)
);

CREATE INDEX IF NOT EXISTS idx_dsp_audience_metrics_user_date
  ON public.dsp_audience_metrics(user_id, metric_date DESC);

ALTER TABLE public.dsp_analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_audience_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view own dsp analytics snapshots" ON public.dsp_analytics_snapshots;
CREATE POLICY "view own dsp analytics snapshots" ON public.dsp_analytics_snapshots
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "manage own dsp analytics snapshots" ON public.dsp_analytics_snapshots;
CREATE POLICY "manage own dsp analytics snapshots" ON public.dsp_analytics_snapshots
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "view own dsp audience metrics" ON public.dsp_audience_metrics;
CREATE POLICY "view own dsp audience metrics" ON public.dsp_audience_metrics
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "manage own dsp audience metrics" ON public.dsp_audience_metrics;
CREATE POLICY "manage own dsp audience metrics" ON public.dsp_audience_metrics
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_analytics_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_audience_metrics TO authenticated;
