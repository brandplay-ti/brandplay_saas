CREATE TABLE public.sponsor_crm_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  segment TEXT,
  score sponsor_score NOT NULL DEFAULT 'morno'::sponsor_score,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  last_contact_at DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_proposal_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  proposal_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferred_contact_name TEXT,
  preferred_contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_contract_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  legal_name TEXT,
  tax_id TEXT,
  billing_contact TEXT,
  contract_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_delivery_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  approval_contact TEXT,
  evidence_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_finance_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  billing_email TEXT,
  payment_terms TEXT,
  invoice_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_portal_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  portal_display_name TEXT,
  portal_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

CREATE TABLE public.sponsor_brandtrack_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sponsor_id UUID NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  detection_aliases TEXT[] NOT NULL DEFAULT '{}'::text[],
  brand_colors TEXT[] NOT NULL DEFAULT '{}'::text[],
  tracking_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sponsor_id)
);

ALTER TABLE public.sponsor_crm_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_proposal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_contract_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_delivery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_finance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_portal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_brandtrack_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX sponsor_crm_profiles_org_idx ON public.sponsor_crm_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_proposal_profiles_org_idx ON public.sponsor_proposal_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_contract_profiles_org_idx ON public.sponsor_contract_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_delivery_profiles_org_idx ON public.sponsor_delivery_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_finance_profiles_org_idx ON public.sponsor_finance_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_portal_profiles_org_idx ON public.sponsor_portal_profiles (organization_id, sponsor_id);
CREATE INDEX sponsor_brandtrack_profiles_org_idx ON public.sponsor_brandtrack_profiles (organization_id, sponsor_id);

CREATE POLICY "Org members view sponsor CRM profiles" ON public.sponsor_crm_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users create sponsor CRM profiles" ON public.sponsor_crm_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users update sponsor CRM profiles" ON public.sponsor_crm_profiles FOR UPDATE TO authenticated USING (public.can_access_module(auth.uid(), organization_id, 'crm', true)) WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Admins delete sponsor CRM profiles" ON public.sponsor_crm_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor proposal profiles" ON public.sponsor_proposal_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users create sponsor proposal profiles" ON public.sponsor_proposal_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users update sponsor proposal profiles" ON public.sponsor_proposal_profiles FOR UPDATE TO authenticated USING (public.can_access_module(auth.uid(), organization_id, 'crm', true)) WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Admins delete sponsor proposal profiles" ON public.sponsor_proposal_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor contract profiles" ON public.sponsor_contract_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM finance users create sponsor contract profiles" ON public.sponsor_contract_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)));
CREATE POLICY "CRM finance users update sponsor contract profiles" ON public.sponsor_contract_profiles FOR UPDATE TO authenticated USING (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true)) WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true));
CREATE POLICY "Admins delete sponsor contract profiles" ON public.sponsor_contract_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor delivery profiles" ON public.sponsor_delivery_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Ops CRM users create sponsor delivery profiles" ON public.sponsor_delivery_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));
CREATE POLICY "Ops CRM users update sponsor delivery profiles" ON public.sponsor_delivery_profiles FOR UPDATE TO authenticated USING (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)) WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Admins delete sponsor delivery profiles" ON public.sponsor_delivery_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor finance profiles" ON public.sponsor_finance_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Finance users create sponsor finance profiles" ON public.sponsor_finance_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.can_access_module(auth.uid(), organization_id, 'financeiro', true));
CREATE POLICY "Finance users update sponsor finance profiles" ON public.sponsor_finance_profiles FOR UPDATE TO authenticated USING (public.can_access_module(auth.uid(), organization_id, 'financeiro', true)) WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'financeiro', true));
CREATE POLICY "Admins delete sponsor finance profiles" ON public.sponsor_finance_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor portal profiles" ON public.sponsor_portal_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Admins create sponsor portal profiles" ON public.sponsor_portal_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
CREATE POLICY "Admins update sponsor portal profiles" ON public.sponsor_portal_profiles FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));
CREATE POLICY "Admins delete sponsor portal profiles" ON public.sponsor_portal_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE POLICY "Org members view sponsor BrandTrack profiles" ON public.sponsor_brandtrack_profiles FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "BrandTrack users create sponsor BrandTrack profiles" ON public.sponsor_brandtrack_profiles FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'comercial'::org_role, 'operacional'::org_role])));
CREATE POLICY "BrandTrack users update sponsor BrandTrack profiles" ON public.sponsor_brandtrack_profiles FOR UPDATE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'comercial'::org_role, 'operacional'::org_role])) WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role, 'comercial'::org_role, 'operacional'::org_role]));
CREATE POLICY "Admins delete sponsor BrandTrack profiles" ON public.sponsor_brandtrack_profiles FOR DELETE TO authenticated USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner'::org_role, 'admin'::org_role]));

CREATE TRIGGER update_sponsor_crm_profiles_updated_at BEFORE UPDATE ON public.sponsor_crm_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_proposal_profiles_updated_at BEFORE UPDATE ON public.sponsor_proposal_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_contract_profiles_updated_at BEFORE UPDATE ON public.sponsor_contract_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_delivery_profiles_updated_at BEFORE UPDATE ON public.sponsor_delivery_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_finance_profiles_updated_at BEFORE UPDATE ON public.sponsor_finance_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_portal_profiles_updated_at BEFORE UPDATE ON public.sponsor_portal_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsor_brandtrack_profiles_updated_at BEFORE UPDATE ON public.sponsor_brandtrack_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sponsor_crm_profiles (sponsor_id, organization_id, owner_id, segment, score, tags, last_contact_at, notes)
SELECT id, organization_id, owner_id, segment, score, tags, last_contact_at, notes
FROM public.sponsors
WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_proposal_profiles (sponsor_id, organization_id, owner_id)
SELECT id, organization_id, owner_id FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_contract_profiles (sponsor_id, organization_id, owner_id)
SELECT id, organization_id, owner_id FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_delivery_profiles (sponsor_id, organization_id, owner_id)
SELECT id, organization_id, owner_id FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_finance_profiles (sponsor_id, organization_id, owner_id)
SELECT id, organization_id, owner_id FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_portal_profiles (sponsor_id, organization_id, owner_id, portal_display_name)
SELECT id, organization_id, owner_id, name FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;

INSERT INTO public.sponsor_brandtrack_profiles (sponsor_id, organization_id, owner_id, detection_aliases)
SELECT id, organization_id, owner_id, ARRAY[name] FROM public.sponsors WHERE organization_id IS NOT NULL
ON CONFLICT (sponsor_id) DO NOTHING;