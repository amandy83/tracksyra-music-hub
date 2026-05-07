
-- Add canvas video column to songs
ALTER TABLE public.songs ADD COLUMN IF NOT EXISTS canvas_video_url text;

-- Playlist pitches
CREATE TABLE public.playlist_pitches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  target_playlist text NOT NULL,
  platform text NOT NULL DEFAULT 'Spotify',
  genre text,
  mood text,
  target_audience text,
  pitch_story text NOT NULL,
  similar_artists text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.playlist_pitches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own pitches" ON public.playlist_pitches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own pitches" ON public.playlist_pitches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own pitches" ON public.playlist_pitches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own pitches" ON public.playlist_pitches FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_pitches_updated BEFORE UPDATE ON public.playlist_pitches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ad campaigns
CREATE TABLE public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'Spotify',
  campaign_name text NOT NULL,
  budget_inr numeric NOT NULL,
  target_countries text,
  target_age text,
  target_genre text,
  start_date date,
  end_date date,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own ads" ON public.ad_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own ads" ON public.ad_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own ads" ON public.ad_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own ads" ON public.ad_campaigns FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_ads_updated BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Song analytics
CREATE TABLE public.song_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  platform text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  streams integer NOT NULL DEFAULT 0,
  listeners integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_song ON public.song_analytics(song_id);
ALTER TABLE public.song_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own analytics" ON public.song_analytics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own analytics" ON public.song_analytics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own analytics" ON public.song_analytics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own analytics" ON public.song_analytics FOR DELETE USING (auth.uid() = user_id);

-- Royalties
CREATE TABLE public.royalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  platform text NOT NULL,
  period text NOT NULL,
  streams integer NOT NULL DEFAULT 0,
  revenue_inr numeric NOT NULL DEFAULT 0,
  payout_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_royalties_song ON public.royalties(song_id);
ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own royalties" ON public.royalties FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own royalties" ON public.royalties FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own royalties" ON public.royalties FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "delete own royalties" ON public.royalties FOR DELETE USING (auth.uid() = user_id);

-- Canvas videos bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('canvas', 'canvas', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "canvas public read" ON storage.objects FOR SELECT USING (bucket_id = 'canvas');
CREATE POLICY "canvas owner upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "canvas owner update" ON storage.objects FOR UPDATE USING (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "canvas owner delete" ON storage.objects FOR DELETE USING (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);
