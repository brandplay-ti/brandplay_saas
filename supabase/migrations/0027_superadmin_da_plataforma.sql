-- 0027_superadmin_da_plataforma.sql
--
-- Superadmin da plataforma (ADR-0008, docs/architecture/plano-superadmin.md).
--
-- Até aqui ninguém operava a plataforma por dentro: liberar acesso, estender
-- teste ou mexer em plano era SQL no Studio. O superadmin é quem opera o
-- BrandPlay como negócio — vê os clientes, a cobrança e o faturamento — sem
-- ser membro das organizações.
--
-- Decisões (ADR-0008):
--
--   1. O papel vive em tabela própria (`platform_admins`), e não numa coluna de
--      `profiles`: a policy `profiles_own_write` deixa cada usuário editar o
--      próprio perfil, e uma coluna ali seria autoconcessão. Aqui ninguém pela
--      API escreve — só `service_role` e as funções de concessão abaixo, que
--      `authenticated` não executa.
--   2. A concessão NÃO está nesta migration. No central-check a 0054 criava o
--      superusuário com senha escrita e rodava também em produção; aqui a
--      concessão é um ato operado à mão, por e-mail, com comentário
--      (`supabase/tools/conceder-superadmin.sql` ou o SQL Editor). Superadmin
--      com senha conhecida só existe no seed local.
--   3. Menor privilégio: este papel NÃO abre leitura de dado de domínio dos
--      clientes (patrocinadores, contratos, propostas). O que ele lê vem pelas
--      funções e policies da 0028, todas escopadas em cobrança e contagens.
--   4. Toda ação administrativa deixa registro em `platform_admin_audit_log`:
--      quem, quando, organização, ação, antes, depois e comentário.

-- ─── Superadmins ─────────────────────────────────────────────────────
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Motivo da concessão. Quem concedeu e quando ficam na auditoria.
  comment    text not null,
  -- Revogar é preencher, nunca apagar: a linha é o histórico do vínculo.
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_comment_check check (nullif(btrim(comment), '') is not null)
);

comment on table public.platform_admins is
  'Superadmins da plataforma (ADR-0008). Escrita só pelo servidor; concessão operada à mão, com comentário.';

create trigger platform_admins_updated_at before update on public.platform_admins
  for each row execute function public.update_updated_at_column();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.platform_admins pa
     where pa.user_id = auth.uid()
       and pa.revoked_at is null
  );
$$;

comment on function public.is_platform_admin() is
  'Verdadeiro quando o usuário autenticado é superadmin ativo da plataforma (ADR-0008).';

-- ─── Auditoria ───────────────────────────────────────────────────────
-- Registro imutável: sem `updated_at`, sem policy de escrita, e as funções que
-- gravam aqui só inserem. Dado da PLATAFORMA, não da organização — por isso
-- fica fora da policy restritiva de cobrança (0026) e do teste (m).
create table public.platform_admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  -- Quem agiu. Nulo = ato operado à mão, sem sessão (concessão por script).
  admin_user_id   uuid null,
  action          text not null,
  -- Organização afetada, quando a ação é sobre uma. `set null` preserva o
  -- registro se a organização for apagada; o `before`/`after` guarda o resto.
  organization_id uuid null references public.organizations (id) on delete set null,
  -- O que foi alterado: 'billing_plan' + id do plano, 'platform_admin' + id do
  -- usuário, 'billing_access_grant' + id da liberação...
  target_type     text null,
  target_id       text null,
  before          jsonb null,
  after           jsonb null,
  comment         text null,
  created_at      timestamptz not null default now()
);

comment on table public.platform_admin_audit_log is
  'Ações administrativas da plataforma (ADR-0008): quem, quando, organização, ação, antes, depois e comentário. Imutável.';

create index platform_admin_audit_log_created_idx
  on public.platform_admin_audit_log (created_at desc);
create index platform_admin_audit_log_org_idx
  on public.platform_admin_audit_log (organization_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
alter table public.platform_admin_audit_log enable row level security;

-- Cada um enxerga o próprio vínculo. A tela pergunta por `is_platform_admin()`,
-- que não depende desta policy; ela existe para o vínculo não ser opaco a quem
-- o tem.
create policy platform_admins_own_read on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid());

create policy platform_admin_audit_log_platform_admin_read on public.platform_admin_audit_log
  for select to authenticated
  using (public.is_platform_admin());

revoke all on public.platform_admins, public.platform_admin_audit_log from anon, authenticated;
grant select on public.platform_admins, public.platform_admin_audit_log to authenticated;
grant all on public.platform_admins, public.platform_admin_audit_log to service_role;

-- ─── Concessão e revogação (operadas à mão) ─────────────────────────
-- Por e-mail, com comentário. A pessoa precisa ter conta (cadastro normal pelo
-- portal); a função não cria usuário nem senha.
--
-- Executáveis só por quem opera o banco (`postgres` no SQL Editor,
-- `supabase_admin` no psql, `service_role`). `authenticated` não executa:
-- ninguém se promove pela API — nem um superadmin promove outro pela tela.
create or replace function public.platform_admin_grant(_email text, _comment text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _user_id uuid;
  _antes   public.platform_admins;
begin
  if nullif(btrim(_comment), '') is null then
    raise exception 'Informe o motivo da concessão.' using errcode = 'check_violation';
  end if;

  select u.id into _user_id from auth.users u where lower(u.email) = lower(btrim(_email));
  if _user_id is null then
    raise exception 'Nenhuma conta com o e-mail %. A pessoa precisa se cadastrar antes.', _email
      using errcode = 'no_data_found';
  end if;

  select * into _antes from public.platform_admins where user_id = _user_id;

  insert into public.platform_admins (user_id, comment)
  values (_user_id, btrim(_comment))
  on conflict (user_id) do update
    set comment = excluded.comment,
        revoked_at = null;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, target_type, target_id, before, after, comment)
  values
    (null, 'superadmin_concedido', 'platform_admin', _user_id::text,
     case when _antes.user_id is null then null else to_jsonb(_antes) end,
     (select to_jsonb(pa) from public.platform_admins pa where pa.user_id = _user_id),
     btrim(_comment));

  return _user_id;
end;
$$;

comment on function public.platform_admin_grant(text, text) is
  'Torna superadmin a conta com o e-mail informado (ou reativa). Operado à mão; registra na auditoria.';

create or replace function public.platform_admin_revoke(_email text, _comment text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _user_id uuid;
  _antes   public.platform_admins;
begin
  if nullif(btrim(_comment), '') is null then
    raise exception 'Informe o motivo da revogação.' using errcode = 'check_violation';
  end if;

  select pa.* into _antes
    from public.platform_admins pa
    join auth.users u on u.id = pa.user_id
   where lower(u.email) = lower(btrim(_email))
     and pa.revoked_at is null;
  if _antes.user_id is null then
    raise exception 'Nenhum superadmin ativo com o e-mail %.', _email using errcode = 'no_data_found';
  end if;

  update public.platform_admins set revoked_at = now() where user_id = _antes.user_id;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, target_type, target_id, before, after, comment)
  values
    (null, 'superadmin_revogado', 'platform_admin', _antes.user_id::text, to_jsonb(_antes),
     (select to_jsonb(pa) from public.platform_admins pa where pa.user_id = _antes.user_id),
     btrim(_comment));

  return _antes.user_id;
end;
$$;

comment on function public.platform_admin_revoke(text, text) is
  'Revoga o superadmin da conta com o e-mail informado. Operado à mão; registra na auditoria.';

-- ─── Permissões das funções ──────────────────────────────────────────
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;

revoke all on function public.platform_admin_grant(text, text) from public, anon, authenticated;
revoke all on function public.platform_admin_revoke(text, text) from public, anon, authenticated;
grant execute on function public.platform_admin_grant(text, text) to postgres, service_role;
grant execute on function public.platform_admin_revoke(text, text) to postgres, service_role;
