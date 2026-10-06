
-- ============ ORGANIZATIONS / TEAMS ============
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'comercial', 'operacional', 'financeiro');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'comercial',
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'comercial',
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pendente',
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS (security definer) ============
CREATE OR REPLACE FUNCTION public.get_user_org(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
   WHERE user_id = _user_id AND status = 'ativo'
   ORDER BY created_at ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
      AND status = 'ativo' AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND status = 'ativo'
  )
$$;

-- can the user with this role read/write a module?
CREATE OR REPLACE FUNCTION public.can_access_module(_user_id uuid, _org_id uuid, _module text, _write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = _user_id AND om.organization_id = _org_id AND om.status = 'ativo'
      AND (
        om.role IN ('owner','admin')
        OR (_module = 'crm' AND om.role = 'comercial')
        OR (_module = 'operacional' AND om.role = 'operacional')
        OR (_module = 'financeiro' AND om.role = 'financeiro')
        OR (NOT _write AND om.role IN ('comercial','operacional','financeiro'))
      )
  )
$$;

-- ============ DATA MIGRATION: existing owners become orgs ============
INSERT INTO public.organizations (id, name, owner_id, created_at)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(p.company,''), NULLIF(p.full_name,''), 'Minha empresa'),
  p.id,
  COALESCE(p.created_at, now())
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations o WHERE o.owner_id = p.id
);

INSERT INTO public.organization_members (organization_id, user_id, role, status)
SELECT o.id, o.owner_id, 'owner'::org_role, 'ativo'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = o.id AND m.user_id = o.owner_id
);

-- ============ ADD organization_id TO MAIN TABLES ============
ALTER TABLE public.sponsors          ADD COLUMN organization_id uuid;
ALTER TABLE public.sports_properties ADD COLUMN organization_id uuid;
ALTER TABLE public.assets            ADD COLUMN organization_id uuid;
ALTER TABLE public.opportunities     ADD COLUMN organization_id uuid;
ALTER TABLE public.proposals         ADD COLUMN organization_id uuid;
ALTER TABLE public.contracts         ADD COLUMN organization_id uuid;
ALTER TABLE public.deliveries        ADD COLUMN organization_id uuid;
ALTER TABLE public.installments      ADD COLUMN organization_id uuid;
ALTER TABLE public.sponsorship_tiers ADD COLUMN organization_id uuid;

-- backfill from owner_id -> org
UPDATE public.sponsors          s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.sports_properties s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.assets            s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.opportunities     s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.proposals         s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.contracts         s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.deliveries        s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.installments      s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;
UPDATE public.sponsorship_tiers s SET organization_id = o.id FROM public.organizations o WHERE o.owner_id = s.owner_id;

-- index
CREATE INDEX IF NOT EXISTS idx_sponsors_org ON public.sponsors(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_org ON public.sports_properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_assets_org ON public.assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_opps_org ON public.opportunities(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposals_org ON public.proposals(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_org ON public.deliveries(organization_id);
CREATE INDEX IF NOT EXISTS idx_installments_org ON public.installments(organization_id);
CREATE INDEX IF NOT EXISTS idx_tiers_org ON public.sponsorship_tiers(organization_id);

-- triggers to auto-set organization_id on insert (from owner_id)
CREATE OR REPLACE FUNCTION public.tg_set_organization_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    NEW.organization_id := public.get_user_org(NEW.owner_id);
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sponsors','sports_properties','assets','opportunities','proposals','contracts','deliveries','installments','sponsorship_tiers']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_org_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_set_organization_id()', t);
  END LOOP;
END $$;

-- ============ NEW RLS POLICIES (org-scoped + role-scoped) ============
-- Drop old owner-based policies and replace with org + role rules.

-- ORGANIZATIONS
CREATE POLICY "Members view their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Owner/Admin update organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(auth.uid(), id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "Authenticated insert own organization" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

-- ORGANIZATION MEMBERS
CREATE POLICY "Members view org members" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Owner/Admin manage members" ON public.organization_members
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- ORGANIZATION INVITES
CREATE POLICY "Owner/Admin manage invites" ON public.organization_invites
  FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY "Public can read invite by token" ON public.organization_invites
  FOR SELECT TO anon, authenticated USING (true);

-- SPONSORS (CRM module)
DROP POLICY IF EXISTS "Owners or admins view sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Owners or admins update sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Owners or admins delete sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Users create own sponsors" ON public.sponsors;
CREATE POLICY "Org members view sponsors" ON public.sponsors FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users insert sponsors" ON public.sponsors FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());
CREATE POLICY "CRM users update sponsors" ON public.sponsors FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete sponsors" ON public.sponsors FOR DELETE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));

-- OPPORTUNITIES (CRM)
DROP POLICY IF EXISTS "Owners or admins view opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Owners or admins update opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Owners or admins delete opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users create own opportunities" ON public.opportunities;
CREATE POLICY "Org members view opportunities" ON public.opportunities FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users insert opportunities" ON public.opportunities FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());
CREATE POLICY "CRM users update opportunities" ON public.opportunities FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete opportunities" ON public.opportunities FOR DELETE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));

-- PROPOSALS (CRM)
DROP POLICY IF EXISTS "Owners or admins view proposals" ON public.proposals;
DROP POLICY IF EXISTS "Owners or admins update proposals" ON public.proposals;
DROP POLICY IF EXISTS "Owners or admins delete proposals" ON public.proposals;
DROP POLICY IF EXISTS "Users create own proposals" ON public.proposals;
CREATE POLICY "Org members view proposals" ON public.proposals FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users insert proposals" ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());
CREATE POLICY "CRM users update proposals" ON public.proposals FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete proposals" ON public.proposals FOR DELETE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));

-- CONTRACTS (financeiro write; CRM also can edit)
DROP POLICY IF EXISTS "Owners or admins view contracts" ON public.contracts;
DROP POLICY IF EXISTS "Owners or admins update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Owners or admins delete contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users create own contracts" ON public.contracts;
CREATE POLICY "Org members view contracts" ON public.contracts FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Privileged users insert contracts" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_module(auth.uid(), organization_id, 'crm', true)
            OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true))
            AND owner_id = auth.uid());
CREATE POLICY "Privileged users update contracts" ON public.contracts FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true)
      OR public.can_access_module(auth.uid(), organization_id, 'financeiro', true));
CREATE POLICY "Privileged users delete contracts" ON public.contracts FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- INSTALLMENTS (financeiro)
DROP POLICY IF EXISTS "Owners or admins view installments" ON public.installments;
DROP POLICY IF EXISTS "Owners or admins update installments" ON public.installments;
DROP POLICY IF EXISTS "Owners or admins delete installments" ON public.installments;
DROP POLICY IF EXISTS "Users create own installments" ON public.installments;
CREATE POLICY "Org members view installments" ON public.installments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Finance users insert installments" ON public.installments FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'financeiro', true) AND owner_id = auth.uid());
CREATE POLICY "Finance users update installments" ON public.installments FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'financeiro', true));
CREATE POLICY "Finance users delete installments" ON public.installments FOR DELETE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'financeiro', true));

-- DELIVERIES (operacional)
DROP POLICY IF EXISTS "Owners or admins view deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Owners or admins update deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Owners or admins delete deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Users create own deliveries" ON public.deliveries;
CREATE POLICY "Org members view deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Ops users insert deliveries" ON public.deliveries FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_module(auth.uid(), organization_id, 'operacional', true)
            OR public.can_access_module(auth.uid(), organization_id, 'crm', true))
            AND owner_id = auth.uid());
CREATE POLICY "Ops users update deliveries" ON public.deliveries FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'operacional', true)
      OR public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Ops users delete deliveries" ON public.deliveries FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- ASSETS (operacional + CRM)
DROP POLICY IF EXISTS "Owners or admins view assets" ON public.assets;
DROP POLICY IF EXISTS "Owners or admins update assets" ON public.assets;
DROP POLICY IF EXISTS "Owners or admins delete assets" ON public.assets;
DROP POLICY IF EXISTS "Users create own assets" ON public.assets;
CREATE POLICY "Org members view assets" ON public.assets FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Privileged users manage assets" ON public.assets FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_module(auth.uid(), organization_id, 'operacional', true)
            OR public.can_access_module(auth.uid(), organization_id, 'crm', true))
            AND owner_id = auth.uid());
CREATE POLICY "Privileged users update assets" ON public.assets FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'operacional', true)
      OR public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Privileged users delete assets" ON public.assets FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- SPORTS_PROPERTIES (operacional + CRM + admin)
DROP POLICY IF EXISTS "Owners or admins view properties" ON public.sports_properties;
DROP POLICY IF EXISTS "Owners or admins update properties" ON public.sports_properties;
DROP POLICY IF EXISTS "Owners or admins delete properties" ON public.sports_properties;
DROP POLICY IF EXISTS "Users create own properties" ON public.sports_properties;
CREATE POLICY "Org members view properties" ON public.sports_properties FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Privileged users insert properties" ON public.sports_properties FOR INSERT TO authenticated
  WITH CHECK ((public.can_access_module(auth.uid(), organization_id, 'operacional', true)
            OR public.can_access_module(auth.uid(), organization_id, 'crm', true))
            AND owner_id = auth.uid());
CREATE POLICY "Privileged users update properties" ON public.sports_properties FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'operacional', true)
      OR public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Privileged users delete properties" ON public.sports_properties FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- TIERS (CRM)
DROP POLICY IF EXISTS "Owners or admins view tiers" ON public.sponsorship_tiers;
DROP POLICY IF EXISTS "Owners or admins update tiers" ON public.sponsorship_tiers;
DROP POLICY IF EXISTS "Owners or admins delete tiers" ON public.sponsorship_tiers;
DROP POLICY IF EXISTS "Users create own tiers" ON public.sponsorship_tiers;
CREATE POLICY "Org members view tiers" ON public.sponsorship_tiers FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage tiers ins" ON public.sponsorship_tiers FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), organization_id, 'crm', true) AND owner_id = auth.uid());
CREATE POLICY "CRM users manage tiers upd" ON public.sponsorship_tiers FOR UPDATE TO authenticated
  USING (public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users manage tiers del" ON public.sponsorship_tiers FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin']::org_role[]));

-- update handle_new_user to also create an org for brand new signups (kept as comercial fallback if invited)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org_id uuid; _invite record;
BEGIN
  INSERT INTO public.profiles (id, full_name, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'comercial');

  -- accept pending org invite if any
  SELECT * INTO _invite FROM public.organization_invites
   WHERE lower(email) = lower(NEW.email) AND status = 'pendente' AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_invite.organization_id, NEW.id, _invite.role, 'ativo')
    ON CONFLICT DO NOTHING;
    UPDATE public.organization_invites
       SET status = 'aceito', accepted_at = now(), accepted_user_id = NEW.id
     WHERE id = _invite.id;
  ELSE
    -- create personal organization
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'company',''), 'Minha empresa'), NEW.id)
    RETURNING id INTO _org_id;
    INSERT INTO public.organization_members (organization_id, user_id, role, status)
    VALUES (_org_id, NEW.id, 'owner', 'ativo');
  END IF;
  RETURN NEW;
END $$;
