-- Multi-tenant hardening: organization_id as the tenant boundary

-- 1) Add organization_id to module child tables that still depended only on owner/global admin rules.
ALTER TABLE public.property_checklist_items ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_leads ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.property_media ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.proposal_items ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sponsor_contacts ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sponsor_interactions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sponsor_invites ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.sponsor_portal_access ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.tier_assets ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.tier_sales ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.user_dashboard_preferences ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.user_stage_probabilities ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 2) Backfill tenant ids from parent records.
UPDATE public.property_checklist_items pci
SET organization_id = sp.organization_id
FROM public.sports_properties sp
WHERE pci.property_id = sp.id AND pci.organization_id IS NULL;

UPDATE public.property_events pe
SET organization_id = sp.organization_id
FROM public.sports_properties sp
WHERE pe.property_id = sp.id AND pe.organization_id IS NULL;

UPDATE public.property_leads pl
SET organization_id = sp.organization_id
FROM public.sports_properties sp
WHERE pl.property_id = sp.id AND pl.organization_id IS NULL;

UPDATE public.property_media pm
SET organization_id = sp.organization_id
FROM public.sports_properties sp
WHERE pm.property_id = sp.id AND pm.organization_id IS NULL;

UPDATE public.proposal_items pi
SET organization_id = p.organization_id
FROM public.proposals p
WHERE pi.proposal_id = p.id AND pi.organization_id IS NULL;

UPDATE public.sponsor_contacts sc
SET organization_id = s.organization_id
FROM public.sponsors s
WHERE sc.sponsor_id = s.id AND sc.organization_id IS NULL;

UPDATE public.sponsor_interactions si
SET organization_id = s.organization_id
FROM public.sponsors s
WHERE si.sponsor_id = s.id AND si.organization_id IS NULL;

UPDATE public.sponsor_invites inv
SET organization_id = s.organization_id
FROM public.sponsors s
WHERE inv.sponsor_id = s.id AND inv.organization_id IS NULL;

UPDATE public.sponsor_portal_access spa
SET organization_id = s.organization_id
FROM public.sponsors s
WHERE spa.sponsor_id = s.id AND spa.organization_id IS NULL;

UPDATE public.tier_assets ta
SET organization_id = st.organization_id
FROM public.sponsorship_tiers st
WHERE ta.tier_id = st.id AND ta.organization_id IS NULL;

UPDATE public.tier_sales ts
SET organization_id = st.organization_id
FROM public.sponsorship_tiers st
WHERE ts.tier_id = st.id AND ts.organization_id IS NULL;

UPDATE public.user_dashboard_preferences udp
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE udp.user_id = om.user_id AND udp.organization_id IS NULL AND om.status = 'ativo';

UPDATE public.user_stage_probabilities usp
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE usp.user_id = om.user_id AND usp.organization_id IS NULL AND om.status = 'ativo';

-- 3) Keep tenant ids synchronized from parent records.
CREATE OR REPLACE FUNCTION public.set_org_from_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sports_properties
    WHERE id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_from_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.proposals
    WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_from_sponsor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sponsors
    WHERE id = NEW.sponsor_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_from_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.sponsorship_tiers
    WHERE id = NEW.tier_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_org_from_user_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.organization_members
    WHERE user_id = NEW.user_id AND status = 'ativo'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_checklist_items_org ON public.property_checklist_items;
CREATE TRIGGER trg_property_checklist_items_org
BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_property();

DROP TRIGGER IF EXISTS trg_property_events_org ON public.property_events;
CREATE TRIGGER trg_property_events_org
BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_events
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_property();

DROP TRIGGER IF EXISTS trg_property_leads_org ON public.property_leads;
CREATE TRIGGER trg_property_leads_org
BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_leads
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_property();

DROP TRIGGER IF EXISTS trg_property_media_org ON public.property_media;
CREATE TRIGGER trg_property_media_org
BEFORE INSERT OR UPDATE OF property_id, organization_id ON public.property_media
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_property();

DROP TRIGGER IF EXISTS trg_proposal_items_org ON public.proposal_items;
CREATE TRIGGER trg_proposal_items_org
BEFORE INSERT OR UPDATE OF proposal_id, organization_id ON public.proposal_items
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_proposal();

DROP TRIGGER IF EXISTS trg_sponsor_contacts_org ON public.sponsor_contacts;
CREATE TRIGGER trg_sponsor_contacts_org
BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();

DROP TRIGGER IF EXISTS trg_sponsor_interactions_org ON public.sponsor_interactions;
CREATE TRIGGER trg_sponsor_interactions_org
BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_interactions
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();

DROP TRIGGER IF EXISTS trg_sponsor_invites_org ON public.sponsor_invites;
CREATE TRIGGER trg_sponsor_invites_org
BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_invites
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();

DROP TRIGGER IF EXISTS trg_sponsor_portal_access_org ON public.sponsor_portal_access;
CREATE TRIGGER trg_sponsor_portal_access_org
BEFORE INSERT OR UPDATE OF sponsor_id, organization_id ON public.sponsor_portal_access
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_sponsor();

DROP TRIGGER IF EXISTS trg_tier_assets_org ON public.tier_assets;
CREATE TRIGGER trg_tier_assets_org
BEFORE INSERT OR UPDATE OF tier_id, organization_id ON public.tier_assets
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_tier();

DROP TRIGGER IF EXISTS trg_tier_sales_org ON public.tier_sales;
CREATE TRIGGER trg_tier_sales_org
BEFORE INSERT OR UPDATE OF tier_id, organization_id ON public.tier_sales
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_tier();

DROP TRIGGER IF EXISTS trg_user_dashboard_preferences_org ON public.user_dashboard_preferences;
CREATE TRIGGER trg_user_dashboard_preferences_org
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.user_dashboard_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_user_membership();

DROP TRIGGER IF EXISTS trg_user_stage_probabilities_org ON public.user_stage_probabilities;
CREATE TRIGGER trg_user_stage_probabilities_org
BEFORE INSERT OR UPDATE OF user_id, organization_id ON public.user_stage_probabilities
FOR EACH ROW EXECUTE FUNCTION public.set_org_from_user_membership();

-- 4) Index tenant boundary columns for RLS and app filters.
CREATE INDEX IF NOT EXISTS idx_property_checklist_items_org ON public.property_checklist_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_events_org ON public.property_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_leads_org ON public.property_leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_property_media_org ON public.property_media(organization_id);
CREATE INDEX IF NOT EXISTS idx_proposal_items_org ON public.proposal_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_contacts_org ON public.sponsor_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_interactions_org ON public.sponsor_interactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_invites_org ON public.sponsor_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_portal_access_org ON public.sponsor_portal_access(organization_id);
CREATE INDEX IF NOT EXISTS idx_tier_assets_org ON public.tier_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tier_sales_org ON public.tier_sales(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_preferences_org ON public.user_dashboard_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_stage_probabilities_org ON public.user_stage_probabilities(organization_id);

-- 5) Replace legacy owner/global-admin policies with organization-scoped policies.
DROP POLICY IF EXISTS "Owners or admins view checklist" ON public.property_checklist_items;
DROP POLICY IF EXISTS "Owners or admins update checklist" ON public.property_checklist_items;
DROP POLICY IF EXISTS "Owners or admins delete checklist" ON public.property_checklist_items;
DROP POLICY IF EXISTS "Users create own checklist" ON public.property_checklist_items;
CREATE POLICY "Org members view checklist"
ON public.property_checklist_items FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Ops users create checklist"
ON public.property_checklist_items FOR INSERT TO authenticated
WITH CHECK ((organization_id IS NOT NULL) AND owner_id = auth.uid() AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));
CREATE POLICY "Ops users update checklist"
ON public.property_checklist_items FOR UPDATE TO authenticated
USING ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)))
WITH CHECK ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));
CREATE POLICY "Org admins delete checklist"
ON public.property_checklist_items FOR DELETE TO authenticated
USING ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','operacional']::org_role[]));

DROP POLICY IF EXISTS "Owners or admins view events" ON public.property_events;
DROP POLICY IF EXISTS "Owners or admins update events" ON public.property_events;
DROP POLICY IF EXISTS "Owners or admins delete events" ON public.property_events;
DROP POLICY IF EXISTS "Users create own events" ON public.property_events;
CREATE POLICY "Org members view events"
ON public.property_events FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Ops users create events"
ON public.property_events FOR INSERT TO authenticated
WITH CHECK ((organization_id IS NOT NULL) AND owner_id = auth.uid() AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));
CREATE POLICY "Ops users update events"
ON public.property_events FOR UPDATE TO authenticated
USING ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)))
WITH CHECK ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'operacional', true) OR public.can_access_module(auth.uid(), organization_id, 'crm', true)));
CREATE POLICY "Org admins delete events"
ON public.property_events FOR DELETE TO authenticated
USING ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','operacional']::org_role[]));

DROP POLICY IF EXISTS "Owners or admins view leads" ON public.property_leads;
DROP POLICY IF EXISTS "Owners or admins update leads" ON public.property_leads;
DROP POLICY IF EXISTS "Owners or admins delete leads" ON public.property_leads;
CREATE POLICY "Org members view property leads"
ON public.property_leads FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users update property leads"
ON public.property_leads FOR UPDATE TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete property leads"
ON public.property_leads FOR DELETE TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Owners or admins view property_media" ON public.property_media;
DROP POLICY IF EXISTS "Owners or admins update property_media" ON public.property_media;
DROP POLICY IF EXISTS "Owners or admins delete property_media" ON public.property_media;
DROP POLICY IF EXISTS "Users create own property_media" ON public.property_media;
CREATE POLICY "Org members view property media"
ON public.property_media FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM or ops users create property media"
ON public.property_media FOR INSERT TO authenticated
WITH CHECK ((organization_id IS NOT NULL) AND owner_id = auth.uid() AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'operacional', true)));
CREATE POLICY "CRM or ops users update property media"
ON public.property_media FOR UPDATE TO authenticated
USING ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'operacional', true)))
WITH CHECK ((organization_id IS NOT NULL) AND (public.can_access_module(auth.uid(), organization_id, 'crm', true) OR public.can_access_module(auth.uid(), organization_id, 'operacional', true)));
CREATE POLICY "Org admins delete property media"
ON public.property_media FOR DELETE TO authenticated
USING ((organization_id IS NOT NULL) AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner','admin','operacional']::org_role[]));

DROP POLICY IF EXISTS "Manage items of own proposals" ON public.proposal_items;
CREATE POLICY "Org members view proposal items"
ON public.proposal_items FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users create proposal items"
ON public.proposal_items FOR INSERT TO authenticated
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users update proposal items"
ON public.proposal_items FOR UPDATE TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "CRM users delete proposal items"
ON public.proposal_items FOR DELETE TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Manage contacts of own sponsors" ON public.sponsor_contacts;
CREATE POLICY "Org members view sponsor contacts"
ON public.sponsor_contacts FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage sponsor contacts"
ON public.sponsor_contacts FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Owner manages sponsor interactions" ON public.sponsor_interactions;
CREATE POLICY "Org members view sponsor interactions"
ON public.sponsor_interactions FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage sponsor interactions"
ON public.sponsor_interactions FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Owner manages invites" ON public.sponsor_invites;
CREATE POLICY "CRM users manage sponsor invites"
ON public.sponsor_invites FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Owner manages portal access" ON public.sponsor_portal_access;
CREATE POLICY "CRM users manage sponsor portal access"
ON public.sponsor_portal_access FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Manage tier assets of own tiers" ON public.tier_assets;
DROP POLICY IF EXISTS "Manage tier sales of own tiers" ON public.tier_sales;
CREATE POLICY "Org members view tier assets"
ON public.tier_assets FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage tier assets"
ON public.tier_assets FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));
CREATE POLICY "Org members view tier sales"
ON public.tier_sales FOR SELECT TO authenticated
USING ((organization_id IS NOT NULL) AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "CRM users manage tier sales"
ON public.tier_sales FOR ALL TO authenticated
USING ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true))
WITH CHECK ((organization_id IS NOT NULL) AND public.can_access_module(auth.uid(), organization_id, 'crm', true));

DROP POLICY IF EXISTS "Users manage own dashboard preferences" ON public.user_dashboard_preferences;
CREATE POLICY "Users manage own org dashboard preferences"
ON public.user_dashboard_preferences FOR ALL TO authenticated
USING (user_id = auth.uid() AND ((organization_id IS NULL) OR public.is_org_member(auth.uid(), organization_id)))
WITH CHECK (user_id = auth.uid() AND ((organization_id IS NULL) OR public.is_org_member(auth.uid(), organization_id)));

DROP POLICY IF EXISTS "Users manage own stage probabilities" ON public.user_stage_probabilities;
CREATE POLICY "Users manage own org stage probabilities"
ON public.user_stage_probabilities FOR ALL TO authenticated
USING (user_id = auth.uid() AND ((organization_id IS NULL) OR public.is_org_member(auth.uid(), organization_id)))
WITH CHECK (user_id = auth.uid() AND ((organization_id IS NULL) OR public.is_org_member(auth.uid(), organization_id)));

-- 6) Keep public policies intact but ensure any public create path derives its tenant from a published parent.
DROP POLICY IF EXISTS "Anyone can submit lead to published property" ON public.property_leads;
CREATE POLICY "Anyone can submit lead to published property"
ON public.property_leads FOR INSERT TO anon, authenticated
WITH CHECK (public.is_property_published(property_id));
