-- Recreate organization membership trigger so newly created organizations are immediately accessible
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (NEW.id, NEW.owner_id, 'owner', 'ativo')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;
CREATE TRIGGER on_organization_created
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_organization();

-- Validate and normalize opportunities before RLS checks run
CREATE OR REPLACE FUNCTION public.tg_validate_opportunity_org_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _role text := auth.role();
  _resolved_org uuid;
BEGIN
  IF _role = 'service_role' THEN
    IF NEW.organization_id IS NULL AND NEW.owner_id IS NOT NULL THEN
      NEW.organization_id := public.get_user_org(NEW.owner_id);
    END IF;
    RETURN NEW;
  END IF;

  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado para criar ou alterar negociação';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := _actor;
    END IF;

    IF NEW.owner_id IS DISTINCT FROM _actor THEN
      RAISE EXCEPTION 'Negociação deve ser criada pelo próprio usuário autenticado';
    END IF;
  END IF;

  _resolved_org := COALESCE(NEW.organization_id, public.get_user_org(_actor));

  IF _resolved_org IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização ativa encontrada para o usuário';
  END IF;

  IF NOT public.is_org_member(_actor, _resolved_org) THEN
    RAISE EXCEPTION 'Usuário não pertence à organização da negociação';
  END IF;

  IF NOT public.can_access_module(_actor, _resolved_org, 'crm', true) THEN
    RAISE EXCEPTION 'Usuário sem permissão de CRM para gerenciar negociações nesta organização';
  END IF;

  NEW.organization_id := _resolved_org;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_opportunity_org_access ON public.opportunities;
CREATE TRIGGER validate_opportunity_org_access
BEFORE INSERT OR UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.tg_validate_opportunity_org_access();

-- Tighten opportunity policies to require active organization membership and CRM access
DROP POLICY IF EXISTS "Org members view opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "CRM users insert opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "CRM users update opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "CRM users delete opportunities" ON public.opportunities;

CREATE POLICY "Org members view opportunities"
ON public.opportunities
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.is_org_member(auth.uid(), organization_id)
);

CREATE POLICY "CRM users insert opportunities"
ON public.opportunities
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NOT NULL
  AND owner_id = auth.uid()
  AND public.can_access_module(auth.uid(), organization_id, 'crm', true)
);

CREATE POLICY "CRM users update opportunities"
ON public.opportunities
FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.can_access_module(auth.uid(), organization_id, 'crm', true)
)
WITH CHECK (
  organization_id IS NOT NULL
  AND public.can_access_module(auth.uid(), organization_id, 'crm', true)
);

CREATE POLICY "CRM users delete opportunities"
ON public.opportunities
FOR DELETE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND public.can_access_module(auth.uid(), organization_id, 'crm', true)
);

-- Keep helper functions internal where possible after recreating them
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_organization() TO service_role;
REVOKE EXECUTE ON FUNCTION public.tg_validate_opportunity_org_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_validate_opportunity_org_access() TO service_role;