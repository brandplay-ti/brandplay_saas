-- 0032_ia_leitura_e_guardas.sql
--
-- Leitura e guardas da IA por organização (backlog IA-02, plano
-- docs/architecture/plano-ia-por-cliente.md). Tabelas na 0031.
--
--   ia_parametros(org)            parâmetros efetivos: IA habilitada,
--                                 orçamento, alerta, corte, chave exclusiva,
--                                 gasto do mês. Interna.
--   ia_situacao(org, user)        o que a camada de IA consulta antes de cada
--                                 chamada. Só service role.
--   ia_consumo_organizacao(org)   resumo do mês para owner/admin da própria
--                                 organização (decisão Q7). Sem fornecedor nem
--                                 chave.
--   admin_ia_padrao()             metadados da chave padrão da plataforma.
--   admin_ia_clientes()           todas as organizações, com modo, fornecedor,
--                                 consumo e orçamento.
--   admin_ia_cliente_detalhe(org) uma organização em detalhe.
--   admin_ia_consumo(meses)       série mensal da plataforma e top 10 do mês.
--   admin_ia_precos()             tabela de preços.
--
-- Nenhuma função devolve `key_ciphertext` nem `key_iv`: a chave só é decifrada
-- na Edge Function, que lê `ai_credentials` com a service role.
--
-- ─── Regras de cálculo ───────────────────────────────────────────────
--
-- Mês = mês corrente do servidor (`date_trunc('month', now())`), como no
-- faturamento da 0028.
--
-- Parâmetro efetivo: a linha de `ai_org_settings`, quando existe, prevalece;
-- sem ela, vale o plano com acesso (`billing_access_plan`, que inclui teste e
-- liberação provisória). Orçamento nulo nos dois = sem teto. Corte nulo =
-- regra da decisão Q5: corta quem usa a chave padrão, só alerta quem tem chave
-- exclusiva ativa.
--
-- Gasto do mês = soma de `estimated_cost_brl` de todos os eventos da
-- organização, inclusive os feitos com a chave padrão por falta de capacidade
-- (`via_padrao`, decisão Q4): o custo é do cliente. Evento sem preço conta
-- zero.
--
-- Requisições = eventos que chegaram ao fornecedor (`status <> 'bloqueado'`).
-- O limite de taxa conta só esses: tentativa bloqueada não custa nada e não
-- deve prolongar o próprio bloqueio.

-- ─── Parâmetros efetivos (interna) ───────────────────────────────────
create or replace function public.ia_parametros(_org_id uuid)
returns table (
  plan_id             text,
  ai_enabled          boolean,
  budget_cents        integer,
  alert_threshold_pct smallint,
  hard_limit          boolean,
  has_exclusive       boolean,
  spent_brl           numeric,
  requests_month      integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.id,
    -- Sem plano (cobrança bloqueada) não é "IA desligada": quem barra é a
    -- checagem de cobrança, com o motivo certo.
    coalesce(cfg.ai_enabled, pl.ai_enabled, true),
    coalesce(cfg.monthly_budget_cents, pl.ai_monthly_budget_cents),
    coalesce(cfg.alert_threshold_pct, 80::smallint),
    coalesce(cfg.hard_limit, not ex.tem),
    ex.tem,
    us.gasto,
    us.req
  from public.billing_access_plan(_org_id) pl
  left join public.ai_org_settings cfg on cfg.organization_id = _org_id
  cross join lateral (
    select exists (
      select 1 from public.ai_credentials c
       where c.organization_id = _org_id and c.status = 'ativa'
    ) as tem
  ) ex
  cross join lateral (
    select coalesce(sum(e.estimated_cost_brl), 0) as gasto,
           (count(*) filter (where e.status <> 'bloqueado'))::integer as req
      from public.ai_usage_events e
     where e.organization_id = _org_id
       and e.created_at >= date_trunc('month', now())
  ) us;
$$;

comment on function public.ia_parametros(uuid) is
  'Parâmetros efetivos de IA da organização (configuração própria, senão o plano) e gasto do mês. Interna.';

-- ─── Consumo detalhado (interna) ─────────────────────────────────────
-- Mês corrente por funcionalidade e últimos 30 dias por dia. Usada pelo
-- resumo do owner e pelo detalhe do superadmin.
create or replace function public.ia_consumo_detalhado(_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'por_funcionalidade', coalesce((
      select jsonb_agg(jsonb_build_object(
               'funcionalidade', f.feature,
               'requisicoes', f.req,
               'tokens_entrada', f.tin,
               'tokens_saida', f.tout,
               'gasto_brl', f.gasto
             ) order by f.gasto desc, f.feature)
        from (
          select e.feature,
                 (count(*) filter (where e.status <> 'bloqueado'))::integer as req,
                 coalesce(sum(e.input_tokens), 0)::bigint as tin,
                 coalesce(sum(e.output_tokens), 0)::bigint as tout,
                 coalesce(sum(e.estimated_cost_brl), 0) as gasto
            from public.ai_usage_events e
           where e.organization_id = _org_id
             and e.created_at >= date_trunc('month', now())
           group by e.feature
        ) f
    ), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'requisicoes', d.req,
               'gasto_brl', d.gasto
             ) order by d.dia)
        from (
          select date_trunc('day', e.created_at)::date as dia,
                 (count(*) filter (where e.status <> 'bloqueado'))::integer as req,
                 coalesce(sum(e.estimated_cost_brl), 0) as gasto
            from public.ai_usage_events e
           where e.organization_id = _org_id
             and e.created_at >= now() - interval '30 days'
           group by 1
        ) d
    ), '[]'::jsonb)
  );
$$;

comment on function public.ia_consumo_detalhado(uuid) is
  'Consumo de IA da organização: mês corrente por funcionalidade e últimos 30 dias por dia. Interna.';

-- ─── Guarda antes de cada chamada (servidor) ─────────────────────────
-- Devolve o bloqueio, na ordem da camada de IA (IA-10), e as contagens para o
-- limite de taxa. Os limites de taxa ficam na Edge Function.
create or replace function public.ia_situacao(_org_id uuid, _user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _p        record;
  _bloqueio text;
  _req_org  integer;
  _req_user integer;
begin
  if _org_id is null then
    raise exception 'Organização obrigatória.' using errcode = 'invalid_parameter_value';
  end if;
  -- Defesa em profundidade: a Edge Function já valida a organização contra o
  -- JWT, mas a guarda não confia nisso. Nulo = rotina sem usuário.
  if _user_id is not null and not exists (
    select 1 from public.organization_members om
     where om.organization_id = _org_id and om.user_id = _user_id and om.status = 'ativo'
  ) then
    raise exception 'Usuário não é membro ativo da organização.' using errcode = 'insufficient_privilege';
  end if;

  select * into _p from public.ia_parametros(_org_id);

  _bloqueio := case
    when not _p.ai_enabled then 'ia_desabilitada'
    when _p.plan_id is null then 'cobranca_bloqueada'
    when _p.hard_limit and _p.budget_cents is not null
         and _p.spent_brl * 100 >= _p.budget_cents then 'orcamento_esgotado'
  end;

  select (count(*) filter (where e.status <> 'bloqueado'))::integer,
         (count(*) filter (where e.status <> 'bloqueado' and e.user_id = _user_id))::integer
    into _req_org, _req_user
    from public.ai_usage_events e
   where e.organization_id = _org_id
     and e.created_at >= now() - interval '1 minute';

  return jsonb_build_object(
    'bloqueio', _bloqueio,
    'ia_habilitada', _p.ai_enabled,
    'plano', _p.plan_id,
    'chave_exclusiva', _p.has_exclusive,
    'orcamento_cents', _p.budget_cents,
    'alerta_pct', _p.alert_threshold_pct,
    'corta_ao_esgotar', _p.hard_limit,
    'gasto_mes_brl', _p.spent_brl,
    'alerta_atingido', _p.budget_cents is not null
                       and _p.spent_brl * 100 >= _p.budget_cents * _p.alert_threshold_pct / 100.0,
    'orcamento_esgotado', _p.budget_cents is not null and _p.spent_brl * 100 >= _p.budget_cents,
    'requisicoes_minuto_org', _req_org,
    'requisicoes_minuto_usuario', coalesce(_req_user, 0)
  );
end;
$$;

comment on function public.ia_situacao(uuid, uuid) is
  'Bloqueio (ia_desabilitada, cobranca_bloqueada, orcamento_esgotado ou nulo), orçamento e contagens para o limite de taxa. Só service role.';

-- ─── Resumo para a organização (owner/admin) ─────────────────────────
create or replace function public.ia_consumo_organizacao(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _p record;
begin
  if not public.has_org_role(_org_id, array['owner', 'admin']) then
    raise exception 'Acesso restrito a owner/admin da organização.' using errcode = 'insufficient_privilege';
  end if;
  -- Mesma regra da policy restritiva (0026): organização sem acesso não lê o
  -- próprio uso.
  if _org_id = any (public.billing_blocked_orgs()) then
    raise exception 'Organização sem acesso.' using errcode = 'insufficient_privilege';
  end if;

  select * into _p from public.ia_parametros(_org_id);

  return jsonb_build_object(
    'ia_habilitada', _p.ai_enabled,
    'orcamento_cents', _p.budget_cents,
    'alerta_pct', _p.alert_threshold_pct,
    'corta_ao_esgotar', _p.hard_limit,
    'gasto_mes_brl', _p.spent_brl,
    'pct_usado', case when _p.budget_cents > 0
                      then round(_p.spent_brl * 100 * 100 / _p.budget_cents, 1) end,
    'requisicoes_mes', _p.requests_month
  ) || public.ia_consumo_detalhado(_org_id);
end;
$$;

comment on function public.ia_consumo_organizacao(uuid) is
  'Consumo de IA do mês da organização, para owner/admin dela. Sem fornecedor nem chave.';

-- ─── Superadmin: chave padrão ────────────────────────────────────────
create or replace function public.admin_ia_padrao()
returns table (
  credential_id     uuid,
  provider          text,
  key_hint          text,
  model_rapido      text,
  model_padrao      text,
  model_visao       text,
  last_validated_at timestamptz,
  last_error        text,
  last_error_at     timestamptz,
  created_by        uuid,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.platform_admin_require();

  return query
  select c.id, c.provider, c.key_hint, c.model_rapido, c.model_padrao, c.model_visao,
         c.last_validated_at, c.last_error, c.last_error_at, c.created_by, c.created_at
    from public.ai_credentials c
   where c.organization_id is null and c.status = 'ativa';
end;
$$;

comment on function public.admin_ia_padrao() is
  'Metadados da chave de IA padrão da plataforma (nunca a chave). Vazio = só a semente do ambiente. Só superadmin.';

-- ─── Superadmin: lista de clientes ───────────────────────────────────
create or replace function public.admin_ia_clientes()
returns table (
  organization_id      uuid,
  name                 text,
  plan_id              text,
  ai_enabled           boolean,
  mode                 text,
  provider             text,
  model_padrao         text,
  key_hint             text,
  last_error           text,
  last_error_at        timestamptz,
  budget_cents         integer,
  alert_threshold_pct  smallint,
  hard_limit           boolean,
  spent_brl            numeric,
  pct_used             numeric,
  requests_month       integer,
  input_tokens_month   bigint,
  output_tokens_month  bigint,
  via_padrao_month     integer,
  last_call_at         timestamptz,
  last_call_status     text,
  last_call_error      text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public.platform_admin_require();

  return query
  select
    o.id,
    o.name,
    p.plan_id,
    p.ai_enabled,
    case when c.id is not null then 'exclusiva' else 'padrao' end,
    coalesce(c.provider, pd.provider),
    coalesce(c.model_padrao, pd.model_padrao),
    c.key_hint,
    c.last_error,
    c.last_error_at,
    p.budget_cents,
    p.alert_threshold_pct,
    p.hard_limit,
    p.spent_brl,
    case when p.budget_cents > 0 then round(p.spent_brl * 100 * 100 / p.budget_cents, 1) end,
    p.requests_month,
    coalesce(t.tin, 0),
    coalesce(t.tout, 0),
    coalesce(t.via_padrao, 0),
    ult.created_at,
    ult.status,
    ult.error_code
  from public.organizations o
  cross join lateral public.ia_parametros(o.id) p
  left join public.ai_credentials c
         on c.organization_id = o.id and c.status = 'ativa'
  left join public.ai_credentials pd
         on pd.organization_id is null and pd.status = 'ativa'
  left join lateral (
    select sum(e.input_tokens)::bigint as tin,
           sum(e.output_tokens)::bigint as tout,
           (count(*) filter (where e.credential_scope = 'via_padrao'))::integer as via_padrao
      from public.ai_usage_events e
     where e.organization_id = o.id
       and e.created_at >= date_trunc('month', now())
  ) t on true
  left join lateral (
    select e.created_at, e.status, e.error_code
      from public.ai_usage_events e
     where e.organization_id = o.id
     order by e.created_at desc
     limit 1
  ) ult on true
  order by p.spent_brl desc, o.name;
end;
$$;

comment on function public.admin_ia_clientes() is
  'Todas as organizações com modo (padrão/exclusiva), fornecedor, consumo e orçamento de IA. Nunca a chave. Só superadmin.';

-- ─── Superadmin: detalhe do cliente ──────────────────────────────────
-- Nulo quando a organização não existe.
create or replace function public.admin_ia_cliente_detalhe(_org_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _org public.organizations;
  _p   record;
  _cfg public.ai_org_settings;
begin
  perform public.platform_admin_require();

  select * into _org from public.organizations where id = _org_id;
  if _org.id is null then
    return null;
  end if;

  select * into _p from public.ia_parametros(_org_id);
  select * into _cfg from public.ai_org_settings where organization_id = _org_id;

  return jsonb_build_object(
    'organizacao', jsonb_build_object('id', _org.id, 'nome', _org.name),
    'plano', _p.plan_id,
    -- O que foi gravado para a organização (nulo = segue o plano/regra) e o
    -- que vale de fato.
    'configuracao', case when _cfg.organization_id is null then null else jsonb_build_object(
      'ia_habilitada', _cfg.ai_enabled,
      'orcamento_cents', _cfg.monthly_budget_cents,
      'alerta_pct', _cfg.alert_threshold_pct,
      'corta_ao_esgotar', _cfg.hard_limit,
      'atualizado_em', _cfg.updated_at
    ) end,
    'efetivo', jsonb_build_object(
      'ia_habilitada', _p.ai_enabled,
      'orcamento_cents', _p.budget_cents,
      'alerta_pct', _p.alert_threshold_pct,
      'corta_ao_esgotar', _p.hard_limit,
      'chave_exclusiva', _p.has_exclusive
    ),
    'gasto_mes_brl', _p.spent_brl,
    'pct_usado', case when _p.budget_cents > 0
                      then round(_p.spent_brl * 100 * 100 / _p.budget_cents, 1) end,
    'requisicoes_mes', _p.requests_month,
    'via_padrao_mes', (
      select count(*)::integer from public.ai_usage_events e
       where e.organization_id = _org_id
         and e.credential_scope = 'via_padrao'
         and e.created_at >= date_trunc('month', now())
    ),
    -- Chaves da organização, a ativa primeiro. Só metadados.
    'credenciais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'fornecedor', c.provider,
               'final_da_chave', c.key_hint,
               'modelo_rapido', c.model_rapido,
               'modelo_padrao', c.model_padrao,
               'modelo_visao', c.model_visao,
               'status', c.status,
               'validada_em', c.last_validated_at,
               'ultimo_erro', c.last_error,
               'ultimo_erro_em', c.last_error_at,
               'criada_em', c.created_at,
               'criada_por', c.created_by,
               'revogada_em', c.revoked_at,
               'revogada_por', c.revoked_by
             ) order by (c.status = 'ativa') desc, c.created_at desc)
        from public.ai_credentials c
       where c.organization_id = _org_id
    ), '[]'::jsonb),
    'auditoria', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'acao', l.action,
               'alvo', l.target_type,
               'antes', l.before,
               'depois', l.after,
               'comentario', l.comment,
               'admin_user_id', l.admin_user_id,
               'em', l.created_at
             ) order by l.created_at desc)
        from public.platform_admin_audit_log l
       where l.organization_id = _org_id
         and l.target_type in ('ai_credential', 'ai_org_settings')
    ), '[]'::jsonb)
  ) || public.ia_consumo_detalhado(_org_id);
end;
$$;

comment on function public.admin_ia_cliente_detalhe(uuid) is
  'IA de uma organização: configuração gravada e efetiva, chaves (só metadados), consumo e auditoria. Só superadmin.';

-- ─── Superadmin: consumo da plataforma ───────────────────────────────
create or replace function public.admin_ia_consumo(_meses integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _inicio date;
begin
  perform public.platform_admin_require();

  if _meses is null or _meses < 1 or _meses > 36 then
    raise exception 'Meses deve estar entre 1 e 36.' using errcode = 'invalid_parameter_value';
  end if;
  _inicio := (date_trunc('month', now()) - make_interval(months => _meses - 1))::date;

  return jsonb_build_object(
    'meses', (
      select jsonb_agg(jsonb_build_object(
               'mes', m.mes::date,
               'requisicoes', coalesce(u.req, 0),
               'tokens_entrada', coalesce(u.tin, 0),
               'tokens_saida', coalesce(u.tout, 0),
               'gasto_brl', coalesce(u.gasto, 0),
               'organizacoes', coalesce(u.orgs, 0)
             ) order by m.mes)
        from generate_series(_inicio, date_trunc('month', now())::date, interval '1 month') as m(mes)
        left join (
          select date_trunc('month', e.created_at)::date as mes,
                 (count(*) filter (where e.status <> 'bloqueado'))::integer as req,
                 sum(e.input_tokens)::bigint as tin,
                 sum(e.output_tokens)::bigint as tout,
                 coalesce(sum(e.estimated_cost_brl), 0) as gasto,
                 count(distinct e.organization_id)::integer as orgs
            from public.ai_usage_events e
           where e.created_at >= _inicio
           group by 1
        ) u on u.mes = m.mes::date
    ),
    'top_mes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'organization_id', t.organization_id,
               'nome', t.name,
               'requisicoes', t.req,
               'gasto_brl', t.gasto
             ) order by t.gasto desc, t.req desc)
        from (
          select e.organization_id, o.name,
                 (count(*) filter (where e.status <> 'bloqueado'))::integer as req,
                 coalesce(sum(e.estimated_cost_brl), 0) as gasto
            from public.ai_usage_events e
            join public.organizations o on o.id = e.organization_id
           where e.created_at >= date_trunc('month', now())
           group by e.organization_id, o.name
           order by gasto desc, req desc
           limit 10
        ) t
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.admin_ia_consumo(integer) is
  'Consumo de IA da plataforma por mês (1–36 meses) e as 10 organizações de maior gasto no mês. Só superadmin.';

-- ─── Superadmin: preços ──────────────────────────────────────────────
create or replace function public.admin_ia_precos()
returns setof public.ai_model_prices
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.platform_admin_require();

  return query
  select * from public.ai_model_prices
   order by provider, model, valid_from desc;
end;
$$;

comment on function public.admin_ia_precos() is
  'Tabela de preços de modelos de IA (reais por 1M de tokens), todas as vigências. Só superadmin.';

-- ─── Permissões ──────────────────────────────────────────────────────
revoke all on function public.ia_parametros(uuid) from public, anon, authenticated;
revoke all on function public.ia_consumo_detalhado(uuid) from public, anon, authenticated;
revoke all on function public.ia_situacao(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ia_consumo_organizacao(uuid) from public, anon;
revoke all on function public.admin_ia_padrao() from public, anon;
revoke all on function public.admin_ia_clientes() from public, anon;
revoke all on function public.admin_ia_cliente_detalhe(uuid) from public, anon;
revoke all on function public.admin_ia_consumo(integer) from public, anon;
revoke all on function public.admin_ia_precos() from public, anon;

grant execute on function public.ia_parametros(uuid) to service_role;
grant execute on function public.ia_consumo_detalhado(uuid) to service_role;
grant execute on function public.ia_situacao(uuid, uuid) to service_role;
grant execute on function public.ia_consumo_organizacao(uuid) to authenticated, service_role;
grant execute on function public.admin_ia_padrao() to authenticated, service_role;
grant execute on function public.admin_ia_clientes() to authenticated, service_role;
grant execute on function public.admin_ia_cliente_detalhe(uuid) to authenticated, service_role;
grant execute on function public.admin_ia_consumo(integer) to authenticated, service_role;
grant execute on function public.admin_ia_precos() to authenticated, service_role;
