-- Phase 8.1: DSP Marketing Foundation.

CREATE TABLE IF NOT EXISTS public.dsp_release_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  metadata_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (metadata_score BETWEEN 0 AND 100),
  artwork_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (artwork_score BETWEEN 0 AND 100),
  rights_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (rights_score BETWEEN 0 AND 100),
  content_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (content_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'ready', 'blocked')),
  summary TEXT,
  platform_coverage TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  last_scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id)
);

CREATE TABLE IF NOT EXISTS public.dsp_marketing_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  channel TEXT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assignee TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
