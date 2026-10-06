-- Lead scores table
CREATE TABLE public.lead_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  organization_id UUID,
  target_type TEXT NOT NULL CHECK (target_type IN ('sponsor','opportunity')),
  target_id UUID NOT NULL,
  property_id UUID REFERENCES public.sports_properties(id) ON DELETE SET NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  classification TEXT NOT NULL DEFAULT 'morno' CHECK (classification IN ('quente','morno','frio')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  approach_argument TEXT,
  fit_segment INTEGER,
  fit_audience INTEGER,
  fit_history INTEGER,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_scores_org_score ON public.lead_scores(organization_id, score DESC);
CREATE INDEX idx_lead_scores_target ON public.lead_scores(target_type, target_id, property_id);

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view lead_scores"
ON public.lead_scores FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "CRM users insert lead_scores"
ON public.lead_scores FOR INSERT TO authenticated
WITH CHECK (can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());

CREATE POLICY "CRM users update lead_scores"
ON public.lead_scores FOR UPDATE TO authenticated
USING (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE POLICY "CRM users delete lead_scores"
ON public.lead_scores FOR DELETE TO authenticated
USING (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE TRIGGER trg_lead_scores_org BEFORE INSERT ON public.lead_scores
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();

CREATE TRIGGER trg_lead_scores_updated BEFORE UPDATE ON public.lead_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proposal versions table
CREATE TABLE public.proposal_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  organization_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('concept','deck','whatsapp','email')),
  title TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_versions_proposal ON public.proposal_versions(proposal_id, channel);

ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view proposal_versions"
ON public.proposal_versions FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "CRM users insert proposal_versions"
ON public.proposal_versions FOR INSERT TO authenticated
WITH CHECK (can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());

CREATE POLICY "CRM users update proposal_versions"
ON public.proposal_versions FOR UPDATE TO authenticated
USING (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE POLICY "CRM users delete proposal_versions"
ON public.proposal_versions FOR DELETE TO authenticated
USING (can_access_module(auth.uid(), organization_id, 'crm', true));

CREATE TRIGGER trg_proposal_versions_org BEFORE INSERT ON public.proposal_versions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id();

CREATE TRIGGER trg_proposal_versions_updated BEFORE UPDATE ON public.proposal_versions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();