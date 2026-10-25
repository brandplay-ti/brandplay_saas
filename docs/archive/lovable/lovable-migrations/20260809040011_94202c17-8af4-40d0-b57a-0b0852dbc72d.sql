ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS use_flat_value boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flat_value numeric NOT NULL DEFAULT 0;