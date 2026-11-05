-- Equipes de trabalho (fase 1 de docs/architecture/plano-equipes.md, ADR-0012).
--
-- Cadastro de equipes, quem está em cada uma e quais projetos
-- (`sports_properties`) cada uma recebe. Nesta fase nada muda na
-- visibilidade: as policies das tabelas de domínio não olham as equipes, e a
-- coluna `scope` da matriz nasce com 'organizacao' para todos os papéis. O
-- escopo "Minhas equipes" entra na fase 2.
--
-- Nada atravessa organizações: equipe, membro e projeto se ligam por chave
-- estrangeira composta (organization_id, id), e o organization_id das
-- tabelas de vínculo vem da equipe, por gatilho — o valor enviado pelo
-- cliente é descartado.
--
-- Quem escreve: dono e administrador (D12). O líder de equipe só inclui,
-- altera e tira membros comuns da própria equipe, entre quem já é membro
-- ativo da organização (D9).

-- ─── Alvo da FK composta dos projetos ────────────────────────────────
alter table public.sports_properties
  add constraint sports_properties_organization_id_id_key unique (organization_id, id);

-- ─── Tabelas ─────────────────────────────────────────────────────────
create table public.work_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_teams_organization_id_id_key unique (organization_id, id),
  constraint work_teams_name_check check (length(btrim(name)) between 1 and 80),
  constraint work_teams_status_check check (status in ('ativo', 'arquivado'))
);

create unique index work_teams_nome_ativo_key
  on public.work_teams (organization_id, lower(btrim(name)))
  where status = 'ativo';

comment on table public.work_teams is
  'Equipe de trabalho: sub-escopo dentro da organização (ADR-0012). Arquivada, nunca excluída.';

create table public.work_team_members (
  team_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  team_role text not null default 'membro',
  expires_at timestamptz,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint work_team_members_team_fkey foreign key (organization_id, team_id)
    references public.work_teams (organization_id, id) on delete cascade,
  constraint work_team_members_member_fkey foreign key (organization_id, user_id)
    references public.organization_members (organization_id, user_id) on delete cascade,
  constraint work_team_members_team_role_check check (team_role in ('lider', 'membro')),
  constraint work_team_members_status_check check (status in ('ativo', 'revogado'))
);

create index work_team_members_user_idx on public.work_team_members (organization_id, user_id);

comment on table public.work_team_members is
  'Quem está em cada equipe. Só membro ativo da organização entra; vale até expires_at. Sair da equipe é status revogado.';

create table public.work_team_properties (
  team_id uuid not null,
  organization_id uuid not null,
  property_id uuid not null,
  access text not null default 'write',
  include_children boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, property_id),
  constraint work_team_properties_team_fkey foreign key (organization_id, team_id)
    references public.work_teams (organization_id, id) on delete cascade,
  constraint work_team_properties_property_fkey foreign key (organization_id, property_id)
    references public.sports_properties (organization_id, id) on delete cascade,
  constraint work_team_properties_access_check check (access in ('read', 'write'))
);

create index work_team_properties_property_idx on public.work_team_properties (organization_id, property_id);

comment on table public.work_team_properties is
  'Projetos (propriedades) de cada equipe. Os membros herdam; include_children estende aos subprojetos.';

-- ─── Escopo na matriz de permissões ──────────────────────────────────
-- Sem efeito nesta fase: nenhuma policy lê a coluna ainda. Dono, administrador
-- e o módulo `team` ficam sempre na organização.
alter table public.organization_role_grants
  add column scope text not null default 'organizacao',
  add constraint organization_role_grants_scope_check check (
    scope in ('organizacao', 'equipe')
    and (scope = 'organizacao' or (role not in ('owner', 'admin') and module <> 'team'))
  );

-- ─── Equipes no convite ──────────────────────────────────────────────
alter table public.organization_invites
  add column team_ids uuid[] not null default '{}';

-- ─── Gatilhos de integridade ─────────────────────────────────────────
create or replace function public.tg_work_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A organização da equipe não muda.' using errcode = 'check_violation';
  end if;
  new.name := btrim(new.name);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_work_teams
  before insert or update on public.work_teams
  for each row execute function public.tg_work_teams();

-- organization_id vem da equipe; equipe arquivada não recebe vínculo novo.
create or replace function public.tg_membro_de_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _status_equipe text;
begin
  if tg_op = 'UPDATE' and (new.team_id is distinct from old.team_id or new.user_id is distinct from old.user_id) then
    raise exception 'O vínculo não muda de equipe nem de pessoa.' using errcode = 'check_violation';
  end if;

  select t.organization_id, t.status into new.organization_id, _status_equipe
    from public.work_teams t
   where t.id = new.team_id;
  if not found then
    raise exception 'Equipe não encontrada.' using errcode = 'foreign_key_violation';
  end if;

  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status <> 'ativo') then
    if _status_equipe <> 'ativo' then
      raise exception 'Equipe arquivada não recebe membros.' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.organization_members om
       where om.organization_id = new.organization_id
         and om.user_id = new.user_id
         and om.status = 'ativo'
    ) then
      raise exception 'Só membro ativo da organização entra na equipe.' using errcode = 'check_violation';
    end if;
  end if;

  if new.expires_at is not null and new.expires_at <= now()
     and (tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at) then
    raise exception 'A data de fim do vínculo precisa ser futura.' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_membro_de_equipe
  before insert or update on public.work_team_members
  for each row execute function public.tg_membro_de_equipe();

create or replace function public.tg_projeto_de_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _status_equipe text;
begin
  if tg_op = 'UPDATE' and (new.team_id is distinct from old.team_id or new.property_id is distinct from old.property_id) then
    raise exception 'O vínculo não muda de equipe nem de projeto.' using errcode = 'check_violation';
  end if;

  select t.organization_id, t.status into new.organization_id, _status_equipe
    from public.work_teams t
   where t.id = new.team_id;
  if not found then
    raise exception 'Equipe não encontrada.' using errcode = 'foreign_key_violation';
  end if;
  if tg_op = 'INSERT' and _status_equipe <> 'ativo' then
    raise exception 'Equipe arquivada não recebe projetos.' using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_projeto_de_equipe
  before insert or update on public.work_team_properties
  for each row execute function public.tg_projeto_de_equipe();

-- Equipes do convite: só equipes ativas da mesma organização, sem repetição.
create or replace function public.tg_equipes_do_convite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.team_ids := coalesce(array(select distinct unnest(new.team_ids)), '{}');
  if exists (
    select 1 from unnest(new.team_ids) as x(id)
     where not exists (
       select 1 from public.work_teams t
        where t.id = x.id
          and t.organization_id = new.organization_id
          and t.status = 'ativo'
     )
  ) then
    raise exception 'Equipe inválida para esta organização.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_equipes_do_convite
  before insert or update of team_ids on public.organization_invites
  for each row
  when (cardinality(new.team_ids) > 0)
  execute function public.tg_equipes_do_convite();

-- Convite aceito (handle_new_user ou aceitar_convite_de_organizacao): a
-- pessoa entra nas equipes do convite que continuam ativas. Os dois caminhos
-- gravam o membro antes de encerrar o convite.
create or replace function public.tg_convite_aceito_nas_equipes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.work_team_members (team_id, organization_id, user_id)
  select t.id, t.organization_id, new.accepted_user_id
    from public.work_teams t
   where t.id = any(new.team_ids)
     and t.organization_id = new.organization_id
     and t.status = 'ativo'
  on conflict (team_id, user_id) do update
     set status = 'ativo'
   where public.work_team_members.status <> 'ativo';
  return new;
end;
$$;

create trigger trg_convite_aceito_nas_equipes
  after update of status on public.organization_invites
  for each row
  when (new.status = 'aceito' and old.status is distinct from 'aceito'
        and new.accepted_user_id is not null and cardinality(new.team_ids) > 0)
  execute function public.tg_convite_aceito_nas_equipes();

-- ─── Auditoria ───────────────────────────────────────────────────────
alter table public.team_audit_log drop constraint team_audit_log_action_check;
alter table public.team_audit_log add constraint team_audit_log_action_check check (
  action = any (array[
    'invite_sent', 'invite_resent', 'invite_revoked', 'member_created',
    'role_changed', 'member_revoked', 'member_reactivated', 'permission_changed',
    'invite_accepted', 'invite_declined',
    'team_created', 'team_updated', 'team_archived', 'team_restored',
    'team_member_added', 'team_member_updated', 'team_member_removed',
    'team_property_added', 'team_property_updated', 'team_property_removed',
    'scope_changed'
  ])
);

-- Sem auth.uid() (migration, service role, cadastro pelo GoTrue) não há quem
-- registrar. Organização excluída leva as equipes junto: nada a auditar.
create or replace function public.tg_auditar_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _acao text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    _acao := 'team_created';
  elsif new.status is distinct from old.status then
    _acao := case when new.status = 'arquivado' then 'team_archived' else 'team_restored' end;
  elsif new.name is distinct from old.name or new.description is distinct from old.description then
    _acao := 'team_updated';
  else
    return null;
  end if;

  insert into public.team_audit_log (organization_id, actor_id, action, metadata)
  values (
    new.organization_id,
    auth.uid(),
    _acao,
    jsonb_build_object('team_id', new.id, 'team_name', new.name)
      || case when _acao = 'team_updated'
              then jsonb_build_object('before', old.name, 'after', new.name)
              else '{}'::jsonb end
  );
  return null;
end;
$$;

create trigger trg_auditar_equipe
  after insert or update on public.work_teams
  for each row execute function public.tg_auditar_equipe();

create or replace function public.tg_auditar_membro_de_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _acao text;
  _meta jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  if new.status = 'ativo' and (tg_op = 'INSERT' or old.status <> 'ativo') then
    _acao := 'team_member_added';
  elsif new.status <> 'ativo' and old.status = 'ativo' then
    _acao := 'team_member_removed';
  elsif new.status = 'ativo'
        and (new.team_role is distinct from old.team_role or new.expires_at is distinct from old.expires_at) then
    _acao := 'team_member_updated';
  else
    return null;
  end if;

  _meta := jsonb_build_object(
    'team_id', new.team_id,
    'team_name', (select t.name from public.work_teams t where t.id = new.team_id),
    'member_name', (select nullif(p.full_name, '') from public.profiles p where p.id = new.user_id),
    'team_role', new.team_role,
    'expires_at', new.expires_at
  );
  if _acao = 'team_member_updated' then
    _meta := _meta || jsonb_build_object('before_team_role', old.team_role, 'before_expires_at', old.expires_at);
  end if;

  insert into public.team_audit_log (organization_id, actor_id, action, target_user_id, metadata)
  values (new.organization_id, auth.uid(), _acao, new.user_id, _meta);
  return null;
end;
$$;

create trigger trg_auditar_membro_de_equipe
  after insert or update on public.work_team_members
  for each row execute function public.tg_auditar_membro_de_equipe();

create or replace function public.tg_auditar_projeto_de_equipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _linha public.work_team_properties;
  _acao text;
  _meta jsonb;
begin
  if tg_op = 'DELETE' then
    _linha := old;
  else
    _linha := new;
  end if;
  if auth.uid() is null
     or not exists (select 1 from public.organizations o where o.id = _linha.organization_id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    _acao := 'team_property_added';
  elsif tg_op = 'DELETE' then
    _acao := 'team_property_removed';
  elsif new.access is distinct from old.access or new.include_children is distinct from old.include_children then
    _acao := 'team_property_updated';
  else
    return null;
  end if;

  _meta := jsonb_build_object(
    'team_id', _linha.team_id,
    'team_name', (select t.name from public.work_teams t where t.id = _linha.team_id),
    'property_id', _linha.property_id,
    'property_name', (select sp.name from public.sports_properties sp where sp.id = _linha.property_id),
    'access', _linha.access,
    'include_children', _linha.include_children
  );
  if _acao = 'team_property_updated' then
    _meta := _meta || jsonb_build_object('before_access', old.access, 'before_include_children', old.include_children);
  end if;

  insert into public.team_audit_log (organization_id, actor_id, action, metadata)
  values (_linha.organization_id, auth.uid(), _acao, _meta);
  return null;
end;
$$;

create trigger trg_auditar_projeto_de_equipe
  after insert or update or delete on public.work_team_properties
  for each row execute function public.tg_auditar_projeto_de_equipe();

-- A matriz passa a auditar também o escopo.
create or replace function public.tg_auditar_permissao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.access is distinct from old.access then
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
  end if;
  if new.scope is distinct from old.scope then
    insert into public.team_audit_log (
      organization_id, actor_id, action, old_role, new_role, metadata
    ) values (
      new.organization_id,
      auth.uid(),
      'scope_changed',
      new.role,
      new.role,
      jsonb_build_object('module', new.module, 'before', old.scope, 'after', new.scope)
    );
  end if;
  return new;
end;
$$;

drop trigger trg_auditar_permissao on public.organization_role_grants;
create trigger trg_auditar_permissao
  after update of access, scope on public.organization_role_grants
  for each row execute function public.tg_auditar_permissao();

-- ─── Funções ─────────────────────────────────────────────────────────
-- Líder ativo de equipe ativa, ainda membro ativo da organização.
create or replace function public.lidera_equipe(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.work_team_members m
      join public.work_teams t on t.id = m.team_id
      join public.organization_members om
        on om.organization_id = m.organization_id
       and om.user_id = m.user_id
     where m.team_id = _team_id
       and m.user_id = auth.uid()
       and m.team_role = 'lider'
       and m.status = 'ativo'
       and (m.expires_at is null or m.expires_at > now())
       and t.status = 'ativo'
       and om.status = 'ativo'
  );
$$;

comment on function public.lidera_equipe(uuid) is
  'auth.uid() é líder vigente da equipe ativa e membro ativo da organização (D9).';

-- Projetos que a pessoa alcança pelas equipes: vínculo vigente, equipe
-- ativa, membro ativo da organização; subprojetos quando include_children.
-- Edição vence leitura quando duas equipes dão o mesmo projeto. Base de
-- `acesso_do_membro` agora e de `projetos_visiveis` na fase 2.
create or replace function public.projetos_das_equipes(_org_id uuid, _user_id uuid)
returns table (property_id uuid, access text, team_ids uuid[])
language sql
stable
security definer
set search_path = public
as $$
  with recursive vinculos as (
    select p.property_id, p.access, p.include_children, p.team_id
      from public.work_team_properties p
      join public.work_team_members m on m.team_id = p.team_id
      join public.work_teams t on t.id = p.team_id
      join public.organization_members om
        on om.organization_id = m.organization_id
       and om.user_id = m.user_id
     where p.organization_id = _org_id
       and m.user_id = _user_id
       and m.status = 'ativo'
       and (m.expires_at is null or m.expires_at > now())
       and t.status = 'ativo'
       and om.status = 'ativo'
  ),
  alcance (property_id, access, include_children, team_id) as (
    select property_id, access, include_children, team_id from vinculos
    union
    select sp.id, a.access, a.include_children, a.team_id
      from alcance a
      join public.sports_properties sp
        on sp.parent_property_id = a.property_id
       and sp.organization_id = _org_id
     where a.include_children
  )
  select a.property_id,
         case when bool_or(a.access = 'write') then 'write' else 'read' end,
         array_agg(distinct a.team_id)
    from alcance a
   group by a.property_id;
$$;

comment on function public.projetos_das_equipes(uuid, uuid) is
  'Projetos que o usuário alcança pelas equipes vigentes, com subprojetos. Interna: só service_role e funções definer.';

-- "Ver como": o administrador confere o que um membro alcança pelas
-- equipes. Só leitura; não troca de sessão.
create or replace function public.acesso_do_membro(_org_id uuid, _user_id uuid)
returns table (
  property_id uuid,
  property_name text,
  parent_property_id uuid,
  access text,
  team_names text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
    select p.property_id,
           sp.name,
           sp.parent_property_id,
           p.access,
           array(
             select t.name from public.work_teams t
              where t.id = any(p.team_ids)
              order by t.name
           )
      from public.projetos_das_equipes(_org_id, _user_id) p
      join public.sports_properties sp on sp.id = p.property_id
     order by sp.name;
end;
$$;

comment on function public.acesso_do_membro(uuid, uuid) is
  'Projetos que o membro alcança pelas equipes, para o "Ver como" da tela de equipe. Só owner/admin.';

revoke all on function public.tg_work_teams() from public, anon, authenticated;
revoke all on function public.tg_membro_de_equipe() from public, anon, authenticated;
revoke all on function public.tg_projeto_de_equipe() from public, anon, authenticated;
revoke all on function public.tg_equipes_do_convite() from public, anon, authenticated;
revoke all on function public.tg_convite_aceito_nas_equipes() from public, anon, authenticated;
revoke all on function public.tg_auditar_equipe() from public, anon, authenticated;
revoke all on function public.tg_auditar_membro_de_equipe() from public, anon, authenticated;
revoke all on function public.tg_auditar_projeto_de_equipe() from public, anon, authenticated;
revoke all on function public.tg_auditar_permissao() from public, anon, authenticated;
revoke all on function public.lidera_equipe(uuid) from public, anon, authenticated;
revoke all on function public.projetos_das_equipes(uuid, uuid) from public, anon, authenticated;
revoke all on function public.acesso_do_membro(uuid, uuid) from public, anon, authenticated;

grant execute on function public.tg_work_teams() to service_role;
grant execute on function public.tg_membro_de_equipe() to service_role;
grant execute on function public.tg_projeto_de_equipe() to service_role;
grant execute on function public.tg_equipes_do_convite() to service_role;
grant execute on function public.tg_convite_aceito_nas_equipes() to service_role;
grant execute on function public.tg_auditar_equipe() to service_role;
grant execute on function public.tg_auditar_membro_de_equipe() to service_role;
grant execute on function public.tg_auditar_projeto_de_equipe() to service_role;
grant execute on function public.tg_auditar_permissao() to service_role;
grant execute on function public.lidera_equipe(uuid) to authenticated, service_role;
grant execute on function public.projetos_das_equipes(uuid, uuid) to service_role;
grant execute on function public.acesso_do_membro(uuid, uuid) to authenticated, service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Leitura por membro da organização; escrita por owner/admin (padrão 4),
-- mais o líder nos membros comuns da própria equipe. Sem DELETE de equipe
-- nem de membro: arquivar e revogar.
alter table public.work_teams enable row level security;
alter table public.work_team_members enable row level security;
alter table public.work_team_properties enable row level security;

create policy work_teams_select on public.work_teams
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy work_teams_admin_insert on public.work_teams
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy work_teams_admin_update on public.work_teams
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy work_team_members_select on public.work_team_members
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy work_team_members_admin_insert on public.work_team_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy work_team_members_admin_update on public.work_team_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

-- O líder não mexe em outro líder (USING) nem promove ninguém (WITH CHECK).
create policy work_team_members_lider_insert on public.work_team_members
  for insert to authenticated
  with check (public.lidera_equipe(team_id) and team_role = 'membro');

create policy work_team_members_lider_update on public.work_team_members
  for update to authenticated
  using (public.lidera_equipe(team_id) and team_role = 'membro')
  with check (public.lidera_equipe(team_id) and team_role = 'membro');

create policy work_team_properties_select on public.work_team_properties
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy work_team_properties_admin_insert on public.work_team_properties
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy work_team_properties_admin_update on public.work_team_properties
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']))
  with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy work_team_properties_admin_delete on public.work_team_properties
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy billing_access_restrictive on public.work_teams
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

create policy billing_access_restrictive on public.work_team_members
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

create policy billing_access_restrictive on public.work_team_properties
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

revoke all on public.work_teams from anon, authenticated;
revoke all on public.work_team_members from anon, authenticated;
revoke all on public.work_team_properties from anon, authenticated;
grant select, insert, update on public.work_teams to authenticated;
grant select, insert, update on public.work_team_members to authenticated;
grant select, insert, update, delete on public.work_team_properties to authenticated;
grant all on public.work_teams to service_role;
grant all on public.work_team_members to service_role;
grant all on public.work_team_properties to service_role;
