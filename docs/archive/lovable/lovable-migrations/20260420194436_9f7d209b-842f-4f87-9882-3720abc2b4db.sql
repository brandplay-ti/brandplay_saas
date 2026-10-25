-- Notifications system
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'media',
  title text NOT NULL,
  description text,
  action_url text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  email_sent_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Notification preferences (per user)
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  email_enabled boolean NOT NULL DEFAULT true,
  inapp_enabled boolean NOT NULL DEFAULT true,
  categories jsonb NOT NULL DEFAULT '{
    "installment_due":true,
    "installment_overdue":true,
    "delivery_late":true,
    "proposal_expiring":true,
    "opportunity_stale":true,
    "churn_risk":true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Market benchmark cache (AI-generated estimates)
CREATE TABLE IF NOT EXISTS public.market_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  segment text NOT NULL,
  market_avg_ticket numeric NOT NULL DEFAULT 0,
  market_min numeric,
  market_max numeric,
  notes text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, segment)
);

ALTER TABLE public.market_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read benchmarks" ON public.market_benchmarks
  FOR SELECT USING (is_org_member(auth.uid(), organization_id));
CREATE POLICY "Org members write benchmarks" ON public.market_benchmarks
  FOR ALL USING (is_org_member(auth.uid(), organization_id))
  WITH CHECK (is_org_member(auth.uid(), organization_id));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;