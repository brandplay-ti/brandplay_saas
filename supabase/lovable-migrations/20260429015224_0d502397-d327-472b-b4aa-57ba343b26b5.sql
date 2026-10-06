ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS lost_competitor TEXT,
ADD COLUMN IF NOT EXISTS lost_value NUMERIC;