-- 0028_leitura_administrativa.sql
--
-- O que o superadmin (0027, ADR-0008) lê: a cobrança de todas as
-- organizações, o cadastro delas e CONTAGENS de uso. Nada de dado de domínio
-- dos clientes — patrocinadores, contratos, propostas e entregas continuam
-- só com os membros (e o portal do patrocinador).
--
--   policies  <billing_*>_platform_admin_read: leitura direta da projeção do
--             Stripe e das liberações. A escrita não muda: só o servidor.
--   funções   admin_clientes(), admin_cliente_detalhe(org),
--             admin_faturamento_realizado(meses), admin_faturamento_projetado(...)
--             SECURITY DEFINER, recusam quem não é superadmin com
--             `insufficient_privilege` — mesmo que alguém descubra o nome e as
--             chame pela API.
--
-- ─── Decisões de apuração (mesmas do central-check, 0027 de lá) ─────
--
-- Receita realizada é CAIXA: faturas `paga`, no mês do pagamento (`paid_at`).
-- Fatura em aberto ainda pode virar inadimplência.
--
-- MRR soma o preço do plano das assinaturas `ativa` e `inadimplente`:
-- inadimplência é problema de cobrança, não cancelamento. `trialing` e
-- `incompleta` ficam fora — nada foi contratado ainda. O preço é o do
-- catálogo hoje: assinatura antiga num preço arquivado entra pelo preço atual
-- (o Stripe guarda o preço real de cada uma).
--
-- Assinatura "que virou cliente": não está `incompleta` e, se terminou
-- `cancelada`, teve ao menos uma fatura paga. Contratação abandonada (boleto
-- vencido sem pagamento, `incomplete_expired` no Stripe) não é cliente nem
-- cancelamento. `created_at`/`canceled_at` reconstroem o passado; o `status`
-- é só o de hoje.
--
-- Crescimento e churn saem do histórico dos meses fechados. Sem histórico as
-- taxas são zero e a projeção repete o MRR de hoje — a resposta honesta para
-- quem ainda não tem série.

-- ─── RLS: o superadmin lê a cobrança da plataforma ───────────────────
create policy billing_accounts_platform_admin_read on public.billing_accounts
  for select to authenticated
  using (public.is_platform_admin());

create policy billing_subscriptions_platform_admin_read on public.billing_subscriptions
  for select to authenticated
  using (public.is_platform_admin());

create policy billing_invoices_platform_admin_read on public.billing_invoices
  for select to authenticated
  using (public.is_platform_admin());

create policy billing_access_grants_platform_admin_read on public.billing_access_grants
  for select to authenticated
  using (public.is_platform_admin());

-- ─── Guardas ─────────────────────────────────────────────────────────
create or replace function public.platform_admin_require()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao superadmin da plataforma.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.platform_admin_require() is
  'Erro insufficient_privilege quando quem chama não é superadmin ativo. Usada pelas funções admin_*.';

-- Assinatura que virou cliente (ver cabeçalho).
create or replace function public.billing_subscription_was_customer(_sub public.billing_subscriptions)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _sub.status <> 'incompleta'
     and (
       _sub.status <> 'cancelada'
       or exists (
         select 1 from public.billing_invoices i
          where i.subscription_id = _sub.id
            and i.status = 'paga'
       )
     );
$$;

-- ─── Clientes ────────────────────────────────────────────────────────
-- Uma linha por organização, com o estado da cobrança e as contagens de uso.
-- `access_source` segue a mesma regra de `billing_access_plan`/`billing_status`.
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
begin
  perform public.platform_admin_require();

  return query
  select
    o.id,
    o.name,
    o.created_at,
    nullif(p.full_name, ''),
    u.email::text,
    case
      when sub.status in ('ativa', 'trialing', 'inadimplente') then 'subscription'
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
    case when sub.status in ('ativa', 'inadimplente') then coalesce(sp.price_cents, 0) else 0 end,
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
  -- A assinatura em jogo primeiro; sem ela, a mais recente (histórico).
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
  'Organizações com estado de cobrança e contagens de uso, para a área administrativa. Só superadmin.';

-- ─── Detalhe do cliente ──────────────────────────────────────────────
-- Cadastro, cobrança (assinaturas, faturas, liberações), uso e o histórico de
-- ações administrativas da organização. Nulo quando ela não existe.
create or replace function public.admin_cliente_detalhe(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  _org    public.organizations;
  _acc    public.billing_accounts;
  _plan   public.billing_plans;
  _usage  record;
  _source text;
begin
  perform public.platform_admin_require();

  select * into _org from public.organizations where id = _org_id;
  if _org.id is null then
    return null;
  end if;

  select * into _acc from public.billing_accounts where organization_id = _org_id;
  _plan := public.billing_access_plan(_org_id);
  select * into _usage from public.billing_usage(_org_id);

  if exists (
    select 1 from public.billing_subscriptions s
     where s.organization_id = _org_id and s.status in ('ativa', 'trialing', 'inadimplente')
  ) then
    _source := 'subscription';
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

comment on function public.admin_cliente_detalhe(uuid) is
  'Detalhe de uma organização para a área administrativa: cadastro, cobrança, uso e auditoria. Só superadmin.';

-- ─── Faturamento realizado ───────────────────────────────────────────
create or replace function public.admin_faturamento_realizado(_meses integer default 12)
returns table (
  month             date,
  revenue_cents     bigint,
  paid_invoices     integer,
  customers         integer,
  new_subscriptions integer,
  cancellations     integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _n     integer := least(greatest(coalesce(_meses, 12), 1), 60);
  _atual date := date_trunc('month', now())::date;
begin
  perform public.platform_admin_require();

  return query
  with meses as (
    select gs::date as inicio, (gs + interval '1 month')::date as fim
      from generate_series((_atual - make_interval(months => _n - 1))::timestamp, _atual::timestamp, interval '1 month') gs
  ),
  clientes as (
    select s.organization_id, s.created_at, s.canceled_at
      from public.billing_subscriptions s
     where public.billing_subscription_was_customer(s)
  )
  select
    m.inicio,
    coalesce((select sum(i.amount_cents) from public.billing_invoices i
               where i.status = 'paga' and i.paid_at >= m.inicio and i.paid_at < m.fim), 0)::bigint,
    (select count(*) from public.billing_invoices i
      where i.status = 'paga' and i.paid_at >= m.inicio and i.paid_at < m.fim)::integer,
    (select count(distinct c.organization_id) from clientes c
      where c.created_at < m.fim and (c.canceled_at is null or c.canceled_at >= m.fim))::integer,
    (select count(*) from clientes c
      where c.created_at >= m.inicio and c.created_at < m.fim)::integer,
    (select count(*) from clientes c
      where c.canceled_at >= m.inicio and c.canceled_at < m.fim)::integer
  from meses m
  order by m.inicio;
end;
$$;

comment on function public.admin_faturamento_realizado(integer) is
  'Receita paga (caixa), faturas pagas, clientes, novas assinaturas e cancelamentos por mês. Centavos. Só superadmin.';

-- ─── Faturamento projetado ───────────────────────────────────────────
create or replace function public.admin_faturamento_projetado(_meses integer default 6, _historico integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _n          integer := least(greatest(coalesce(_meses, 6), 1), 24);
  _h          integer := least(greatest(coalesce(_historico, 6), 1), 36);
  _atual      date := date_trunc('month', now())::date;
  _mrr        bigint;
  _clientes   integer;
  _em_teste   integer;
  _aguardando integer;
  _base       numeric;
  _novas      numeric;
  _canc       numeric;
  _cresc      numeric;
  _churn      numeric;
begin
  perform public.platform_admin_require();

  select coalesce(sum(p.price_cents), 0), count(*)
    into _mrr, _clientes
    from public.billing_subscriptions s
    join public.billing_plans p on p.id = s.plan_id
   where s.status in ('ativa', 'inadimplente');

  -- Em teste = o teste grátis da plataforma (billing_accounts), sem assinatura
  -- com acesso. É o funil: quem pode virar cliente.
  select count(*) into _em_teste
    from public.organizations o
    left join public.billing_accounts a on a.organization_id = o.id
   where (a.organization_id is null or a.trial_ends_at > now())
     and not exists (
       select 1 from public.billing_subscriptions s
        where s.organization_id = o.id and s.status in ('ativa', 'trialing', 'inadimplente')
     );

  select count(*) into _aguardando
    from public.billing_subscriptions s
   where s.status = 'incompleta';

  -- Meses fechados: o corrente fica fora, porque meio mês de novas
  -- assinaturas puxaria a taxa para baixo.
  with meses as (
    select gs::date as inicio, (gs + interval '1 month')::date as fim
      from generate_series((_atual - make_interval(months => _h))::timestamp, (_atual - interval '1 month')::timestamp, interval '1 month') gs
  ),
  clientes as (
    select s.created_at, s.canceled_at
      from public.billing_subscriptions s
     where public.billing_subscription_was_customer(s)
  )
  select
    coalesce(sum((select count(*) from clientes c
                    where c.created_at < m.inicio and (c.canceled_at is null or c.canceled_at >= m.inicio))), 0),
    coalesce(sum((select count(*) from clientes c
                    where c.created_at >= m.inicio and c.created_at < m.fim)), 0),
    coalesce(sum((select count(*) from clientes c
                    where c.canceled_at >= m.inicio and c.canceled_at < m.fim)), 0)
    into _base, _novas, _canc
    from meses m;

  _cresc := case when _base > 0 then _novas / _base else 0 end;
  _churn := case when _base > 0 then _canc / _base else 0 end;

  return jsonb_build_object(
    'mrr_cents', _mrr,
    'customers', _clientes,
    'in_trial', _em_teste,
    'awaiting_payment', _aguardando,
    'average_ticket_cents', case when _clientes > 0 then round(_mrr::numeric / _clientes)::bigint else 0 end,
    'growth_rate', round(_cresc, 4),
    'churn_rate', round(_churn, 4),
    'history_months', _h,
    'months', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', (_atual + make_interval(months => n))::date,
        'base_cents', round(_mrr * power(greatest(1 + _cresc - _churn, 0), n))::bigint,
        'optimistic_cents', round(_mrr * power(1 + _cresc, n))::bigint,
        'pessimistic_cents', round(_mrr * power(greatest(1 - _churn, 0), n))::bigint,
        'customers', round(_clientes * power(greatest(1 + _cresc - _churn, 0), n))::integer
      ) order by n), '[]'::jsonb)
        from generate_series(1, _n) n
    )
  );
end;
$$;

comment on function public.admin_faturamento_projetado(integer, integer) is
  'MRR, clientes, funil e projeção de receita pelas taxas de crescimento e churn observadas. Centavos. Só superadmin.';

-- ─── Permissões ──────────────────────────────────────────────────────
revoke all on function public.platform_admin_require() from public, anon, authenticated;
revoke all on function public.billing_subscription_was_customer(public.billing_subscriptions) from public, anon, authenticated;
revoke all on function public.admin_clientes() from public, anon;
revoke all on function public.admin_cliente_detalhe(uuid) from public, anon;
revoke all on function public.admin_faturamento_realizado(integer) from public, anon;
revoke all on function public.admin_faturamento_projetado(integer, integer) from public, anon;

grant execute on function public.platform_admin_require() to service_role;
grant execute on function public.billing_subscription_was_customer(public.billing_subscriptions) to service_role;
grant execute on function public.admin_clientes() to authenticated, service_role;
grant execute on function public.admin_cliente_detalhe(uuid) to authenticated, service_role;
grant execute on function public.admin_faturamento_realizado(integer) to authenticated, service_role;
grant execute on function public.admin_faturamento_projetado(integer, integer) to authenticated, service_role;
