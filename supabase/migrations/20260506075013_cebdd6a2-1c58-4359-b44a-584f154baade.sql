-- Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Replace broad public SELECT on avatars/covers with object-level reads (no listing)
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "Covers public read" ON storage.objects;
CREATE POLICY "Avatars public object read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] IS NOT NULL);
CREATE POLICY "Covers public object read" ON storage.objects FOR SELECT USING (bucket_id = 'covers' AND (storage.foldername(name))[1] IS NOT NULL);