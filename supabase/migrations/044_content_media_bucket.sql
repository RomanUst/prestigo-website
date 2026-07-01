-- Migration 044: content-media storage bucket
-- Public bucket that hosts branded Reel videos (and other content media) so
-- Buffer can fetch them by URL. Uploaded server-side by
-- /api/content/upload-media using the service-role key.
-- Public buckets are world-readable via
--   https://<project>.supabase.co/storage/v1/object/public/content-media/<path>

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-media',
  'content-media',
  true,
  104857600, -- 100 MB
  ARRAY['video/mp4', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
