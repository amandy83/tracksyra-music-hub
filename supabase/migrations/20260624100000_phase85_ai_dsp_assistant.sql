-- Phase 8.5: AI DSP Assistant.

CREATE TABLE IF NOT EXISTS public.dsp_ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'best_release_day',
    'best_release_time',
    'recommended_countries',
    'recommended_curators',
    'recommended_campaign_type',
    'similar_artists'
  )),
  recommendation TEXT NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reason TEXT NOT NULL,
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recommendation_type, recommendation)
);

CREATE INDEX IF NOT EXISTS idx_dsp_ai_recommendations_user_type
  ON public.dsp_ai_recommendations(user_id, recommendation_type, confidence_score DESC);

ALTER TABLE public.dsp_ai_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view own dsp ai recommendations" ON public.dsp_ai_recommendations;
CREATE POLICY "view own dsp ai recommendations" ON public.dsp_ai_recommendations
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "manage own dsp ai recommendations" ON public.dsp_ai_recommendations;
CREATE POLICY "manage own dsp ai recommendations" ON public.dsp_ai_recommendations
FOR ALL USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_ai_recommendations TO authenticated;
