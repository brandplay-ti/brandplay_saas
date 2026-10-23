-- 0031_ia_por_organizacao.sql
--
-- IA com chave padrão da plataforma e chave exclusiva por organização
-- (docs/architecture/plano-ia-por-cliente.md, backlog IA-01).
--
-- Quem chama o fornecedor de IA é sempre o servidor (Edge Functions, service
-- role). O navegador nunca vê chave nem configuração de fornecedor.
--
--   ai_credentials    chave de API cifrada: organization_id nulo = chave
--                     padrão da plataforma; preenchido = chave exclusiva da
--                     organização. Dado da PLATAFORMA: nenhum acesso pela API.
--   ai_org_settings   por organização: IA habilitada, orçamento mensal, % de
--                     alerta, corte. Sem linha = valores padrão.
--   ai_usage_events   uma linha por chamada à IA (tokens, custo estimado,
--                     resultado). Nunca guarda prompt nem resposta. Imutável.
--   ai_model_prices   preço por 1M de tokens, por modelo, para o custo
--                     estimado. Em reais (o orçamento é em R$).
--
-- billing_plans ganha `ai_enabled` e `ai_monthly_budget_cents`: o padrão de
-- IA de cada plano. Monetização (cota por plano, créditos) é tarefa futura;
-- por ora todos os planos têm IA e nenhum tem teto.
--
-- Escrita: só service role (Edge Functions `admin-ai` e a camada
-- `_shared/ai`). Leitura: owner/admin da organização lê a própria
-- configuração e o próprio uso; o superadmin lê por funções `admin_ia_*`
-- (IA-02). As chaves são cifradas na Edge Function (AES-GCM, chave mestra
-- `AI_KEYS_MASTER_KEY` no ambiente); o banco nunca vê a chave em claro.

-- ─── Credenciais ─────────────────────────────────────────────────────
create table public.ai_credentials (
  id                uuid primary key default gen_random_uuid(),
  -- Nulo = chave padrão da plataforma.
  organization_id   uuid null references public.organizations (id) on delete cascade,
  provider          text not null,
  -- AES-GCM em base64; IV de 12 bytes em base64; versão da chave mestra
  -- usada, para rotação.
  key_ciphertext    text not null,
  key_iv            text not null,
  key_version       smallint not null default 1 check (key_version >= 1),
  -- Últimos caracteres da chave, para a tela e a auditoria ("••••1234").
  key_hint          text not null check (char_length(key_hint) between 1 and 8),
  -- Modelo por nível. Visão nula = o modelo escolhido não lê imagem: a
  -- chamada que precisa de visão usa a chave padrão (decisão Q4).
  model_rapido      text not null check (btrim(model_rapido) <> ''),
  model_padrao      text not null check (btrim(model_padrao) <> ''),
  model_visao       text null check (model_visao is null or btrim(model_visao) <> ''),
  status            text not null default 'ativa',
  last_validated_at timestamptz null,
  -- Categoria neutra do último erro do fornecedor (nunca a mensagem crua,
  -- que pode ecoar a chave).
  last_error        text null,
  last_error_at     timestamptz null,
  created_by        uuid null,
  revoked_at        timestamptz null,
  revoked_by        uuid null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint ai_credentials_provider_check check (provider in ('openai', 'gemini', 'anthropic')),
  constraint ai_credentials_status_check check (status in ('ativa', 'revogada')),
  constraint ai_credentials_revogada_check check ((status = 'revogada') = (revoked_at is not null)),
  constraint ai_credentials_last_error_check check (
    last_error is null or last_error in ('chave_invalida', 'sem_saldo', 'limite_taxa', 'indisponivel', 'resposta_invalida')
  )
);

comment on table public.ai_credentials is
  'Chaves de API de IA, cifradas na Edge Function. organization_id nulo = chave padrão da plataforma. Sem acesso pela API.';

-- Uma chave ativa por organização, e uma chave padrão ativa.
create unique index ai_credentials_org_ativa_idx
  on public.ai_credentials (organization_id)
  where status = 'ativa' and organization_id is not null;
create unique index ai_credentials_padrao_ativa_idx
  on public.ai_credentials ((organization_id is null))
  where status = 'ativa' and organization_id is null;

create index ai_credentials_org_idx
  on public.ai_credentials (organization_id, created_at desc);

-- ─── Configuração por organização ────────────────────────────────────
create table public.ai_org_settings (
  organization_id      uuid primary key references public.organizations (id) on delete cascade,
  ai_enabled           boolean not null default true,
  -- Centavos de BRL por mês. Nulo = vale o do plano
  -- (billing_plans.ai_monthly_budget_cents); nos dois nulos, sem teto.
  monthly_budget_cents integer null check (monthly_budget_cents is null or monthly_budget_cents >= 0),
  alert_threshold_pct  smallint not null default 80 check (alert_threshold_pct between 1 and 100),
  -- Ao atingir 100%: true = corta, false = só alerta. Nulo = regra padrão
  -- (decisão Q5): corta quem usa a chave padrão, só alerta quem tem chave
  -- exclusiva.
  hard_limit           boolean null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.ai_org_settings is
  'Configuração de IA da organização (habilitada, orçamento, alerta, corte). Sem linha = padrão. Escrita só pelo servidor.';

-- ─── Uso ─────────────────────────────────────────────────────────────
create table public.ai_usage_events (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  -- Quem disparou. Nulo = rotina sem usuário.
  user_id                   uuid null,
  -- Funcionalidade (nome da Edge Function) e nível pedido.
  feature                   text not null check (btrim(feature) <> ''),
  tier                      text not null,
  provider                  text not null,
  model                     text not null,
  credential_id             uuid null references public.ai_credentials (id) on delete set null,
  -- De onde veio a chave: exclusiva da organização, padrão da plataforma,
  -- padrão por falta de capacidade na exclusiva (Q4) ou semente do ambiente.
  credential_scope          text not null,
  input_tokens              integer not null default 0 check (input_tokens >= 0),
  output_tokens             integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens       integer not null default 0 check (cached_input_tokens >= 0),
  cache_write_input_tokens  integer not null default 0 check (cache_write_input_tokens >= 0),
  -- Em reais, pelo preço vigente em ai_model_prices. Nulo = modelo sem preço
  -- cadastrado (os tokens ficam, o custo pode ser recalculado).
  estimated_cost_brl        numeric(14, 6) null check (estimated_cost_brl is null or estimated_cost_brl >= 0),
  latency_ms                integer null check (latency_ms is null or latency_ms >= 0),
  status                    text not null,
  error_code                text null,
  created_at                timestamptz not null default now(),
  constraint ai_usage_events_tier_check check (tier in ('rapido', 'padrao', 'visao')),
  constraint ai_usage_events_provider_check check (provider in ('openai', 'gemini', 'anthropic')),
  constraint ai_usage_events_scope_check check (credential_scope in ('exclusiva', 'padrao', 'via_padrao', 'semente')),
  constraint ai_usage_events_status_check check (status in ('sucesso', 'erro', 'bloqueado')),
  constraint ai_usage_events_error_code_check check (
    error_code is null or error_code in (
      'chave_invalida', 'sem_saldo', 'limite_taxa', 'indisponivel', 'resposta_invalida',
      'ia_desabilitada', 'orcamento_esgotado', 'cobranca_bloqueada'
    )
  ),
  constraint ai_usage_events_erro_check check ((status = 'sucesso') = (error_code is null))
);

comment on table public.ai_usage_events is
  'Uma linha por chamada à IA: tokens, custo estimado e resultado. Nunca prompt nem resposta. Imutável; escrita só pelo servidor.';

-- Orçamento do mês e painel por organização.
create index ai_usage_events_org_idx
  on public.ai_usage_events (organization_id, created_at desc);
-- Limite de taxa por usuário.
create index ai_usage_events_org_user_idx
  on public.ai_usage_events (organization_id, user_id, created_at desc);
-- Agregados da plataforma (custo do mês, top clientes).
create index ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);
create index ai_usage_events_credential_idx
  on public.ai_usage_events (credential_id)
  where credential_id is not null;

-- ─── Preços ──────────────────────────────────────────────────────────
-- Sem carga inicial: os preços mudam e os disponíveis no planejamento eram de
-- agregadores, não das páginas oficiais. Quem opera cadastra antes de ligar a
-- IA (runbook), e a tela do superadmin mantém (IA-28).
create table public.ai_model_prices (
  id                     uuid primary key default gen_random_uuid(),
  provider               text not null,
  model                  text not null check (btrim(model) <> ''),
  -- Reais por 1 milhão de tokens.
  input_brl_per_mtok     numeric(12, 4) not null check (input_brl_per_mtok >= 0),
  output_brl_per_mtok    numeric(12, 4) not null check (output_brl_per_mtok >= 0),
  -- Nulo = o fornecedor não cobra diferente (usa o preço de entrada).
  cached_input_brl_per_mtok      numeric(12, 4) null check (cached_input_brl_per_mtok is null or cached_input_brl_per_mtok >= 0),
  cache_write_input_brl_per_mtok numeric(12, 4) null check (cache_write_input_brl_per_mtok is null or cache_write_input_brl_per_mtok >= 0),
  valid_from             date not null default current_date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint ai_model_prices_provider_check check (provider in ('openai', 'gemini', 'anthropic')),
  constraint ai_model_prices_vigencia_key unique (provider, model, valid_from)
);

comment on table public.ai_model_prices is
  'Preço por 1M de tokens em reais, por modelo e vigência, para o custo estimado de ai_usage_events.';

-- ─── Padrão de IA por plano ──────────────────────────────────────────
alter table public.billing_plans
  add column ai_enabled boolean not null default true,
  add column ai_monthly_budget_cents integer null
    check (ai_monthly_budget_cents is null or ai_monthly_budget_cents >= 0);

comment on column public.billing_plans.ai_enabled is
  'Se o plano inclui IA. Padrão para organizações sem ai_org_settings.';
comment on column public.billing_plans.ai_monthly_budget_cents is
  'Orçamento mensal de IA em centavos de BRL para organizações sem orçamento próprio. Nulo = sem teto.';

-- ─── updated_at ──────────────────────────────────────────────────────
create trigger ai_credentials_updated_at before update on public.ai_credentials
  for each row execute function public.update_updated_at_column();
create trigger ai_org_settings_updated_at before update on public.ai_org_settings
  for each row execute function public.update_updated_at_column();
create trigger ai_model_prices_updated_at before update on public.ai_model_prices
  for each row execute function public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.ai_credentials enable row level security;
alter table public.ai_org_settings enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_model_prices enable row level security;

-- ai_credentials e ai_model_prices: sem policy — só service role. O
-- superadmin lê metadados (nunca a cifra) por funções admin_ia_* (IA-02).

-- Configuração e uso da organização: só quem gerencia a organização.
create policy ai_org_settings_admin_read on public.ai_org_settings
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

create policy ai_usage_events_admin_read on public.ai_usage_events
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']));

-- Bloqueio de cobrança (formato da 0026). ai_credentials fica fora: é dado da
-- plataforma e `authenticated` não tem acesso nenhum a ela.
create policy billing_access_restrictive on public.ai_org_settings
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

create policy billing_access_restrictive on public.ai_usage_events
  as restrictive for all to authenticated
  using (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]))
  with check (organization_id is null or organization_id <> all ((select public.billing_blocked_orgs())::uuid[]));

revoke all on public.ai_credentials, public.ai_org_settings, public.ai_usage_events,
              public.ai_model_prices
  from anon, authenticated;

grant select on public.ai_org_settings, public.ai_usage_events to authenticated;
grant all on public.ai_credentials, public.ai_org_settings, public.ai_usage_events,
             public.ai_model_prices
  to service_role;
