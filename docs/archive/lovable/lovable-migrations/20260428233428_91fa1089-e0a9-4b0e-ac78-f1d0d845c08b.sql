ALTER TABLE public.brandtrack_media
  DROP CONSTRAINT IF EXISTS brandtrack_media_media_type_check;

ALTER TABLE public.brandtrack_media
  ADD CONSTRAINT brandtrack_media_media_type_check
  CHECK (media_type IN ('image','video','instagram'));

ALTER TABLE public.brandtrack_media
  ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE public.brandtrack_media
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS source_platform text;

CREATE INDEX IF NOT EXISTS idx_brandtrack_media_source_platform
ON public.brandtrack_media(source_platform);