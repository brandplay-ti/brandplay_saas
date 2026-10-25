
CREATE TABLE public.opportunity_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  organization_id uuid,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  contact_type text NOT NULL DEFAULT 'geral' CHECK (contact_type IN ('geral','contrato','financeiro')),
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opportunity_contacts_opp ON public.opportunity_contacts(opportunity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_contacts TO authenticated;
GRANT ALL ON public.opportunity_contacts TO service_role;

ALTER TABLE public.opportunity_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read opportunity contacts"
ON public.opportunity_contacts FOR SELECT TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members insert opportunity contacts"
ON public.opportunity_contacts FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_member(auth.uid(), organization_id)
  AND EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_id AND o.organization_id = opportunity_contacts.organization_id
  )
);

CREATE POLICY "org members update opportunity contacts"
ON public.opportunity_contacts FOR UPDATE TO authenticated
USING (public.is_org_member(auth.uid(), organization_id))
WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members delete opportunity contacts"
ON public.opportunity_contacts FOR DELETE TO authenticated
USING (public.is_org_member(auth.uid(), organization_id));

CREATE TRIGGER trg_opportunity_contacts_updated_at
BEFORE UPDATE ON public.opportunity_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- preenche organization_id a partir da oportunidade
CREATE OR REPLACE FUNCTION public.tg_set_opportunity_contact_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_opportunity_contacts_set_org
BEFORE INSERT ON public.opportunity_contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_set_opportunity_contact_org();

-- sincroniza contatos da oportunidade com o patrocinador
CREATE OR REPLACE FUNCTION public.sync_opportunity_contact_to_sponsor(_contact_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c record; _sponsor uuid; _org uuid; _role text;
BEGIN
  SELECT * INTO _c FROM public.opportunity_contacts WHERE id = _contact_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT sponsor_id, organization_id INTO _sponsor, _org FROM public.opportunities WHERE id = _c.opportunity_id;
  IF _sponsor IS NULL THEN RETURN; END IF;

  _role := COALESCE(NULLIF(btrim(_c.role), ''),
    CASE _c.contact_type WHEN 'contrato' THEN 'Responsável pelo contrato'
                         WHEN 'financeiro' THEN 'Financeiro'
                         ELSE NULL END);

  IF EXISTS (
    SELECT 1 FROM public.sponsor_contacts sc
    WHERE sc.sponsor_id = _sponsor
      AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
           OR lower(sc.name) = lower(_c.name))
  ) THEN
    UPDATE public.sponsor_contacts sc
       SET role = COALESCE(_role, sc.role),
           email = COALESCE(NULLIF(_c.email,''), sc.email),
           phone = COALESCE(NULLIF(_c.phone,''), sc.phone)
     WHERE sc.sponsor_id = _sponsor
       AND ((COALESCE(_c.email,'') <> '' AND lower(COALESCE(sc.email,'')) = lower(_c.email))
            OR lower(sc.name) = lower(_c.name));
  ELSE
    INSERT INTO public.sponsor_contacts (sponsor_id, organization_id, name, role, email, phone, is_primary)
    VALUES (_sponsor, COALESCE(_org, _c.organization_id), _c.name, _role, NULLIF(_c.email,''), NULLIF(_c.phone,''), _c.is_primary);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_opportunity_contact_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.sync_opportunity_contact_to_sponsor(NEW.id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_opportunity_contacts_sync
AFTER INSERT OR UPDATE ON public.opportunity_contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_opportunity_contact_sync();

-- ao vincular patrocinador na oportunidade, sincroniza contatos existentes
CREATE OR REPLACE FUNCTION public.tg_opportunity_sponsor_sync_contacts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c record;
BEGIN
  IF NEW.sponsor_id IS NOT NULL AND NEW.sponsor_id IS DISTINCT FROM OLD.sponsor_id THEN
    FOR _c IN SELECT id FROM public.opportunity_contacts WHERE opportunity_id = NEW.id LOOP
      PERFORM public.sync_opportunity_contact_to_sponsor(_c.id);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_opportunity_sponsor_sync_contacts
AFTER UPDATE OF sponsor_id ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.tg_opportunity_sponsor_sync_contacts();
