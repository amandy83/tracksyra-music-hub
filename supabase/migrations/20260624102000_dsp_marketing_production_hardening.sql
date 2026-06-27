-- DSP Marketing Production Hardening.

DO $$
BEGIN
  IF to_regclass('public.releases') IS NULL THEN
    RAISE EXCEPTION 'DSP Marketing hardening prerequisite missing: public.releases';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'DSP Marketing hardening prerequisite missing: public.set_updated_at()';
  END IF;
END $$;

ALTER TABLE public.dsp_release_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_marketing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_pre_save_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_pre_save_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dsp_campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view own dsp release readiness" ON public.dsp_release_readiness;
CREATE POLICY "view own dsp release readiness" ON public.dsp_release_readiness
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_release_readiness.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "manage own dsp release readiness" ON public.dsp_release_readiness;
CREATE POLICY "manage own dsp release readiness" ON public.dsp_release_readiness
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_release_readiness.release_id
      AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_release_readiness.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "view own dsp marketing tasks" ON public.dsp_marketing_tasks;
CREATE POLICY "view own dsp marketing tasks" ON public.dsp_marketing_tasks
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_marketing_tasks.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "manage own dsp marketing tasks" ON public.dsp_marketing_tasks;
CREATE POLICY "manage own dsp marketing tasks" ON public.dsp_marketing_tasks
FOR ALL USING (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_marketing_tasks.release_id
      AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = dsp_marketing_tasks.release_id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "view own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns;
CREATE POLICY "view own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns;
CREATE POLICY "insert own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns;
CREATE POLICY "update own dsp pre-save campaigns" ON public.dsp_pre_save_campaigns
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "view own dsp pre-save events" ON public.dsp_pre_save_events;
CREATE POLICY "view own dsp pre-save events" ON public.dsp_pre_save_events
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.dsp_pre_save_campaigns c
    WHERE c.id = dsp_pre_save_events.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert own dsp pre-save events" ON public.dsp_pre_save_events;
CREATE POLICY "insert own dsp pre-save events" ON public.dsp_pre_save_events
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dsp_pre_save_campaigns c
    WHERE c.id = dsp_pre_save_events.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "manage own dsp pre-save events" ON public.dsp_pre_save_events;
CREATE POLICY "manage own dsp pre-save events" ON public.dsp_pre_save_events
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.dsp_pre_save_campaigns c
    WHERE c.id = dsp_pre_save_events.campaign_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dsp_pre_save_campaigns c
    WHERE c.id = dsp_pre_save_events.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "view own dsp campaigns" ON public.dsp_campaigns;
CREATE POLICY "view own dsp campaigns" ON public.dsp_campaigns
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own dsp campaigns" ON public.dsp_campaigns;
CREATE POLICY "insert own dsp campaigns" ON public.dsp_campaigns
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update own dsp campaigns" ON public.dsp_campaigns;
CREATE POLICY "update own dsp campaigns" ON public.dsp_campaigns
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "view own dsp campaign metrics" ON public.dsp_campaign_metrics;
CREATE POLICY "view own dsp campaign metrics" ON public.dsp_campaign_metrics
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.dsp_campaigns c
    WHERE c.id = dsp_campaign_metrics.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "insert own dsp campaign metrics" ON public.dsp_campaign_metrics;
CREATE POLICY "insert own dsp campaign metrics" ON public.dsp_campaign_metrics
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dsp_campaigns c
    WHERE c.id = dsp_campaign_metrics.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "update own dsp campaign metrics" ON public.dsp_campaign_metrics;
CREATE POLICY "update own dsp campaign metrics" ON public.dsp_campaign_metrics
FOR UPDATE USING (
  EXISTS (
    SELECT 1
    FROM public.dsp_campaigns c
    WHERE c.id = dsp_campaign_metrics.campaign_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.dsp_campaigns c
    WHERE c.id = dsp_campaign_metrics.campaign_id
      AND c.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS trg_dsp_release_readiness_updated_at ON public.dsp_release_readiness;
CREATE TRIGGER trg_dsp_release_readiness_updated_at
BEFORE UPDATE ON public.dsp_release_readiness
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dsp_marketing_tasks_updated_at ON public.dsp_marketing_tasks;
CREATE TRIGGER trg_dsp_marketing_tasks_updated_at
BEFORE UPDATE ON public.dsp_marketing_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dsp_pre_save_campaigns_updated_at ON public.dsp_pre_save_campaigns;
CREATE TRIGGER trg_dsp_pre_save_campaigns_updated_at
BEFORE UPDATE ON public.dsp_pre_save_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dsp_campaigns_updated_at ON public.dsp_campaigns;
CREATE TRIGGER trg_dsp_campaigns_updated_at
BEFORE UPDATE ON public.dsp_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dsp_campaign_metrics_updated_at ON public.dsp_campaign_metrics;
CREATE TRIGGER trg_dsp_campaign_metrics_updated_at
BEFORE UPDATE ON public.dsp_campaign_metrics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.upsert_dsp_release_readiness(
  p_release_id UUID,
  p_overall_score NUMERIC,
  p_metadata_score NUMERIC,
  p_artwork_score NUMERIC,
  p_rights_score NUMERIC,
  p_content_score NUMERIC,
  p_status TEXT,
  p_summary TEXT DEFAULT NULL,
  p_platform_coverage TEXT[] DEFAULT '{}'::TEXT[],
  p_last_scored_at TIMESTAMPTZ DEFAULT now()
)
RETURNS public.dsp_release_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dsp_release_readiness;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = p_release_id
      AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied for release %', p_release_id;
  END IF;

  INSERT INTO public.dsp_release_readiness (
    release_id,
    overall_score,
    metadata_score,
    artwork_score,
    rights_score,
    content_score,
    status,
    summary,
    platform_coverage,
    last_scored_at
  )
  VALUES (
    p_release_id,
    p_overall_score,
    p_metadata_score,
    p_artwork_score,
    p_rights_score,
    p_content_score,
    p_status,
    p_summary,
    COALESCE(p_platform_coverage, '{}'::TEXT[]),
    p_last_scored_at
  )
  ON CONFLICT (release_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    metadata_score = EXCLUDED.metadata_score,
    artwork_score = EXCLUDED.artwork_score,
    rights_score = EXCLUDED.rights_score,
    content_score = EXCLUDED.content_score,
    status = EXCLUDED.status,
    summary = EXCLUDED.summary,
    platform_coverage = EXCLUDED.platform_coverage,
    last_scored_at = EXCLUDED.last_scored_at,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_dsp_marketing_task(
  p_release_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT 'dsp',
  p_due_date DATE DEFAULT CURRENT_DATE,
  p_status TEXT DEFAULT 'todo',
  p_priority TEXT DEFAULT 'normal',
  p_assignee TEXT DEFAULT NULL,
  p_completed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.dsp_marketing_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dsp_marketing_tasks;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.releases r
    WHERE r.id = p_release_id
      AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied for release %', p_release_id;
  END IF;

  INSERT INTO public.dsp_marketing_tasks (
    release_id,
    title,
    description,
    channel,
    due_date,
    status,
    priority,
    assignee,
    completed_at
  )
  VALUES (
    p_release_id,
    p_title,
    p_description,
    p_channel,
    p_due_date,
    p_status,
    p_priority,
    p_assignee,
    p_completed_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_release_readiness TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_marketing_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_pre_save_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_pre_save_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dsp_campaign_metrics TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_dsp_release_readiness(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_dsp_marketing_task(UUID, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
