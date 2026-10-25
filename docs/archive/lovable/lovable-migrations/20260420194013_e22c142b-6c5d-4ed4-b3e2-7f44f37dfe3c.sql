
CREATE TABLE IF NOT EXISTS public.sponsor_executive_summaries (
  sponsor_id uuid PRIMARY KEY REFERENCES public.sponsors(id) ON DELETE CASCADE,
  summary text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL,
  organization_id uuid
);
ALTER TABLE public.sponsor_executive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read summaries" ON public.sponsor_executive_summaries FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "owners write summaries" ON public.sponsor_executive_summaries FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.contract_churn_risk (
  contract_id uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  risk_level text NOT NULL CHECK (risk_level IN ('baixo','medio','alto','critico')),
  risk_score integer NOT NULL DEFAULT 0,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation text,
  model text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  owner_id uuid NOT NULL,
  organization_id uuid
);
ALTER TABLE public.contract_churn_risk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read churn" ON public.contract_churn_risk FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "owners write churn" ON public.contract_churn_risk FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.sellout_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.sports_properties(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.property_events(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  owner_id uuid NOT NULL,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sellout_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read sellout" ON public.sellout_reports FOR SELECT
  USING (auth.uid() = owner_id OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id)));
CREATE POLICY "owners write sellout" ON public.sellout_reports FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER set_org_sellout BEFORE INSERT ON public.sellout_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
CREATE TRIGGER set_org_summary BEFORE INSERT ON public.sponsor_executive_summaries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
CREATE TRIGGER set_org_churn BEFORE INSERT ON public.contract_churn_risk
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();
