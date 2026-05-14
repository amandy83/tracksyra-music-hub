
-- Enums
CREATE TYPE public.release_status AS ENUM ('draft','uploaded','under_review','approved','sent_to_stores','processing','live','rejected');
CREATE TYPE public.delivery_status AS ENUM ('pending','processing','delivered','live','rejected');
CREATE TYPE public.dsp_platform AS ENUM ('spotify','apple_music','youtube_music','amazon_music','jiosaavn','gaana','wynk','deezer','tidal','pandora','instagram_facebook','tiktok');

-- Releases
CREATE TABLE public.releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  primary_artist TEXT NOT NULL,
  release_type TEXT NOT NULL DEFAULT 'single',
  release_date DATE,
  genre TEXT,
  language TEXT,
  upc TEXT UNIQUE,
  copyright_owner TEXT,
  copyright_declared BOOLEAN NOT NULL DEFAULT false,
  ai_content_declared BOOLEAN NOT NULL DEFAULT false,
  rights_owned BOOLEAN NOT NULL DEFAULT false,
  status public.release_status NOT NULL DEFAULT 'uploaded',
  rejection_reason TEXT,
  admin_notes TEXT,
  cover_art_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_releases_user ON public.releases(user_id);
CREATE INDEX idx_releases_status ON public.releases(status);
ALTER TABLE public.releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select releases" ON public.releases FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "owner insert releases" ON public.releases FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "owner update releases" ON public.releases FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "owner delete releases" ON public.releases FOR DELETE USING (auth.uid()=user_id);
CREATE POLICY "admin select releases" ON public.releases FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admin update releases" ON public.releases FOR UPDATE USING (has_role(auth.uid(),'admin'));

-- Tracks (one per audio file in a release)
CREATE TABLE public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  primary_artist TEXT NOT NULL,
  featured_artists TEXT,
  composer TEXT,
  lyrics TEXT,
  isrc TEXT UNIQUE,
  explicit BOOLEAN NOT NULL DEFAULT false,
  audio_url TEXT,
  audio_hash TEXT UNIQUE,
  bitrate_kbps INTEGER,
  sample_rate_hz INTEGER,
  channels INTEGER,
  duration_sec NUMERIC,
  file_size_bytes BIGINT,
  audio_format TEXT,
  track_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracks_release ON public.tracks(release_id);
CREATE INDEX idx_tracks_user ON public.tracks(user_id);
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select tracks" ON public.tracks FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "owner insert tracks" ON public.tracks FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "owner update tracks" ON public.tracks FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "owner delete tracks" ON public.tracks FOR DELETE USING (auth.uid()=user_id);
CREATE POLICY "admin select tracks" ON public.tracks FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admin update tracks" ON public.tracks FOR UPDATE USING (has_role(auth.uid(),'admin'));

-- Distribution timeline (audit trail)
CREATE TABLE public.distribution_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stage public.release_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_release ON public.distribution_timeline(release_id);
ALTER TABLE public.distribution_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select timeline" ON public.distribution_timeline FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "admin select timeline" ON public.distribution_timeline FOR SELECT USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admin insert timeline" ON public.distribution_timeline FOR INSERT WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "system insert timeline" ON public.distribution_timeline FOR INSERT WITH CHECK (auth.uid()=user_id);

-- Platform deliveries
CREATE TABLE public.platform_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  platform public.dsp_platform NOT NULL,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  live_url TEXT,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(release_id, platform)
);
CREATE INDEX idx_deliveries_release ON public.platform_deliveries(release_id);
CREATE INDEX idx_deliveries_user ON public.platform_deliveries(user_id);
ALTER TABLE public.platform_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select deliveries" ON public.platform_deliveries FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "admin all deliveries" ON public.platform_deliveries FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "system insert deliveries" ON public.platform_deliveries FOR INSERT WITH CHECK (auth.uid()=user_id);

-- Upload logs
CREATE TABLE public.upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  release_id UUID REFERENCES public.releases(id) ON DELETE SET NULL,
  file_name TEXT,
  file_size_bytes BIGINT,
  file_type TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploadlogs_user ON public.upload_logs(user_id);
ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select uploadlogs" ON public.upload_logs FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY "owner insert uploadlogs" ON public.upload_logs FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "admin select uploadlogs" ON public.upload_logs FOR SELECT USING (has_role(auth.uid(),'admin'));

-- updated_at triggers
CREATE TRIGGER trg_releases_updated BEFORE UPDATE ON public.releases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tracks_updated BEFORE UPDATE ON public.tracks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.platform_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create timeline entry + email on release status change
CREATE OR REPLACE FUNCTION public.handle_release_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_email TEXT; v_name TEXT; v_subject TEXT; v_template TEXT;
BEGIN
  IF (TG_OP='INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.distribution_timeline (release_id, user_id, stage, note)
    VALUES (NEW.id, NEW.user_id, NEW.status, NEW.admin_notes);

    SELECT u.email, COALESCE(p.full_name, p.artist_name, 'Artist')
      INTO v_email, v_name FROM auth.users u
      LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=NEW.user_id;

    IF v_email IS NOT NULL THEN
      IF NEW.status='uploaded' AND TG_OP='INSERT' THEN
        v_subject := 'Upload received: ' || NEW.title; v_template := 'upload_success';
      ELSIF NEW.status='approved' THEN
        v_subject := 'Release approved: ' || NEW.title; v_template := 'release_approved';
      ELSIF NEW.status='sent_to_stores' THEN
        v_subject := 'Distribution started for ' || NEW.title; v_template := 'distribution_started';
      ELSIF NEW.status='live' THEN
        v_subject := 'Your release is LIVE: ' || NEW.title; v_template := 'release_live';
      ELSIF NEW.status='rejected' THEN
        v_subject := 'Release needs changes: ' || NEW.title; v_template := 'release_rejected';
      ELSE v_template := NULL;
      END IF;

      IF v_template IS NOT NULL THEN
        PERFORM public.queue_email(v_email, v_name, v_subject, v_template,
          jsonb_build_object('name',v_name,'title',NEW.title,'artist',NEW.primary_artist,'reason',NEW.rejection_reason),
          'releases', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_release_status AFTER INSERT OR UPDATE ON public.releases
FOR EACH ROW EXECUTE FUNCTION public.handle_release_status_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.releases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_deliveries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.distribution_timeline;
