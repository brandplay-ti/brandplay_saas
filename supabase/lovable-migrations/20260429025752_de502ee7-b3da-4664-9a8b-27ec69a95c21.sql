-- Make user-scoped settings tenant-aware at the database key level.
ALTER TABLE public.user_dashboard_preferences
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.user_stage_probabilities
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.user_dashboard_preferences
  DROP CONSTRAINT IF EXISTS user_dashboard_preferences_pkey;

ALTER TABLE public.user_dashboard_preferences
  ADD CONSTRAINT user_dashboard_preferences_pkey PRIMARY KEY (user_id, organization_id);

ALTER TABLE public.user_stage_probabilities
  DROP CONSTRAINT IF EXISTS user_stage_probabilities_pkey;

ALTER TABLE public.user_stage_probabilities
  ADD CONSTRAINT user_stage_probabilities_pkey PRIMARY KEY (user_id, organization_id, stage);
