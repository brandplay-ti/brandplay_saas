ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclusivity_terms text[] NOT NULL DEFAULT '{}'::text[];