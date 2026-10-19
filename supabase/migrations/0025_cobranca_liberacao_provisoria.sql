-- 0025_cobranca_liberacao_provisoria.sql
--
-- Liberação provisória de acesso enquanto o boleto compensa (ADR-0007,
-- docs/business/cobranca.md) — o mesmo mecanismo do central-check (P-46).
--
-- Boleto compensa em até 1 dia útil DEPOIS de pago. Quem contrata com boleto
-- depois do fim do teste ficaria sem acesso nesse intervalo. Duas saídas:
--
--   confiança  o próprio cliente (owner/admin) libera, UMA vez por fatura,
--              com o comprovante anexado e a declaração de que pagou. Só para
--              assinatura `incompleta` cuja fatura em aberto é boleto — a
--              manage-billing confere isso no Stripe antes de gravar.
--   manual     a equipe da plataforma libera por SQL, com comentário
--              obrigatório (runbook). Sem a regra de uma por fatura.
--
-- A liberação NUNCA altera a assinatura: a projeção do Stripe continua fiel, e
-- o acesso é a soma das duas coisas. Quando o prazo passa, o acesso cai
-- sozinho; se o boleto compensou antes, a assinatura já está ativa.
--
-- O prazo é parâmetro (`billing_settings.provisional_access_hours`, 72 h).
-- Os parâmetros passam a ser legíveis sem sessão: duração do teste e prazo da
-- liberação aparecem na página pública e na tela de plano, e não são segredo.

-- ─── Parâmetros ──────────────────────────────────────────────────────
alter table public.billing_settings
  add column provisional_access_hours integer not null default 72
    check (provisional_access_hours > 0);

comment on column public.billing_settings.provisional_access_hours is
  'Duração, em horas, da liberação provisória enquanto o boleto compensa.';

create policy billing_settings_public_read on public.billing_settings
  for select to anon, authenticated
  using (true);

grant select on public.billing_settings to anon, authenticated;

-- ─── Liberações ──────────────────────────────────────────────────────
create table public.billing_access_grants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id),
  kind              text not null,
  -- Fatura do Stripe que motivou a liberação em confiança.
  stripe_invoice_id text null,
  -- Caminho do comprovante no bucket `billing-receipts`.
  receipt_path      text null,
  comment           text null,
  granted_by        uuid null,
  expires_at        timestamptz not null,
  revoked_at        timestamptz null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint billing_access_grants_kind_check check (kind in ('confianca', 'manual')),
  constraint billing_access_grants_confianca_check check (
    kind <> 'confianca' or (stripe_invoice_id is not null and receipt_path is not null)
  ),
  constraint billing_access_grants_manual_check check (
    kind <> 'manual' or nullif(btrim(comment), '') is not null
  )
);

comment on table public.billing_access_grants is
  'Liberações provisórias de acesso enquanto o boleto compensa. Não alteram a assinatura.';

-- Em confiança, uma vez por fatura.
create unique index billing_access_grants_confianca_por_fatura
  on public.billing_access_grants (organization_id, stripe_invoice_id)
  where kind = 'confianca';

create index billing_access_grants_org_idx
  on public.billing_access_grants (organization_id, expires_at desc);

create trigger billing_access_grants_updated_at before update on public.billing_access_grants
  for each row execute function public.update_updated_at_column();

-- Padrão 8 (cobrança): leitura owner/admin, escrita só do servidor.
alter table public.billing_access_grants enable row level security;

create policy billing_access_grants_admin_read on public.billing_access_grants
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

revoke all on public.billing_access_grants from anon, authenticated;
grant select on public.billing_access_grants to authenticated;
grant all on public.billing_access_grants to service_role;

-- ─── Comprovantes ────────────────────────────────────────────────────
-- Privado. Caminho: <organization_id>/<arquivo>. Owner/admin da organização
-- enviam e leem; a equipe da plataforma confere pelo Studio (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing-receipts', 'billing-receipts', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy billing_receipts_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'billing-receipts'
    and public.has_org_role(public.safe_uuid((string_to_array(name, '/'))[1]), array['owner', 'admin'])
  );

create policy billing_receipts_admin_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'billing-receipts'
    and public.has_org_role(public.safe_uuid((string_to_array(name, '/'))[1]), array['owner', 'admin'])
  );

-- ─── Regra de acesso ─────────────────────────────────────────────────
-- Plano cujos limites valem agora, sem efeito colateral (estável). Ordem:
--   1. assinatura com acesso (ativa, trialing, inadimplente);
--   2. teste vigente — ou conta ainda não criada (organização importada sem
--      gatilho: o teste começa quando a conta for garantida);
--   3. liberação provisória vigente: o plano da assinatura que aguarda
--      pagamento (o teste, se não houver);
--   4. nenhum.
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
  if _account.organization_id is null or _account.trial_ends_at > now() then
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
  'Plano cujos limites valem agora (assinatura, teste ou liberação provisória), sem efeito colateral. Nulo = sem acesso.';

-- Mesma regra, garantindo antes a conta de cobrança (usada pelos gatilhos e
-- pelo billing_status). Assinatura mantida da 0024.
create or replace function public.billing_effective_plan(_org_id uuid)
returns public.billing_plans
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.billing_ensure_account(_org_id);
  return public.billing_access_plan(_org_id);
end;
$$;

-- billing_status: passa a informar a liberação provisória e os parâmetros
-- que a tela mostra. `source` ganha 'provisional'.
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

  if _sub.id is not null and _sub.status in ('ativa', 'trialing', 'inadimplente') then
    _source := 'subscription';
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

revoke all on function public.billing_access_plan(uuid) from public, anon, authenticated;
grant execute on function public.billing_access_plan(uuid) to service_role;
