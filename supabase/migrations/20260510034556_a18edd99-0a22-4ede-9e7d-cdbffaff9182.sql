ALTER TABLE public.form_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.songs REPLICA IDENTITY FULL;
ALTER TABLE public.playlist_pitches REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.form_submissions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.playlist_pitches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;