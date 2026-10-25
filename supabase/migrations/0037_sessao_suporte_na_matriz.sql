-- A sessão de suporte (0035) faz is_org_member/has_org_role valerem como
-- admin, mas não cria membership. Desde 0036 a leitura de patrocinadores,
-- oportunidades, propostas, entregas e parcelas passa por can_access_module,
-- que só olhava organization_members. Sem esta função, o operador em sessão
-- vê a organização e não vê o dado.

create or replace function public.can_access_module(
  _user_id uuid,
  _org_id uuid,
  _module text,
  _write boolean
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.organization_members om
      join public.organization_role_grants g
        on g.organization_id = om.organization_id
       and g.role = om.role
       and g.module = _module
     where om.user_id = _user_id
       and om.organization_id = _org_id
       and om.status = 'ativo'
       and (
         (_write and g.access = 'write')
         or (not _write and g.access in ('read', 'write'))
       )
  )
  or (
    _user_id = auth.uid()
    and public.sessao_suporte_vigente(_org_id)
    and exists (
      select 1
        from public.organization_role_grants g
       where g.organization_id = _org_id
         and g.role = 'admin'
         and g.module = _module
         and (
           (_write and g.access = 'write')
           or (not _write and g.access in ('read', 'write'))
         )
    )
  );
$$;

comment on function public.can_access_module(uuid, uuid, text, boolean) is
  'Acesso do membro ativo segundo organization_role_grants. write exige access = write; leitura aceita read ou write. Sessão de suporte vigente vale como o papel admin dessa organização, só para auth.uid(), sem virar membership nem owner.';
