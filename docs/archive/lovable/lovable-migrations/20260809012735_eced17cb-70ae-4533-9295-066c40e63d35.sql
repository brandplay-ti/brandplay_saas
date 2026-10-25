ALTER TABLE public.sports_properties
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS social_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locations text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS final_location text,
  ADD COLUMN IF NOT EXISTS fans_count numeric,
  ADD COLUMN IF NOT EXISTS prize_pool numeric,
  ADD COLUMN IF NOT EXISTS participants_count numeric,
  ADD COLUMN IF NOT EXISTS teams_count numeric,
  ADD COLUMN IF NOT EXISTS key_notes text;