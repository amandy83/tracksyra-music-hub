-- Lock canvas bucket: make private and add per-user folder policies
UPDATE storage.buckets SET public = false WHERE id = 'canvas';

DROP POLICY IF EXISTS "canvas read own" ON storage.objects;
DROP POLICY IF EXISTS "canvas insert own" ON storage.objects;
DROP POLICY IF EXISTS "canvas update own" ON storage.objects;
DROP POLICY IF EXISTS "canvas delete own" ON storage.objects;
DROP POLICY IF EXISTS "canvas admins read all" ON storage.objects;

CREATE POLICY "canvas read own" ON storage.objects FOR SELECT
USING (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "canvas insert own" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "canvas update own" ON storage.objects FOR UPDATE
USING (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "canvas delete own" ON storage.objects FOR DELETE
USING (bucket_id = 'canvas' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "canvas admins read all" ON storage.objects FOR SELECT
USING (bucket_id = 'canvas' AND has_role(auth.uid(), 'admin'::app_role));