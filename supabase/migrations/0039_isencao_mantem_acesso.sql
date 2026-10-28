-- Isenção de 100% vigente é fonte de acesso.
--
-- Até aqui o desconto só virava cupom no Stripe (0035). Sem assinatura, o
-- cliente continuava "em teste" e via os dias restantes — mesmo com 100% por
-- um ano. A isenção passa a destrancar o painel pelo prazo, com os limites do
-- plano de teste, à frente do teste grátis e da liberação provisória.
-- Assinatura com acesso (ativa, trialing, inadimplente) continua na frente.
-- Desconto abaixo de 100% não muda o acesso.

create or replace function public.billing_isencao_ate(_org_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((d.created_at at time zone 'utc') + make_interval(months => d.duration_months)) at time zone 'utc'
    from public.billing_discounts d
   where d.organization_id = _org_id
     and d.percent_off = 100
     and d.revoked_at is null
     and d.stripe_status <> 'falhou'
     and ((d.created_at at time zone 'utc') + make_interval(months => d.duration_months)) at time zone 'utc' > now()
   order by d.created_at desc
   limit 1;
$$;

comment on function public.billing_isencao_ate(uuid) is
  'Fim da isenção de 100% vigente (revogada, falha ou vencida não contam). Nulo = sem isenção. Meses de calendário em UTC, como descontoAindaVigente.';

revoke all on function public.billing_isencao_ate(uuid) from public, anon, authenticated;
grant execute on function public.billing_isencao_ate(uuid) to service_role;

-- Plano cujos limites valem agora. A isenção entra no mesmo degrau do teste:
-- limites do plano de teste, mesmo depois que o teste acabou.
create or replace function public.billing_access_plan(_org_id uuid)
returns public.billing_plans
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _plan    public.billing_plans;
  _account public.billing_accounts;
begin
  select p.* into _plan
    from public.billing_subscriptions s
    join public.billing_plans p on p.id = s.plan_id
   where s.organization_id = _org_id
     and s.status in ('ativa', 'trialing', 'inadimplente')
   order by s.created_at desc
   limit 1;
  if _plan.id is not null then
    return _plan;
  end if;

  select * into _account from public.billing_accounts where organization_id = _org_id;
  if _account.organization_id is null
     or _account.trial_ends_at > now()
     or public.billing_isencao_ate(_org_id) is not null then
    select p.* into _plan
      from public.billing_settings st
      join public.billing_plans p on p.id = st.trial_plan_id;
    return _plan;
  end if;

  if exists (
    select 1 from public.billing_access_grants g
     where g.organization_id = _org_id
       and g.revoked_at is null
       and g.expires_at > now()
  ) then
    select p.* into _plan
      from public.billing_subscriptions s
      join public.billing_plans p on p.id = s.plan_id
     where s.organization_id = _org_id
       and s.status = 'incompleta'
     order by s.created_at desc
     limit 1;
    if _plan.id is null then
      select p.* into _plan
        from public.billing_settings st
        join public.billing_plans p on p.id = st.trial_plan_id;
    end if;
  end if;

  return _plan;
end;
$$;

comment on function public.billing_access_plan(uuid) is
  'Plano cujos limites valem agora (assinatura, isenção de 100%, teste ou liberação provisória), sem efeito colateral. Nulo = sem acesso.';

create or replace function public.billing_status(_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _account  public.billing_accounts;
  _plan     public.billing_plans;
  _sub      public.billing_subscriptions;
  _grant    public.billing_access_grants;
  _settings public.billing_settings;
  _usage    record;
  _isencao  timestamptz;
  _source   text;
begin
  if not public.is_org_member(_org_id) then
    raise exception 'sem acesso à organização' using errcode = 'insufficient_privilege';
  end if;

  _account := public.billing_ensure_account(_org_id);
  select * into _settings from public.billing_settings;

  select * into _sub
    from public.billing_subscriptions
   where organization_id = _org_id
     and status in ('incompleta', 'trialing', 'ativa', 'inadimplente')
   order by created_at desc
   limit 1;

  select * into _grant
    from public.billing_access_grants
   where organization_id = _org_id
     and revoked_at is null
     and expires_at > now()
   order by expires_at desc
   limit 1;

  _plan := public.billing_access_plan(_org_id);
  _isencao := public.billing_isencao_ate(_org_id);

  if _sub.id is not null and _sub.status in ('ativa', 'trialing', 'inadimplente') then
    _source := 'subscription';
  elsif _isencao is not null then
    _source := 'exemption';
  elsif _account.trial_ends_at > now() then
    _source := 'trial';
  elsif _grant.id is not null then
    _source := 'provisional';
  else
    _source := 'none';
  end if;

  select * into _usage from public.billing_usage(_org_id);

  return jsonb_build_object(
    'organization_id', _org_id,
    'access', _source <> 'none',
    'source', _source,
    'trial_ends_at', _account.trial_ends_at,
    'exemption_ends_at', _isencao,
    'has_customer', _account.stripe_customer_id is not null,
    'provisional_access_hours', _settings.provisional_access_hours,
    'provisional_access', case when _grant.id is null then null else jsonb_build_object(
      'kind', _grant.kind,
      'expires_at', _grant.expires_at
    ) end,
    'plan', case when _plan.id is null then null else jsonb_build_object(
      'id', _plan.id,
      'name', _plan.name,
      'price_cents', _plan.price_cents,
      'max_properties', _plan.max_properties,
      'max_users', _plan.max_users
    ) end,
    'subscription', case when _sub.id is null then null else jsonb_build_object(
      'plan_id', _sub.plan_id,
      'status', _sub.status,
      'payment_method', _sub.payment_method,
      'current_period_end', _sub.current_period_end,
      'cancel_at_period_end', _sub.cancel_at_period_end
    ) end,
    'usage', jsonb_build_object(
      'properties', _usage.properties,
      'users_active', _usage.users_active,
      'invites_pending', _usage.invites_pending
    )
  );
end;
$$;

comment on function public.billing_status(uuid) is
  'Resumo de acesso, plano e uso para o membro. source: subscription, exemption (isenção de 100%), trial, provisional ou none.';

comment on function public.billing_blocked_orgs() is
  'Organizações em que o usuário autenticado é membro ativo e que estão sem acesso (sem assinatura, isenção de 100%, teste ou liberação).';

-- Lista administrativa: isenção vigente deixa de aparecer como teste.
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
  perform public.platform_admin_require();

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

-- Funil "em teste": isenção vigente não é teste à espera de conversão.
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

  select count(*) into _em_teste
    from public.organizations o
    left join public.billing_accounts a on a.organization_id = o.id
   where (a.organization_id is null or a.trial_ends_at > now())
     and public.billing_isencao_ate(o.id) is null
     and not exists (
       select 1 from public.billing_subscriptions s
        where s.organization_id = o.id and s.status in ('ativa', 'trialing', 'inadimplente')
     );

  select count(*) into _aguardando
    from public.billing_subscriptions s
   where s.status = 'incompleta';

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
