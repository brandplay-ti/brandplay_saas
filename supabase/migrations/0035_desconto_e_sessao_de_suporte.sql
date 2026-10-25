-- Desconto comercial e sessão de suporte do superadmin.
--
-- Desconto: percentual de 1 a 100 por 1 a 12 meses. 100% é a isenção.
-- A linha nasce aqui; o cupom no Stripe é gravado pela Edge Function
-- `admin-discounts`. Sem assinatura vigente, o cupom entra no próximo checkout.
--
-- Sessão de suporte: por no máximo 8 horas o superadmin passa em
-- `is_org_member` e em `has_org_role` quando o papel exigido inclui `admin`.
-- Não vira owner. Não abre outra organização. Expira sozinha. Tudo auditado.
-- Não é `or is_platform_admin()` nas policies de domínio.

create table public.billing_discounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  percent_off integer not null,
  duration_months integer not null,
  comment text not null,
  stripe_coupon_id text,
  stripe_status text not null default 'pendente',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_discounts_percent_check check (percent_off between 1 and 100),
  constraint billing_discounts_months_check check (duration_months between 1 and 12),
  constraint billing_discounts_comment_check check (char_length(btrim(comment)) >= 3),
  constraint billing_discounts_status_check check (
    stripe_status in ('pendente', 'aplicado', 'aguardando_checkout', 'falhou', 'revogado')
  )
);

comment on table public.billing_discounts is
  'Desconto ou isenção (100%) concedido pelo superadmin. O Stripe recebe um cupom recorrente pelo mesmo prazo.';

create index billing_discounts_org_idx
  on public.billing_discounts (organization_id, created_at desc);

create table public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  comment text not null,
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_support_sessions_comment_check check (char_length(btrim(comment)) >= 3),
  constraint platform_support_sessions_prazo_check check (
    expires_at > created_at and expires_at <= created_at + interval '8 hours'
  )
);

comment on table public.platform_support_sessions is
  'Sessão em que o superadmin vê uma organização como admin, com prazo máximo de 8 horas.';

create unique index platform_support_sessions_uma_aberta
  on public.platform_support_sessions (admin_user_id)
  where ended_at is null;

create index platform_support_sessions_lookup
  on public.platform_support_sessions (admin_user_id, organization_id)
  where ended_at is null;

-- ─── Sessão vigente ──────────────────────────────────────────────────
create or replace function public.sessao_suporte_vigente(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.platform_support_sessions s
      join public.platform_admins pa
        on pa.user_id = s.admin_user_id
       and pa.revoked_at is null
     where s.admin_user_id = auth.uid()
       and s.organization_id = target_org_id
       and s.ended_at is null
       and s.expires_at > now()
  );
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.organization_members om
     where om.organization_id = target_org_id
       and om.user_id = auth.uid()
       and om.status = 'ativo'
  )
  or public.sessao_suporte_vigente(target_org_id);
$$;

comment on function public.is_org_member(uuid) is
  'Membro ativo da organização, ou superadmin com sessão de suporte vigente nela (0035).';

create or replace function public.has_org_role(target_org_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from public.organization_members om
     where om.organization_id = target_org_id
       and om.user_id = auth.uid()
       and om.status = 'ativo'
       and om.role::text = any(allowed_roles)
  )
  or (
    public.sessao_suporte_vigente(target_org_id)
    and 'admin' = any(allowed_roles)
  );
$$;

comment on function public.has_org_role(uuid, text[]) is
  'Papel do membro ativo, ou admin quando há sessão de suporte vigente e admin está entre os papéis exigidos (0035). Não concede owner.';

-- ─── Abrir, encerrar, consultar ──────────────────────────────────────
create or replace function public.admin_abrir_sessao_suporte(
  _org_id uuid,
  _horas integer,
  _comentario text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _anterior uuid;
  _agora timestamptz := now();
  _sessao public.platform_support_sessions;
begin
  perform public.platform_admin_require();
  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo da sessão.' using errcode = 'check_violation';
  end if;
  if _horas is null or _horas < 1 or _horas > 8 then
    raise exception 'A sessão de suporte vai de 1 a 8 horas.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.organizations where id = _org_id) then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;

  select id into _anterior
    from public.platform_support_sessions
   where admin_user_id = auth.uid() and ended_at is null;

  if _anterior is not null then
    update public.platform_support_sessions
       set ended_at = now()
     where id = _anterior;
    insert into public.platform_admin_audit_log
      (admin_user_id, action, organization_id, target_type, target_id, comment)
    values
      (auth.uid(), 'sessao_suporte_substituida', _org_id, 'platform_support_session', _anterior::text,
       'Substituída por uma sessão nova. ' || btrim(_comentario));
  end if;

  insert into public.platform_support_sessions (admin_user_id, organization_id, comment, created_at, expires_at)
  values (auth.uid(), _org_id, btrim(_comentario), _agora, _agora + make_interval(hours => _horas))
  returning * into _sessao;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, after, comment)
  values
    (auth.uid(), 'sessao_suporte_aberta', _org_id, 'platform_support_session', _sessao.id::text,
     jsonb_build_object('expires_at', _sessao.expires_at, 'horas', _horas), btrim(_comentario));

  return jsonb_build_object(
    'id', _sessao.id,
    'organization_id', _sessao.organization_id,
    'expires_at', _sessao.expires_at
  );
end;
$$;

create or replace function public.admin_encerrar_sessao_suporte(_sessao_id uuid, _comentario text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes public.platform_support_sessions;
begin
  perform public.platform_admin_require();
  if nullif(btrim(_comentario), '') is null then
    raise exception 'Informe o motivo do encerramento.' using errcode = 'check_violation';
  end if;

  select * into _antes
    from public.platform_support_sessions
   where id = _sessao_id and admin_user_id = auth.uid();
  if _antes.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'no_data_found';
  end if;
  if _antes.ended_at is not null then
    return jsonb_build_object('id', _antes.id, 'ended_at', _antes.ended_at);
  end if;

  update public.platform_support_sessions
     set ended_at = now()
   where id = _sessao_id;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, organization_id, target_type, target_id, comment)
  values
    (auth.uid(), 'sessao_suporte_encerrada', _antes.organization_id, 'platform_support_session', _sessao_id::text,
     btrim(_comentario));

  return jsonb_build_object('id', _sessao_id, 'ended_at', now());
end;
$$;

create or replace function public.admin_sessao_suporte_ativa()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _id uuid;
  _org uuid;
  _nome text;
  _expira timestamptz;
begin
  if not public.is_platform_admin() then
    return null;
  end if;
  select s.id, s.organization_id, o.name, s.expires_at
    into _id, _org, _nome, _expira
    from public.platform_support_sessions s
    join public.organizations o on o.id = s.organization_id
   where s.admin_user_id = auth.uid()
     and s.ended_at is null
     and s.expires_at > now();
  if _id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', _id,
    'organization_id', _org,
    'organization_name', _nome,
    'expires_at', _expira
  );
end;
$$;

revoke all on function public.sessao_suporte_vigente(uuid) from public, anon;
revoke all on function public.admin_abrir_sessao_suporte(uuid, integer, text) from public, anon;
revoke all on function public.admin_encerrar_sessao_suporte(uuid, text) from public, anon;
revoke all on function public.admin_sessao_suporte_ativa() from public, anon;

grant execute on function public.sessao_suporte_vigente(uuid) to authenticated, service_role;
grant execute on function public.admin_abrir_sessao_suporte(uuid, integer, text) to authenticated, service_role;
grant execute on function public.admin_encerrar_sessao_suporte(uuid, text) to authenticated, service_role;
grant execute on function public.admin_sessao_suporte_ativa() to authenticated, service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.billing_discounts enable row level security;
alter table public.platform_support_sessions enable row level security;

create policy billing_discounts_admin_read on public.billing_discounts
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy billing_discounts_platform_admin_read on public.billing_discounts
  for select to authenticated
  using (public.is_platform_admin());

create policy platform_support_sessions_own_read on public.platform_support_sessions
  for select to authenticated
  using (admin_user_id = auth.uid() and public.is_platform_admin());

revoke all on public.billing_discounts, public.platform_support_sessions from anon, authenticated;
grant select on public.billing_discounts, public.platform_support_sessions to authenticated;
grant all on public.billing_discounts, public.platform_support_sessions to service_role;
