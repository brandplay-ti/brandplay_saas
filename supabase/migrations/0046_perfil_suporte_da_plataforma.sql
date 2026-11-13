-- 0046_perfil_suporte_da_plataforma.sql
--
-- Perfil Suporte na equipe da plataforma (BP-4, ADR-0008 atualizada).
--
-- Até aqui a equipe do BrandPlay tinha um papel só: o superadmin (0027), que lê
-- a cobrança e o faturamento de todos os clientes e opera planos e IA. O
-- Suporte atende clientes no dia a dia sem ver o negócio como um todo:
--
--   pode      listar os clientes, abrir a ficha de cada um (cobrança, faturas,
--             descontos, histórico), lançar e revogar desconto, dar baixa em
--             fatura em aberto e abrir sessão de suporte (ver como admin, 0035);
--   não pode  faturamento (realizado, MRR, projeção), visão geral, planos, IA,
--             liberação provisória, extensão de teste, troca do tipo de cliente
--             nem a gestão da equipe.
--
-- Decisões:
--
--   1. O papel é uma coluna de `platform_admins` (`superadmin` | `suporte`). A
--      tabela passa a ser a equipe da plataforma; continua sem policy de
--      escrita para `authenticated`.
--   2. `is_platform_admin()` passa a ser SÓ o superadmin. Toda policy e função
--      que já a usavam (cobrança, auditoria, faturamento, IA, logs) continuam
--      fechadas para o Suporte sem precisar mudar. O que o Suporte também faz
--      usa a nova `is_platform_staff()` / `platform_staff_require()`.
--   3. O superadmin concede e revoga Suporte pela tela (`admin_equipe_*`).
--      Superadmin continua concedido só à mão, por quem opera o banco
--      (`platform_admin_grant`): nenhuma função executável por `authenticated`
--      grava `role = 'superadmin'`, nem rebaixa ou revoga um superadmin.
--   4. No `admin_clientes()` o MRR por cliente é faturamento: volta nulo para o
--      Suporte.
--   5. Conta nova de Suporte não ganha organização pessoal. O gatilho
--      `handle_new_user` cria uma para todo cadastro sem convite; a
--      `admin-team` grava antes um pré-cadastro (`platform_staff_signups`, só
--      pelo superadmin, válido por 15 minutos) e o gatilho o reconhece, como já
--      faz com o convite de patrocinador (0022). O sinal não é forjável: quem se
--      cadastra não escreve nessa tabela.
--   6. Tudo continua auditado em `platform_admin_audit_log`.

-- ─── Papel ───────────────────────────────────────────────────────────
alter table public.platform_admins
  add column role text not null default 'superadmin';

alter table public.platform_admins
  add constraint platform_admins_role_check check (role in ('superadmin', 'suporte'));

comment on column public.platform_admins.role is
  'superadmin: cobrança, faturamento, planos, IA e equipe. suporte: clientes, pagamentos, descontos e sessão de suporte (0046).';

comment on table public.platform_admins is
  'Equipe da plataforma (ADR-0008): superadmin e suporte. Escrita só pelo servidor; superadmin concedido à mão, suporte pelo superadmin (0046).';

-- ─── Quem é quem ─────────────────────────────────────────────────────
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
       and pa.role = 'superadmin'
  );
$$;

comment on function public.is_platform_admin() is
  'Verdadeiro quando o usuário autenticado é SUPERADMIN ativo da plataforma (ADR-0008). O Suporte (0046) não passa.';

create or replace function public.is_platform_staff()
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

comment on function public.is_platform_staff() is
  'Verdadeiro para superadmin ou suporte ativo da plataforma (0046).';

create or replace function public.platform_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pa.role
    from public.platform_admins pa
   where pa.user_id = auth.uid()
     and pa.revoked_at is null;
$$;

comment on function public.platform_role() is
  'Papel do usuário autenticado na equipe da plataforma (superadmin, suporte) ou nulo. Só experiência: a fronteira são as funções e policies.';

create or replace function public.platform_staff_require()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_staff() then
    raise exception 'Acesso restrito à equipe da plataforma.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.platform_staff_require() is
  'Erro insufficient_privilege quando quem chama não é superadmin nem suporte ativo (0046).';

-- ─── Concessão manual do superadmin ──────────────────────────────────
-- Corpo da 0027 com o papel: conceder superadmin a quem já é suporte promove.
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

  insert into public.platform_admins (user_id, comment, role)
  values (_user_id, btrim(_comment), 'superadmin')
  on conflict (user_id) do update
    set comment = excluded.comment,
        role = 'superadmin',
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

-- ─── Equipe pela tela (só superadmin) ────────────────────────────────
create or replace function public.admin_equipe()
returns table (
  user_id         uuid,
  email           text,
  full_name       text,
  role            text,
  comment         text,
  created_at      timestamptz,
  revoked_at      timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  perform public.platform_admin_require();

  return query
  select pa.user_id,
         u.email::text,
         nullif(p.full_name, ''),
         pa.role,
         pa.comment,
         pa.created_at,
         pa.revoked_at,
         u.last_sign_in_at
    from public.platform_admins pa
    join auth.users u on u.id = pa.user_id
    left join public.profiles p on p.id = pa.user_id
   order by (pa.revoked_at is null) desc, pa.role, lower(u.email);
end;
$$;

comment on function public.admin_equipe() is
  'Equipe da plataforma (superadmin e suporte, ativos e revogados). Só superadmin.';

-- ─── Pré-cadastro: conta da equipe sem organização pessoal ──────────
create table public.platform_staff_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  created_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint platform_staff_signups_email_check check (position('@' in email) > 1),
  constraint platform_staff_signups_prazo_check check (
    expires_at > created_at and expires_at <= created_at + interval '15 minutes'
  )
);

comment on table public.platform_staff_signups is
  'Pré-cadastro de conta da equipe da plataforma (0046): o gatilho handle_new_user não cria organização pessoal para o e-mail. Só o servidor lê e escreve.';

create index platform_staff_signups_email_idx
  on public.platform_staff_signups (lower(email))
  where consumed_at is null;

create trigger platform_staff_signups_updated_at before update on public.platform_staff_signups
  for each row execute function public.update_updated_at_column();

alter table public.platform_staff_signups enable row level security;
revoke all on public.platform_staff_signups from anon, authenticated;
grant all on public.platform_staff_signups to service_role;

create or replace function public.admin_equipe_pre_cadastro(_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _limpo text := lower(btrim(coalesce(_email, '')));
begin
  perform public.platform_admin_require();
  if position('@' in _limpo) < 2 then
    raise exception 'E-mail inválido.' using errcode = 'check_violation';
  end if;
  insert into public.platform_staff_signups (email, created_by, expires_at)
  values (_limpo, auth.uid(), now() + interval '15 minutes');
end;
$$;

comment on function public.admin_equipe_pre_cadastro(text) is
  'Marca o e-mail para a conta nova da equipe nascer sem organização pessoal (15 min). Só superadmin (0046).';

-- Corpo da 0043; pré-cadastro da equipe pendente não cria organização pessoal.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare _org_id uuid; _invite record; _tipo text;
begin
  insert into public.profiles (id, full_name, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', '')
  );
  insert into public.user_roles (user_id, role) values (new.id, 'comercial');

  -- aceita convite pendente para organização, se houver
  select * into _invite from public.organization_invites
   where lower(email) = lower(new.email) and status = 'pendente' and expires_at > now()
   order by created_at desc limit 1;

  if found then
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_invite.organization_id, new.id, _invite.role, 'ativo')
    on conflict do nothing;
    update public.organization_invites
       set status = 'aceito', accepted_at = now(), accepted_user_id = new.id
     where id = _invite.id;
  elsif exists (
    select 1 from public.sponsor_invites si
     where lower(si.email) = lower(new.email)
       and si.status = 'pendente'
       and si.expires_at > now()
  ) then
    -- patrocinador convidado: o acesso vem de accept_sponsor_invite_by_token
    null;
  elsif exists (
    select 1 from public.platform_staff_signups ps
     where lower(ps.email) = lower(new.email)
       and ps.consumed_at is null
       and ps.expires_at > now()
  ) then
    -- equipe da plataforma (0046): o acesso vem de platform_admins
    null;
  else
    _tipo := case when new.raw_user_meta_data->>'client_type' = 'marca' then 'marca' else 'agencia' end;
    -- cria a organização pessoal (on_organization_created já insere o owner)
    insert into public.organizations (name, owner_id, client_type)
    values (coalesce(nullif(new.raw_user_meta_data->>'company', ''), 'Minha empresa'), new.id, _tipo)
    returning id into _org_id;
    insert into public.organization_members (organization_id, user_id, role, status)
    values (_org_id, new.id, 'owner', 'ativo')
    on conflict do nothing;
  end if;
  return new;
end $function$;

-- Concede (ou reativa) Suporte a uma conta existente, por e-mail. A conta nova
-- é criada antes pela Edge Function `admin-team`. Nunca grava superadmin e não
-- rebaixa um superadmin ativo.
create or replace function public.admin_equipe_conceder_suporte(_email text, _comentario text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _user_id uuid;
  _antes   public.platform_admins;
begin
  perform public.platform_admin_require();
  if char_length(btrim(coalesce(_comentario, ''))) < 3 then
    raise exception 'Informe o motivo da concessão.' using errcode = 'check_violation';
  end if;

  select u.id into _user_id from auth.users u where lower(u.email) = lower(btrim(_email));
  if _user_id is null then
    raise exception 'Nenhuma conta com esse e-mail.' using errcode = 'no_data_found';
  end if;

  update public.platform_staff_signups
     set consumed_at = now()
   where lower(email) = lower(btrim(_email)) and consumed_at is null;

  select * into _antes from public.platform_admins where user_id = _user_id;
  if _antes.user_id is not null and _antes.role = 'superadmin' and _antes.revoked_at is null then
    raise exception 'Essa pessoa já é superadmin da plataforma.' using errcode = 'check_violation';
  end if;
  if _antes.user_id is not null and _antes.role = 'suporte' and _antes.revoked_at is null then
    return _user_id;
  end if;

  insert into public.platform_admins (user_id, comment, role)
  values (_user_id, btrim(_comentario), 'suporte')
  on conflict (user_id) do update
    set comment = excluded.comment,
        role = 'suporte',
        revoked_at = null;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'suporte_concedido', 'platform_admin', _user_id::text,
     case when _antes.user_id is null then null else to_jsonb(_antes) end,
     (select to_jsonb(pa) from public.platform_admins pa where pa.user_id = _user_id),
     btrim(_comentario));

  return _user_id;
end;
$$;

comment on function public.admin_equipe_conceder_suporte(text, text) is
  'Concede ou reativa o perfil suporte para a conta do e-mail. Só superadmin; nunca grava superadmin; auditado (0046).';

create or replace function public.admin_equipe_revogar_suporte(_user_id uuid, _comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _antes public.platform_admins;
begin
  perform public.platform_admin_require();
  if char_length(btrim(coalesce(_comentario, ''))) < 3 then
    raise exception 'Informe o motivo da revogação.' using errcode = 'check_violation';
  end if;

  select * into _antes from public.platform_admins where user_id = _user_id;
  if _antes.user_id is null or _antes.revoked_at is not null then
    raise exception 'Nenhum suporte ativo com esse usuário.' using errcode = 'no_data_found';
  end if;
  if _antes.role <> 'suporte' then
    raise exception 'Superadmin só é revogado por quem opera o banco.' using errcode = 'insufficient_privilege';
  end if;

  update public.platform_admins set revoked_at = now() where user_id = _user_id;

  -- A sessão de suporte aberta acaba junto (ela já não valeria: 0035 exige
  -- vínculo ativo), para a lista de sessões não mostrar uma aberta.
  update public.platform_support_sessions
     set ended_at = now()
   where admin_user_id = _user_id and ended_at is null;

  insert into public.platform_admin_audit_log
    (admin_user_id, action, target_type, target_id, before, after, comment)
  values
    (auth.uid(), 'suporte_revogado', 'platform_admin', _user_id::text, to_jsonb(_antes),
     (select to_jsonb(pa) from public.platform_admins pa where pa.user_id = _user_id),
     btrim(_comentario));
end;
$$;

comment on function public.admin_equipe_revogar_suporte(uuid, text) is
  'Revoga o perfil suporte (nunca um superadmin) e encerra a sessão de suporte aberta. Só superadmin; auditado (0046).';

-- ─── Clientes: equipe inteira; MRR só para o superadmin ──────────────
-- Corpo da 0039 com a guarda da equipe e o MRR nulo para o Suporte.
create or replace function public.admin_clientes()
returns table (
  organization_id        uuid,
  name                   text,
  created_at             timestamptz,
  owner_name             text,
  owner_email            text,
  access_source          text,
  plan_id                text,
  plan_name              text,
  subscription_status    text,
  payment_method         text,
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean,
  provisional_expires_at timestamptz,
  mrr_cents              integer,
  properties             integer,
  users_active           integer,
  invites_pending        integer,
  open_invoices          integer,
  last_paid_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
declare
  _ve_faturamento boolean;
begin
  perform public.platform_staff_require();
  _ve_faturamento := public.is_platform_admin();

  return query
  select
    o.id,
    o.name,
    o.created_at,
    nullif(p.full_name, ''),
    u.email::text,
    case
      when sub.status in ('ativa', 'trialing', 'inadimplente') then 'subscription'
      when public.billing_isencao_ate(o.id) is not null then 'exemption'
      when acc.organization_id is null or acc.trial_ends_at > now() then 'trial'
      when gr.expires_at is not null then 'provisional'
      else 'none'
    end,
    ap.id,
    ap.name,
    sub.status,
    sub.payment_method,
    acc.trial_ends_at,
    sub.current_period_end,
    coalesce(sub.cancel_at_period_end, false),
    gr.expires_at,
    case
      when not _ve_faturamento then null
      when sub.status in ('ativa', 'inadimplente') then coalesce(sp.price_cents, 0)
      else 0
    end,
    us.properties,
    us.users_active,
    us.invites_pending,
    (select count(*)::integer from public.billing_invoices i
      where i.organization_id = o.id and i.status = 'aberta'),
    (select max(i.paid_at) from public.billing_invoices i
      where i.organization_id = o.id and i.status = 'paga')
  from public.organizations o
  left join public.profiles p on p.id = o.owner_id
  left join auth.users u on u.id = o.owner_id
  left join public.billing_accounts acc on acc.organization_id = o.id
  left join lateral (
    select s.*
      from public.billing_subscriptions s
     where s.organization_id = o.id
     order by (s.status in ('incompleta', 'trialing', 'ativa', 'inadimplente')) desc, s.created_at desc
     limit 1
  ) sub on true
  left join public.billing_plans sp on sp.id = sub.plan_id
  left join lateral (
    select g.expires_at
      from public.billing_access_grants g
     where g.organization_id = o.id
       and g.revoked_at is null
       and g.expires_at > now()
     order by g.expires_at desc
     limit 1
  ) gr on true
  left join lateral public.billing_access_plan(o.id) ap on true
  left join lateral public.billing_usage(o.id) us on true
  order by o.created_at desc;
end;
$$;

comment on function public.admin_clientes() is
  'Organizações com estado de cobrança e contagens de uso. Equipe da plataforma; mrr_cents só para o superadmin (nulo para o suporte).';

-- ─── Ficha do cliente: equipe inteira ────────────────────────────────
-- Corpo da 0039; só a guarda muda. Os pagamentos da ficha são o que o Suporte
-- precisa ver para dar baixa e lançar desconto.
create or replace function public.admin_cliente_detalhe(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  _org     public.organizations;
  _acc     public.billing_accounts;
  _plan    public.billing_plans;
  _usage   record;
  _isencao timestamptz;
  _source  text;
begin
  perform public.platform_staff_require();

  select * into _org from public.organizations where id = _org_id;
  if _org.id is null then
    return null;
  end if;

  select * into _acc from public.billing_accounts where organization_id = _org_id;
  _plan := public.billing_access_plan(_org_id);
  select * into _usage from public.billing_usage(_org_id);
  _isencao := public.billing_isencao_ate(_org_id);

  if exists (
    select 1 from public.billing_subscriptions s
     where s.organization_id = _org_id and s.status in ('ativa', 'trialing', 'inadimplente')
  ) then
    _source := 'subscription';
  elsif _isencao is not null then
    _source := 'exemption';
  elsif _acc.organization_id is null or _acc.trial_ends_at > now() then
    _source := 'trial';
  elsif exists (
    select 1 from public.billing_access_grants g
     where g.organization_id = _org_id and g.revoked_at is null and g.expires_at > now()
  ) then
    _source := 'provisional';
  else
    _source := 'none';
  end if;

  return jsonb_build_object(
    'organization', jsonb_build_object(
      'id', _org.id,
      'name', _org.name,
      'legal_name', _org.legal_name,
      'trade_name', _org.trade_name,
      'cnpj', _org.cnpj,
      'email', _org.email,
      'phone', _org.phone,
      'city', _org.address_city,
      'state', _org.address_state,
      'created_at', _org.created_at,
      'owner', (
        select jsonb_build_object('id', u.id, 'name', nullif(p.full_name, ''), 'email', u.email)
          from auth.users u
          left join public.profiles p on p.id = u.id
         where u.id = _org.owner_id
      )
    ),
    'billing', jsonb_build_object(
      'access', _source <> 'none',
      'access_source', _source,
      'trial_ends_at', _acc.trial_ends_at,
      'exemption_ends_at', _isencao,
      'stripe_customer_id', _acc.stripe_customer_id,
      'plan', case when _plan.id is null then null else jsonb_build_object(
        'id', _plan.id,
        'name', _plan.name,
        'price_cents', _plan.price_cents,
        'max_properties', _plan.max_properties,
        'max_users', _plan.max_users
      ) end
    ),
    'usage', jsonb_build_object(
      'properties', _usage.properties,
      'users_active', _usage.users_active,
      'invites_pending', _usage.invites_pending
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'plan_id', s.plan_id,
        'plan_name', pl.name,
        'status', s.status,
        'payment_method', s.payment_method,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'canceled_at', s.canceled_at,
        'stripe_subscription_id', s.stripe_subscription_id,
        'created_at', s.created_at
      ) order by s.created_at desc)
        from public.billing_subscriptions s
        left join public.billing_plans pl on pl.id = s.plan_id
       where s.organization_id = _org_id
    ), '[]'::jsonb),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'number', i.number,
        'status', i.status,
        'payment_method', i.payment_method,
        'amount_cents', i.amount_cents,
        'currency', i.currency,
        'due_at', i.due_at,
        'paid_at', i.paid_at,
        'hosted_invoice_url', i.hosted_invoice_url,
        'invoice_pdf_url', i.invoice_pdf_url,
        'created_at', i.created_at
      ) order by i.created_at desc)
        from public.billing_invoices i
       where i.organization_id = _org_id
    ), '[]'::jsonb),
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'kind', g.kind,
        'comment', g.comment,
        'stripe_invoice_id', g.stripe_invoice_id,
        'has_receipt', g.receipt_path is not null,
        'granted_by_email', gu.email,
        'expires_at', g.expires_at,
        'revoked_at', g.revoked_at,
        'active', g.revoked_at is null and g.expires_at > now(),
        'created_at', g.created_at
      ) order by g.created_at desc)
        from public.billing_access_grants g
        left join auth.users gu on gu.id = g.granted_by
       where g.organization_id = _org_id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'action', l.action,
        'admin_email', au.email,
        'comment', l.comment,
        'before', l.before,
        'after', l.after,
        'created_at', l.created_at
      ) order by l.created_at desc)
        from (
          select * from public.platform_admin_audit_log
           where organization_id = _org_id
           order by created_at desc
           limit 50
        ) l
        left join auth.users au on au.id = l.admin_user_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ─── Tipo de cliente: leitura pela equipe; troca continua superadmin ─
create or replace function public.admin_tipos_de_cliente()
returns table (organization_id uuid, client_type text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.platform_staff_require();
  return query select o.id, o.client_type from public.organizations o;
end;
$$;

create or replace function public.admin_tipo_de_cliente(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _tipo text;
begin
  perform public.platform_staff_require();

  select client_type into _tipo from public.organizations where id = _org_id;
  if _tipo is null then
    return null;
  end if;

  return jsonb_build_object(
    'client_type', _tipo,
    'open_opportunities', (
      select count(*) from public.opportunities
       where organization_id = _org_id and stage not in ('fechado', 'perdido')
    ),
    'proposals', (select count(*) from public.proposals where organization_id = _org_id),
    'published_properties', (
      select count(*) from public.sports_properties
       where organization_id = _org_id and is_published
    ),
    'leads', (select count(*) from public.property_leads where organization_id = _org_id)
  );
end;
$$;

-- ─── Sessão de suporte: equipe inteira ───────────────────────────────
-- Corpos da 0035 com a guarda da equipe. `sessao_suporte_vigente` já aceita
-- qualquer vínculo ativo em `platform_admins` e não muda.
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
  perform public.platform_staff_require();
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
  perform public.platform_staff_require();
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
  if not public.is_platform_staff() then
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

-- ─── RLS: o que o Suporte lê direto ──────────────────────────────────
-- Descontos da ficha do cliente. As demais tabelas de cobrança o Suporte lê só
-- pela ficha (`admin_cliente_detalhe`); a leitura direta continua do superadmin.
drop policy if exists billing_discounts_platform_admin_read on public.billing_discounts;
create policy billing_discounts_platform_staff_read on public.billing_discounts
  for select to authenticated
  using (public.is_platform_staff());

drop policy if exists platform_support_sessions_own_read on public.platform_support_sessions;
create policy platform_support_sessions_own_read on public.platform_support_sessions
  for select to authenticated
  using (admin_user_id = auth.uid() and public.is_platform_staff());

-- ─── Permissões das funções ──────────────────────────────────────────
revoke all on function public.is_platform_staff() from public, anon;
revoke all on function public.platform_role() from public, anon;
revoke all on function public.platform_staff_require() from public, anon;
revoke all on function public.admin_equipe() from public, anon;
revoke all on function public.admin_equipe_conceder_suporte(text, text) from public, anon;
revoke all on function public.admin_equipe_revogar_suporte(uuid, text) from public, anon;
revoke all on function public.admin_equipe_pre_cadastro(text) from public, anon;
grant execute on function public.admin_equipe_pre_cadastro(text) to authenticated, service_role;

grant execute on function public.is_platform_staff() to authenticated, service_role;
grant execute on function public.platform_role() to authenticated, service_role;
grant execute on function public.platform_staff_require() to authenticated, service_role;
grant execute on function public.admin_equipe() to authenticated, service_role;
grant execute on function public.admin_equipe_conceder_suporte(text, text) to authenticated, service_role;
grant execute on function public.admin_equipe_revogar_suporte(uuid, text) to authenticated, service_role;

insert into migrations.schema_migrations (version)
values ('0046_perfil_suporte_da_plataforma');
