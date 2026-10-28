-- Permissões por organização (o admin edita o que cada papel acessa).
--
-- O padrão é o que `can_access_module` já fazia em 0012, com uma correção:
-- comercial, operacional e financeiro não leem o módulo `team`. A matriz
-- estática da tela dizia que operacional não via o CRM; o banco deixava ler.
-- Aqui o padrão segue o banco, para não encolher acesso que já existe.
--
-- O proprietário fica com edição nos quatro módulos. O acesso de equipe dos
-- administradores só o proprietário muda. Assim a conta não se tranca.

create table public.organization_role_grants (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.org_role not null,
  module text not null,
  access text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, role, module),
  constraint organization_role_grants_module_check check (
    module in ('crm', 'operacional', 'financeiro', 'team')
  ),
  constraint organization_role_grants_access_check check (
    access in ('none', 'read', 'write')
  )
);

comment on table public.organization_role_grants is
  'O que cada papel da organização pode fazer em crm, operacional, financeiro e team. O proprietário permanece com edição.';

create or replace function public.semear_permissoes_da_organizacao(_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.organization_role_grants (organization_id, role, module, access)
  select _org_id, v.role::public.org_role, v.module, v.access
    from (values
      ('owner', 'crm', 'write'),
      ('owner', 'operacional', 'write'),
      ('owner', 'financeiro', 'write'),
      ('owner', 'team', 'write'),
      ('admin', 'crm', 'write'),
      ('admin', 'operacional', 'write'),
      ('admin', 'financeiro', 'write'),
      ('admin', 'team', 'write'),
      ('comercial', 'crm', 'write'),
      ('comercial', 'operacional', 'read'),
      ('comercial', 'financeiro', 'read'),
      ('comercial', 'team', 'none'),
      ('operacional', 'crm', 'read'),
      ('operacional', 'operacional', 'write'),
      ('operacional', 'financeiro', 'read'),
      ('operacional', 'team', 'none'),
      ('financeiro', 'crm', 'read'),
      ('financeiro', 'operacional', 'read'),
      ('financeiro', 'financeiro', 'write'),
      ('financeiro', 'team', 'none')
    ) as v(role, module, access)
  on conflict (organization_id, role, module) do nothing;
$$;

create or replace function public.tg_semear_permissoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.semear_permissoes_da_organizacao(new.id);
  return new;
end;
$$;

create trigger trg_semear_permissoes
  after insert on public.organizations
  for each row execute function public.tg_semear_permissoes();

select public.semear_permissoes_da_organizacao(id) from public.organizations;

revoke all on function public.semear_permissoes_da_organizacao(uuid) from public, anon, authenticated;
revoke all on function public.tg_semear_permissoes() from public, anon, authenticated;

-- ─── can_access_module passa a ler a matriz ─────────────────────────
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
  );
$$;

comment on function public.can_access_module(uuid, uuid, text, boolean) is
  'Acesso do membro ativo segundo organization_role_grants. write exige access = write; leitura aceita read ou write.';

-- Leituras principais de cada módulo. As policies de escrita já chamavam
-- can_access_module(..., true). "Sem acesso" também esconde a lista.
drop policy if exists sponsors_tenant_read on public.sponsors;
create policy sponsors_tenant_read on public.sponsors
  for select to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm', false));

drop policy if exists opportunities_tenant_read on public.opportunities;
create policy opportunities_tenant_read on public.opportunities
  for select to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm', false));

drop policy if exists proposals_tenant_read on public.proposals;
create policy proposals_tenant_read on public.proposals
  for select to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'crm', false));

drop policy if exists deliveries_tenant_read on public.deliveries;
create policy deliveries_tenant_read on public.deliveries
  for select to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'operacional', false));

drop policy if exists installments_tenant_read on public.installments;
create policy installments_tenant_read on public.installments
  for select to authenticated
  using (public.can_access_module(auth.uid(), organization_id, 'financeiro', false));

-- ─── Travas ──────────────────────────────────────────────────────────
create or replace function public.tg_proteger_permissoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.role is distinct from old.role
     or new.module is distinct from old.module then
    raise exception 'Papel e módulo da permissão não mudam.' using errcode = 'check_violation';
  end if;
  if old.role = 'owner' and new.access is distinct from 'write' then
    raise exception 'O proprietário mantém edição em todos os módulos.' using errcode = 'check_violation';
  end if;
  if new.role = 'admin' and new.module = 'team' and new.access is distinct from 'write' then
    if not exists (
      select 1 from public.organization_members
       where organization_id = new.organization_id
         and user_id = auth.uid()
         and role = 'owner'
         and status = 'ativo'
    ) then
      raise exception 'Só o proprietário altera o acesso de equipe dos administradores.'
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_proteger_permissoes
  before update on public.organization_role_grants
  for each row execute function public.tg_proteger_permissoes();

alter table public.team_audit_log drop constraint team_audit_log_action_check;
alter table public.team_audit_log add constraint team_audit_log_action_check check (
  action = any (array[
    'invite_sent', 'invite_resent', 'invite_revoked', 'member_created',
    'role_changed', 'member_revoked', 'member_reactivated', 'permission_changed'
  ])
);

create or replace function public.tg_auditar_permissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access is not distinct from old.access or auth.uid() is null then
    return new;
  end if;
  insert into public.team_audit_log (
    organization_id, actor_id, action, old_role, new_role, metadata
  ) values (
    new.organization_id,
    auth.uid(),
    'permission_changed',
    new.role,
    new.role,
    jsonb_build_object('module', new.module, 'before', old.access, 'after', new.access)
  );
  return new;
end;
$$;

create trigger trg_auditar_permissao
  after update of access on public.organization_role_grants
  for each row execute function public.tg_auditar_permissao();

revoke all on function public.tg_proteger_permissoes() from public, anon, authenticated;
revoke all on function public.tg_auditar_permissao() from public, anon, authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.organization_role_grants enable row level security;

create policy organization_role_grants_select on public.organization_role_grants
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_role_grants_admin_update on public.organization_role_grants
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin'])
    and role <> 'owner'
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin'])
    and role <> 'owner'
  );

create policy billing_access_restrictive on public.organization_role_grants
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

revoke all on public.organization_role_grants from anon, authenticated;
grant select, update on public.organization_role_grants to authenticated;
grant all on public.organization_role_grants to service_role;
