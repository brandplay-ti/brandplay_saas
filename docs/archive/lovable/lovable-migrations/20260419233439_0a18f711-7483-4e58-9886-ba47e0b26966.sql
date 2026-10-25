CREATE TABLE public.user_dashboard_preferences (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dashboard prefs"
  ON public.user_dashboard_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dashboard prefs"
  ON public.user_dashboard_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dashboard prefs"
  ON public.user_dashboard_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own dashboard prefs"
  ON public.user_dashboard_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_dashboard_preferences_updated_at
  BEFORE UPDATE ON public.user_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();