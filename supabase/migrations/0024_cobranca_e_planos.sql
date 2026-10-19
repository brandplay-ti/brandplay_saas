-- 0024_cobranca_e_planos.sql
--
-- Cobrança e planos da plataforma (ADR-0007, docs/business/cobranca.md).
--
-- Quem paga é a ORGANIZAÇÃO, que é o tenant do BrandPlay (ADR-0002) — não o
-- usuário. Um usuário em várias organizações vê o plano de cada uma.
--
-- O que esta migration cria:
--
--   billing_settings       parâmetros (dias de teste, plano usado no teste)
--   billing_plans          catálogo: preço e limites. Fonte da verdade das
--                          regras comerciais; o Stripe guarda preços e
--                          assinaturas, não as regras.
--   billing_accounts       1 linha por organização: fim do teste e o customer
--                          do Stripe
--   billing_subscriptions  projeção das assinaturas do Stripe (webhook)
--   billing_invoices       projeção das faturas do Stripe (webhook)
--   billing_stripe_events  idempotência do webhook
--
-- Nenhuma dessas tabelas aceita escrita da API (`authenticated`): estado de
-- cobrança só é escrito pelas Edge Functions (service role) e pelos gatilhos
-- daqui. Leitura das tabelas da organização: só owner/admin. Os demais
-- membros enxergam o resumo por `billing_status()`.
--
-- Limites (propriedades e usuários) são aplicados por gatilho — a tela só
-- explica o bloqueio. Exceder falha com `hint = 'limite_plano:<recurso>'` e,
-- em `detail`, o id do plano mais barato que comporta o uso.
--
-- Carga em massa (seed, importação) pode desligar os limites na transação com
-- `set local brandplay.ignorar_limites = 'on'`. O caminho da aplicação, nunca.

-- ─── Catálogo ────────────────────────────────────────────────────────
create table public.billing_plans (
  id                text primary key,
  name              text not null,
  description       text not null default '',
  -- Centavos de BRL. Nulo = "sob consulta": aparece no catálogo, sem checkout.
  price_cents       integer null check (price_cents is null or price_cents > 0),
  -- Nulo = sem teto.
  max_properties    integer null check (max_properties is null or max_properties >= 0),
  max_users         integer null check (max_users is null or max_users >= 1),
  features          text[] not null default '{}',
  highlight         boolean not null default false,
  -- Plano fora de venda: some do catálogo, mas quem já assina continua nele.
  active            boolean not null default true,
  sort_order        integer not null default 0,
  stripe_product_id text null,
  stripe_price_id   text null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.billing_plans is
  'Catálogo de planos da plataforma. Preço e limites são a regra comercial; o Stripe só espelha preço.';
comment on column public.billing_plans.max_properties is
  'Teto de propriedades RAIZ da organização (edições/temporadas não contam). Nulo = sem teto.';
comment on column public.billing_plans.max_users is
  'Teto de membros ativos + convites pendentes da organização, incluindo o owner. Nulo = sem teto.';

insert into public.billing_plans
  (id, name, description, price_cents, max_properties, max_users, features, highlight, sort_order)
values
  ('starter', 'Starter', 'Para projetos e pequenas propriedades.', 49000, 3, 1,
   array['Até 3 propriedades', 'Pipeline comercial', 'Propostas básicas', '1 usuário'],
   false, 10),
  ('pro', 'Pro', 'Para agências e federações em crescimento.', 149000, null, 10,
   array['Propriedades ilimitadas', 'Contratos & assinaturas', 'Gestão de entregas',
         'Portal do patrocinador', 'BrandTrack com IA', 'Até 10 usuários'],
   true, 20),
  ('enterprise', 'Enterprise', 'Para grandes detentores de direito.', null, null, null,
   array['SLA dedicado', 'SSO & RBAC avançado', 'Integrações sob medida',
         'Onboarding com CS', 'Usuários ilimitados'],
   false, 30);

-- ─── Parâmetros ──────────────────────────────────────────────────────
-- Uma linha só (id = true). Mudar o teste é `update`, registrado no runbook.
create table public.billing_settings (
  id            boolean primary key default true check (id),
  trial_days    integer not null default 14 check (trial_days >= 0),
  trial_plan_id text not null references public.billing_plans (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.billing_settings is
  'Parâmetros de cobrança (linha única): duração do teste e plano cujos limites valem durante ele.';

insert into public.billing_settings (trial_days, trial_plan_id) values (14, 'pro');

-- ─── Conta de cobrança da organização ────────────────────────────────
create table public.billing_accounts (
  organization_id    uuid primary key references public.organizations (id) on delete cascade,
  trial_ends_at      timestamptz not null,
  stripe_customer_id text null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.billing_accounts is
  'Uma linha por organização: fim do teste grátis e customer do Stripe. Escrita só pelo servidor.';

-- ─── Assinaturas (projeção do Stripe) ────────────────────────────────
create table public.billing_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id),
  plan_id                text not null references public.billing_plans (id),
  status                 text not null,
  payment_method         text null,
  current_period_start   timestamptz null,
  current_period_end     timestamptz null,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz null,
  stripe_customer_id     text not null,
  stripe_subscription_id text not null unique,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint billing_subscriptions_status_check check (
    status in ('incompleta', 'trialing', 'ativa', 'inadimplente', 'nao_paga', 'cancelada')
  ),
  constraint billing_subscriptions_payment_method_check check (
    payment_method is null or payment_method in ('cartao', 'boleto', 'pix')
  )
);

comment on table public.billing_subscriptions is
  'Assinaturas da organização: projeção do Stripe, escrita só pelo webhook e pela manage-billing.';

-- Uma assinatura vigente por organização. A manage-billing recusa um segundo
-- checkout antes de o cliente pagar; este índice é a fronteira.
create unique index billing_subscriptions_vigente_idx
  on public.billing_subscriptions (organization_id)
  where status in ('incompleta', 'trialing', 'ativa', 'inadimplente');

create index billing_subscriptions_org_idx
  on public.billing_subscriptions (organization_id, created_at desc);

-- ─── Faturas (projeção do Stripe) ────────────────────────────────────
create table public.billing_invoices (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id),
  subscription_id    uuid null references public.billing_subscriptions (id) on delete set null,
  stripe_invoice_id  text not null unique,
  number             text null,
  status             text not null,
  payment_method     text null,
  amount_cents       integer not null check (amount_cents >= 0),
  currency           text not null default 'brl',
  due_at             timestamptz null,
  paid_at            timestamptz null,
  hosted_invoice_url text null,
  invoice_pdf_url    text null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint billing_invoices_status_check check (
    status in ('rascunho', 'aberta', 'paga', 'nao_paga', 'cancelada')
  ),
  constraint billing_invoices_payment_method_check check (
    payment_method is null or payment_method in ('cartao', 'boleto', 'pix')
  )
);

comment on table public.billing_invoices is
  'Faturas da assinatura da organização: projeção do Stripe, para o histórico de cobranças.';

create index billing_invoices_org_idx
  on public.billing_invoices (organization_id, created_at desc);

-- ─── Idempotência do webhook ─────────────────────────────────────────
create table public.billing_stripe_events (
  event_id     text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz null,
  error        text null
);

comment on table public.billing_stripe_events is
  'Um event.id do Stripe é processado uma vez. Falha grava `error` e libera o reenvio do Stripe.';

-- ─── updated_at ──────────────────────────────────────────────────────
create trigger billing_plans_updated_at before update on public.billing_plans
  for each row execute function public.update_updated_at_column();
create trigger billing_settings_updated_at before update on public.billing_settings
  for each row execute function public.update_updated_at_column();
create trigger billing_accounts_updated_at before update on public.billing_accounts
  for each row execute function public.update_updated_at_column();
create trigger billing_subscriptions_updated_at before update on public.billing_subscriptions
  for each row execute function public.update_updated_at_column();
create trigger billing_invoices_updated_at before update on public.billing_invoices
  for each row execute function public.update_updated_at_column();

-- ─── Conta de cobrança: criação ──────────────────────────────────────
-- Cria a conta (com o teste) se ainda não existir. Idempotente.
--
-- Existe como função, e não só como gatilho em `organizations`, porque a
-- importação de dados roda com `session_replication_role = replica` — os
-- gatilhos não disparam, e uma organização importada chegaria sem conta. Quem
-- precisa da conta a garante aqui, e o teste conta a partir desse momento.
create or replace function public.billing_ensure_account(_org_id uuid)
returns public.billing_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  _account public.billing_accounts;
begin
  insert into public.billing_accounts (organization_id, trial_ends_at)
  select o.id, now() + make_interval(days => s.trial_days)
    from public.organizations o
   cross join public.billing_settings s
   where o.id = _org_id
  on conflict (organization_id) do nothing;

  select * into _account from public.billing_accounts where organization_id = _org_id;
  return _account;
end;
$$;

comment on function public.billing_ensure_account(uuid) is
  'Garante a conta de cobrança da organização (com o teste grátis contando de agora). Idempotente.';

create or replace function public.tg_billing_account_on_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.billing_ensure_account(new.id);
  return new;
end;
$$;

create trigger trg_billing_account
  after insert on public.organizations
  for each row execute function public.tg_billing_account_on_organization();

-- Organizações que já existem ganham o mesmo teste, contado a partir de agora
-- (decisão registrada na ADR-0007).
insert into public.billing_accounts (organization_id, trial_ends_at)
select o.id, now() + make_interval(days => s.trial_days)
  from public.organizations o
 cross join public.billing_settings s
on conflict (organization_id) do nothing;

-- ─── Plano vigente e uso ─────────────────────────────────────────────
-- Plano cujos limites valem agora:
--   1. assinatura que dá acesso (ativa, trialing, inadimplente);
--   2. senão, o plano do teste, enquanto o teste não acabou;
--   3. senão, nenhum (linha nula): a organização está sem plano.
--
-- `inadimplente` (past_due) ainda dá acesso: o Stripe está tentando cobrar de
-- novo, e cortar na primeira recusa do cartão seria punir quem vai pagar. Ao
-- esgotar as tentativas o Stripe muda para `nao_paga`/`cancelada`.
create or replace function public.billing_effective_plan(_org_id uuid)
returns public.billing_plans
language plpgsql
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

  _account := public.billing_ensure_account(_org_id);
  if _account.trial_ends_at is not null and _account.trial_ends_at > now() then
    select p.* into _plan
      from public.billing_settings st
      join public.billing_plans p on p.id = st.trial_plan_id;
  end if;

  return _plan;
end;
$$;

comment on function public.billing_effective_plan(uuid) is
  'Plano cujos limites valem agora: assinatura com acesso, senão o do teste, senão nulo.';

-- Convite pendente = o mesmo critério com que `handle_new_user` aceita um
-- convite: status 'pendente' e ainda não expirado.
create or replace function public.billing_usage(_org_id uuid)
returns table (properties integer, users_active integer, invites_pending integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.sports_properties sp
      where sp.organization_id = _org_id
        and sp.parent_property_id is null),
    (select count(*)::integer
       from public.organization_members om
      where om.organization_id = _org_id
        and om.status = 'ativo'),
    (select count(*)::integer
       from public.organization_invites oi
      where oi.organization_id = _org_id
        and oi.status = 'pendente'
        and oi.expires_at > now());
$$;

comment on function public.billing_usage(uuid) is
  'Uso da organização: propriedades raiz, membros ativos e convites pendentes.';

-- Plano à venda mais barato que comporta o uso informado. "Sob consulta"
-- (sem preço) fica por último: é a sugestão quando nada mais comporta.
create or replace function public.billing_suggest_plan(_properties integer, _users integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.billing_plans p
   where p.active
     and (p.max_properties is null or p.max_properties >= _properties)
     and (p.max_users is null or p.max_users >= _users)
   order by p.price_cents asc nulls last, p.sort_order asc
   limit 1;
$$;

-- ─── Resumo para a interface ─────────────────────────────────────────
-- O que a tela precisa para decidir o bloqueio e mostrar plano e uso. Qualquer
-- membro ativo da organização pode consultar; não membro recebe erro.
--
-- `access` é a regra de acesso; a tela só a aplica. Volátil porque garante a
-- conta de cobrança (organização importada sem gatilho).
create or replace function public.billing_status(_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _account public.billing_accounts;
  _plan    public.billing_plans;
  _sub     public.billing_subscriptions;
  _usage   record;
  _source  text;
begin
  if not public.is_org_member(_org_id) then
    raise exception 'sem acesso à organização' using errcode = 'insufficient_privilege';
  end if;

  _account := public.billing_ensure_account(_org_id);

  -- Assinatura mais recente que ainda está em jogo (inclui `incompleta`: o
  -- boleto da contratação foi gerado e não compensou).
  select * into _sub
    from public.billing_subscriptions
   where organization_id = _org_id
     and status in ('incompleta', 'trialing', 'ativa', 'inadimplente')
   order by created_at desc
   limit 1;

  _plan := public.billing_effective_plan(_org_id);

  if _sub.id is not null and _sub.status in ('ativa', 'trialing', 'inadimplente') then
    _source := 'subscription';
  elsif _plan.id is not null then
    _source := 'trial';
  else
    _source := 'none';
  end if;

  select * into _usage from public.billing_usage(_org_id);

  return jsonb_build_object(
    'organization_id', _org_id,
    'access', _source <> 'none',
    'source', _source,
    'trial_ends_at', _account.trial_ends_at,
    'has_customer', _account.stripe_customer_id is not null,
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
  'Acesso, plano, assinatura e uso da organização, para a interface. Exige ser membro ativo.';

-- ─── Limites: bloqueio no banco ──────────────────────────────────────
create or replace function public.billing_limits_bypassed()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('brandplay.ignorar_limites', true), 'off') = 'on';
$$;

-- Erro único para "sem plano": teste acabou e não há assinatura com acesso.
create or replace function public.billing_raise_without_plan()
returns void
language plpgsql
as $$
begin
  raise exception using
    errcode = 'check_violation',
    message = 'A organização não tem plano ativo: o teste grátis acabou e não há assinatura.',
    detail = '',
    hint = 'limite_plano:sem_plano';
end;
$$;

-- Propriedades: conta só a raiz. Uma edição/temporada (parent_property_id)
-- é a mesma propriedade em outro ano, e não ocupa vaga.
create or replace function public.tg_billing_limit_properties()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan  public.billing_plans;
  _count integer;
begin
  if public.billing_limits_bypassed()
     or new.organization_id is null
     or new.parent_property_id is not null then
    return new;
  end if;

  _plan := public.billing_effective_plan(new.organization_id);
  if _plan.id is null then
    perform public.billing_raise_without_plan();
  end if;
  if _plan.max_properties is null then
    return new;
  end if;

  select count(*) into _count
    from public.sports_properties
   where organization_id = new.organization_id
     and parent_property_id is null;

  if _count >= _plan.max_properties then
    raise exception using
      errcode = 'check_violation',
      message = format('Limite de propriedades do plano %s atingido (%s de %s).',
                       _plan.name, _count, _plan.max_properties),
      detail = coalesce(public.billing_suggest_plan(_count + 1, 0), ''),
      hint = 'limite_plano:propriedades';
  end if;

  return new;
end;
$$;

-- `zz`: roda depois de `set_org_id`, que preenche organization_id (gatilhos
-- BEFORE disparam em ordem alfabética — mesma convenção da 0019).
create trigger trg_zz_billing_limit
  before insert on public.sports_properties
  for each row execute function public.tg_billing_limit_properties();

-- Usuários = membros ativos + convites pendentes. O convite reserva a vaga no
-- momento em que é feito; por isso aceitar um convite nunca é bloqueado.
create or replace function public.tg_billing_limit_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _plan  public.billing_plans;
  _usage record;
begin
  if public.billing_limits_bypassed() or new.status <> 'pendente' then
    return new;
  end if;

  _plan := public.billing_effective_plan(new.organization_id);
  if _plan.id is null then
    perform public.billing_raise_without_plan();
  end if;
  if _plan.max_users is null then
    return new;
  end if;

  select * into _usage from public.billing_usage(new.organization_id);

  if _usage.users_active + _usage.invites_pending >= _plan.max_users then
    raise exception using
      errcode = 'check_violation',
      message = format('Limite de usuários do plano %s atingido (%s de %s, contando convites pendentes).',
                       _plan.name, _usage.users_active + _usage.invites_pending, _plan.max_users),
      detail = coalesce(public.billing_suggest_plan(0, _usage.users_active + _usage.invites_pending + 1), ''),
      hint = 'limite_plano:usuarios';
  end if;

  return new;
end;
$$;

create trigger trg_zz_billing_limit
  before insert on public.organization_invites
  for each row execute function public.tg_billing_limit_invites();

-- Membro que entra ou volta a ficar ativo sem passar por convite (usuário já
-- cadastrado adicionado direto, reativação). Liberado quando:
--   - é o primeiro membro (owner na criação da organização);
--   - há convite pendente para o e-mail dele (a vaga já foi reservada).
create or replace function public.tg_billing_limit_members()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _plan   public.billing_plans;
  _usage  record;
  _email  text;
  _others integer;
begin
  if public.billing_limits_bypassed() or new.status <> 'ativo' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'ativo' then
    return new;
  end if;

  select count(*) into _others
    from public.organization_members
   where organization_id = new.organization_id
     and status = 'ativo'
     and user_id <> new.user_id;
  if _others = 0 then
    return new;
  end if;

  select u.email into _email from auth.users u where u.id = new.user_id;
  if exists (
    select 1
      from public.organization_invites oi
     where oi.organization_id = new.organization_id
       and lower(oi.email) = lower(_email)
       and oi.status = 'pendente'
       and oi.expires_at > now()
  ) then
    return new;
  end if;

  _plan := public.billing_effective_plan(new.organization_id);
  if _plan.id is null then
    perform public.billing_raise_without_plan();
  end if;
  if _plan.max_users is null then
    return new;
  end if;

  select * into _usage from public.billing_usage(new.organization_id);

  if _others + _usage.invites_pending >= _plan.max_users then
    raise exception using
      errcode = 'check_violation',
      message = format('Limite de usuários do plano %s atingido (%s de %s, contando convites pendentes).',
                       _plan.name, _others + _usage.invites_pending, _plan.max_users),
      detail = coalesce(public.billing_suggest_plan(0, _others + _usage.invites_pending + 1), ''),
      hint = 'limite_plano:usuarios';
  end if;

  return new;
end;
$$;

create trigger trg_zz_billing_limit
  before insert or update of status on public.organization_members
  for each row execute function public.tg_billing_limit_members();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.billing_plans enable row level security;
alter table public.billing_settings enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_stripe_events enable row level security;

-- Catálogo: leitura pública (padrão 5). Preço e limites não são segredo, e a
-- página pública pode passar a lê-los daqui.
create policy billing_plans_public_read on public.billing_plans
  for select to anon, authenticated
  using (true);

-- Dados de cobrança da organização: só quem gerencia a cobrança.
create policy billing_accounts_admin_read on public.billing_accounts
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy billing_subscriptions_admin_read on public.billing_subscriptions
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy billing_invoices_admin_read on public.billing_invoices
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

-- billing_settings e billing_stripe_events: sem policy — só service role.

revoke all on public.billing_plans, public.billing_settings, public.billing_accounts,
              public.billing_subscriptions, public.billing_invoices, public.billing_stripe_events
  from anon, authenticated;

grant select on public.billing_plans to anon, authenticated;
grant select on public.billing_accounts, public.billing_subscriptions, public.billing_invoices
  to authenticated;
grant all on public.billing_plans, public.billing_settings, public.billing_accounts,
             public.billing_subscriptions, public.billing_invoices, public.billing_stripe_events
  to service_role;

-- ─── Permissões das funções ──────────────────────────────────────────
revoke all on function public.billing_ensure_account(uuid) from public, anon, authenticated;
revoke all on function public.billing_effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.billing_usage(uuid) from public, anon, authenticated;
revoke all on function public.billing_suggest_plan(integer, integer) from public, anon, authenticated;
revoke all on function public.billing_status(uuid) from public, anon, authenticated;
revoke all on function public.billing_limits_bypassed() from public, anon, authenticated;
revoke all on function public.billing_raise_without_plan() from public, anon, authenticated;
revoke all on function public.tg_billing_account_on_organization() from public, anon, authenticated;
revoke all on function public.tg_billing_limit_properties() from public, anon, authenticated;
revoke all on function public.tg_billing_limit_invites() from public, anon, authenticated;
revoke all on function public.tg_billing_limit_members() from public, anon, authenticated;

grant execute on function public.billing_status(uuid) to authenticated, service_role;
grant execute on function public.billing_ensure_account(uuid) to service_role;
grant execute on function public.billing_effective_plan(uuid) to service_role;
grant execute on function public.billing_usage(uuid) to service_role;
grant execute on function public.billing_suggest_plan(integer, integer) to service_role;
grant execute on function public.billing_limits_bypassed() to service_role;
grant execute on function public.billing_raise_without_plan() to service_role;
grant execute on function public.tg_billing_account_on_organization() to service_role;
grant execute on function public.tg_billing_limit_properties() to service_role;
grant execute on function public.tg_billing_limit_invites() to service_role;
grant execute on function public.tg_billing_limit_members() to service_role;
