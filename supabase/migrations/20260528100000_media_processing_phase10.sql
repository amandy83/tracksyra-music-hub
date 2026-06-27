-- Phase 10: media processing, private storage, variants, fingerprints, waveform data, and immutable audit logs.

CREATE TYPE public.media_asset_type AS ENUM ('audio','artwork');
CREATE TYPE public.media_asset_status AS ENUM ('uploaded','validating','processing','ready','rejected','duplicate','failed');
CREATE TYPE public.media_variant_type AS ENUM ('master_archive','mp3_320','mp3_128','aac_preview','preview_clip','waveform_json','artwork_thumbnail','artwork_webp','artwork_retina');
CREATE TYPE public.media_processing_job_type AS ENUM ('AUDIO_PROCESSING','ARTWORK_PROCESSING','WAVEFORM_GENERATION','FINGERPRINT_ANALYSIS');
CREATE TYPE public.media_processing_status AS ENUM ('queued','processing','completed','failed','rejected');

INSERT INTO storage.buckets (id, name, public)
VALUES ('media-private', 'media-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  release_id UUID REFERENCES public.releases(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  asset_type public.media_asset_type NOT NULL,
  status public.media_asset_status NOT NULL DEFAULT 'uploaded',
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  original_file_size_bytes BIGINT NOT NULL CHECK (original_file_size_bytes > 0),
  source_storage_provider TEXT NOT NULL DEFAULT 'supabase',
  source_bucket TEXT NOT NULL,
  source_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (position('..' in source_key) = 0),
  CHECK (source_bucket <> 'covers' OR asset_type = 'artwork')
);

CREATE TABLE IF NOT EXISTS public.media_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  variant_type public.media_variant_type NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'supabase',
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  bitrate_kbps INTEGER,
  width INTEGER,
  height INTEGER,
  duration_sec NUMERIC,
  status public.media_asset_status NOT NULL DEFAULT 'ready',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, variant_type),
  CHECK (position('..' in storage_key) = 0)
);

CREATE TABLE IF NOT EXISTS public.waveform_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL UNIQUE REFERENCES public.media_assets(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  waveform_hash TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  point_count INTEGER NOT NULL CHECK (point_count > 0),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audio_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL UNIQUE REFERENCES public.media_assets(id) ON DELETE CASCADE,
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  fingerprint_hash TEXT NOT NULL,
  waveform_hash TEXT NOT NULL,
  similarity_score NUMERIC NOT NULL DEFAULT 0 CHECK (similarity_score >= 0 AND similarity_score <= 1),
  duplicate_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  duplicate_track_id UUID REFERENCES public.tracks(id) ON DELETE SET NULL,
  duplicate_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fingerprint_hash)
);

CREATE TABLE IF NOT EXISTS public.media_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  job_type public.media_processing_job_type NOT NULL,
  status public.media_processing_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, job_type)
);

CREATE TABLE IF NOT EXISTS public.media_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_user_status ON public.media_assets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_media_assets_release ON public.media_assets(release_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_track ON public.media_assets(track_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_audio_track ON public.media_assets(track_id) WHERE asset_type = 'audio';
CREATE INDEX IF NOT EXISTS idx_media_variants_asset ON public.media_variants(asset_id);
CREATE INDEX IF NOT EXISTS idx_audio_fingerprints_waveform ON public.audio_fingerprints(waveform_hash);
CREATE INDEX IF NOT EXISTS idx_media_jobs_status ON public.media_processing_jobs(status, queued_at);
CREATE INDEX IF NOT EXISTS idx_media_audit_asset ON public.media_audit_logs(asset_id, created_at DESC);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waveform_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner select media assets" ON public.media_assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner insert media assets" ON public.media_assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update uploaded media assets" ON public.media_assets FOR UPDATE USING (auth.uid() = user_id AND status IN ('uploaded','rejected','failed')) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin all media assets" ON public.media_assets FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "owner select media variants" ON public.media_variants FOR SELECT USING (EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()));
CREATE POLICY "admin all media variants" ON public.media_variants FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "owner select waveform" ON public.waveform_data FOR SELECT USING (EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()));
CREATE POLICY "admin all waveform" ON public.waveform_data FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "owner select fingerprints" ON public.audio_fingerprints FOR SELECT USING (EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()));
CREATE POLICY "admin all fingerprints" ON public.audio_fingerprints FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "owner select media jobs" ON public.media_processing_jobs FOR SELECT USING (EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()));
CREATE POLICY "owner insert media jobs" ON public.media_processing_jobs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = asset_id AND a.user_id = auth.uid()));
CREATE POLICY "admin all media jobs" ON public.media_processing_jobs FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "owner select media audit" ON public.media_audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin select media audit" ON public.media_audit_logs FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE POLICY "media private owner read" ON storage.objects FOR SELECT USING (bucket_id = 'media-private' AND auth.uid()::text = (storage.foldername(name))[2]);
CREATE POLICY "media private owner upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media-private' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE OR REPLACE FUNCTION public.prevent_media_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'media_audit_logs are immutable';
END $$;

DROP TRIGGER IF EXISTS trg_media_audit_no_update ON public.media_audit_logs;
CREATE TRIGGER trg_media_audit_no_update BEFORE UPDATE OR DELETE ON public.media_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_media_audit_mutation();

CREATE OR REPLACE FUNCTION public.audit_media_asset_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.media_audit_logs(asset_id, user_id, action, payload)
  VALUES (
    NEW.id,
    NEW.user_id,
    'MEDIA_ASSET_' || upper(TG_OP),
    jsonb_build_object('status', NEW.status, 'asset_type', NEW.asset_type, 'track_id', NEW.track_id, 'release_id', NEW.release_id)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_media_asset_audit ON public.media_assets;
CREATE TRIGGER trg_media_asset_audit AFTER INSERT OR UPDATE ON public.media_assets
FOR EACH ROW EXECUTE FUNCTION public.audit_media_asset_change();

CREATE TRIGGER trg_media_assets_updated BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_media_jobs_updated BEFORE UPDATE ON public.media_processing_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.media_assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_processing_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waveform_data;
