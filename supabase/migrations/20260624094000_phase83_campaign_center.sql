-- Phase 8.3: Campaign Center.

CREATE TABLE IF NOT EXISTS public.dsp_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('spotify', 'youtube', 'tiktok', 'instagram')),
  budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dsp_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.dsp_campaigns(id) ON DELETE CASCADE,
  total_reach INTEGER NOT NULL DEFAULT 0 CHECK (total_reach >= 0),
  total_engagement INTEGER NOT NULL DEFAULT 0 CHECK (total_engagement >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id)
);
