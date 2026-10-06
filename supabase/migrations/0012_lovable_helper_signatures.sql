-- 0012_lovable_helper_signatures.sql
-- Reconciliação com o schema real do Lovable
-- (docs/architecture/reconciliacao-schema-2026-10-02.md).
--
-- As sobrecargas com _user_id explícito foram reconstruídas (0008/0009) com os
-- parâmetros em ordem alfabética, herdada do types.ts. As funções reais do
-- Lovable portadas nas migrations seguintes chamam esses helpers de forma
-- POSICIONAL na ordem real (_user_id primeiro): sem esta migration, os
-- argumentos chegariam trocados e as checagens errariam em silêncio.
-- Chamadas via PostgREST usam parâmetros nomeados e não são afetadas.
--
-- As versões de 1 argumento (is_org_member(org), has_org_role(org, text[])),
-- usadas pelas policies de 0005, não mudam.
--
-- Permissões: só authenticated/service_role (antes herdavam o EXECUTE padrão
-- de PUBLIC, inclusive anon). can_access_contract_file era anon no Lovable;
-- aqui fica sem anon (contratos são privados).


-- is_org_member
drop function if exists public.is_org_member(uuid, uuid);
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND status = 'ativo'
  )
$function$;
revoke all on function public.is_org_member(_user_id uuid, _org_id uuid) from public, anon, authenticated;
grant execute on function public.is_org_member(_user_id uuid, _org_id uuid) to authenticated, service_role;

-- has_org_role
drop function if exists public.has_org_role(uuid, public.org_role[], uuid);
CREATE OR REPLACE FUNCTION public.has_org_role(_user_id uuid, _org_id uuid, _roles org_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
      AND status = 'ativo' AND role = ANY(_roles)
  )
$function$;
revoke all on function public.has_org_role(_user_id uuid, _org_id uuid, _roles org_role[]) from public, anon, authenticated;
grant execute on function public.has_org_role(_user_id uuid, _org_id uuid, _roles org_role[]) to authenticated, service_role;

-- has_role
drop function if exists public.has_role(public.app_role, uuid);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$function$;
revoke all on function public.has_role(_user_id uuid, _role app_role) from public, anon, authenticated;
grant execute on function public.has_role(_user_id uuid, _role app_role) to authenticated, service_role;

-- has_sponsor_access
drop function if exists public.has_sponsor_access(uuid, uuid);
CREATE OR REPLACE FUNCTION public.has_sponsor_access(_user_id uuid, _sponsor_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.sponsor_portal_access
    where user_id = _user_id
      and sponsor_id = _sponsor_id
      and status = 'ativo'
  )
$function$;
revoke all on function public.has_sponsor_access(_user_id uuid, _sponsor_id uuid) from public, anon, authenticated;
grant execute on function public.has_sponsor_access(_user_id uuid, _sponsor_id uuid) to authenticated, service_role;

-- can_access_module
drop function if exists public.can_access_module(uuid, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.can_access_module(_user_id uuid, _org_id uuid, _module text, _write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function public.can_access_module(_user_id uuid, _org_id uuid, _module text, _write boolean) from public, anon, authenticated;
grant execute on function public.can_access_module(_user_id uuid, _org_id uuid, _module text, _write boolean) to authenticated, service_role;

-- can_access_contract_file
drop function if exists public.can_access_contract_file(text, uuid);
CREATE OR REPLACE FUNCTION public.can_access_contract_file(_user_id uuid, _path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.file_path = _path
      AND c.organization_id IS NOT NULL
      AND public.is_org_member(_user_id, c.organization_id)
  )
$function$;
revoke all on function public.can_access_contract_file(_user_id uuid, _path text) from public, anon, authenticated;
grant execute on function public.can_access_contract_file(_user_id uuid, _path text) to authenticated, service_role;
