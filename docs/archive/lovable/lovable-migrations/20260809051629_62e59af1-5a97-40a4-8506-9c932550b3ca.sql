CREATE TABLE public.contract_clause_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  content text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_clause_templates TO authenticated;
GRANT ALL ON public.contract_clause_templates TO service_role;

ALTER TABLE public.contract_clause_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read clause templates"
ON public.contract_clause_templates FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members insert clause templates"
ON public.contract_clause_templates FOR INSERT TO authenticated
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members update clause templates"
ON public.contract_clause_templates FOR UPDATE TO authenticated
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members delete clause templates"
ON public.contract_clause_templates FOR DELETE TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE TRIGGER update_contract_clause_templates_updated_at
BEFORE UPDATE ON public.contract_clause_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();