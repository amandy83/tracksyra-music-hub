-- Phase 8.2: Pre-Save Builder.

CREATE TABLE IF NOT EXISTS public.dsp_pre_save_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  smart_link_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
  launch_date DATE,
  destination_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (smart_link_slug)
);

CREATE TABLE IF NOT EXISTS public.dsp_pre_save_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.dsp_pre_save_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('click', 'save')),
  referrer TEXT,
  visitor_id TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
