-- Testes da IA por organização (0031–0032, backlog IA-03,
-- docs/architecture/plano-ia-por-cliente.md).
--
--   npm run supabase:test        (roda junto com as demais suítes)
--
-- Tudo numa transação revertida no fim: cria os próprios usuários e
-- organizações e não deixa resíduo. Cada verificação que falha levanta
-- exceção; com psql -v ON_ERROR_STOP=1 o script termina com erro.
--
-- Usuários (uuid fixos): A = owner da Org A, B = owner da Org B,
-- C = comercial da Org A, S = superadmin (sem organização).

\echo ''
\echo '=== Testes de IA por organização (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'ia.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '4b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'ia.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '4c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'ia.c@teste.local', '{"full_name":"Comercial C"}'),
  ('00000000-0000-0000-0000-000000000000', '4e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'ia.s@teste.local', '{"full_name":"Superadmin S"}');

-- O superadmin não pertence a organização nenhuma.
delete from public.organization_members where user_id = '4e000000-0000-4000-8000-00000000000e';
delete from public.organizations where owner_id = '4e000000-0000-4000-8000-00000000000e';

insert into public.organizations (id, owner_id, name) values
  ('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'Org A (ia)'),
  ('b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b', 'Org B (ia)');
insert into public.organization_members (organization_id, user_id, role, status) values
  ('a4000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo');

select public.platform_admin_grant('ia.s@teste.local', 'Teste de IA');

-- Chave padrão da plataforma e uso da Org B (para os testes de isolamento).
insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao, model_visao)
values (null, 'openai', 'CIFRA-SECRETA', 'IV-SECRETO', '1234', 'r', 'p', 'v');
insert into public.ai_org_settings (organization_id, monthly_budget_cents) values
  ('b4000000-0000-4000-8000-000000000002', 5000);
insert into public.ai_usage_events (organization_id, user_id, feature, tier, provider, model, credential_scope, estimated_cost_brl, status)
values ('b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b', 'score-leads', 'rapido', 'openai', 'r', 'padrao', 0.10, 'sucesso');

-- (a) restrições das tabelas -------------------------------------------------
do $$
begin
  begin
    insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
    values (null, 'anthropic', 'c', 'i', '9999', 'r', 'p');
    raise exception 'FALHA (a): duas chaves padrão ativas';
  exception when unique_violation then null;
  end;
  insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
  values ('a4000000-0000-4000-8000-000000000001', 'gemini', 'CIFRA-SECRETA', 'IV-SECRETO', 'abcd', 'r', 'p');
  begin
    insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
    values ('a4000000-0000-4000-8000-000000000001', 'openai', 'c', 'i', '9999', 'r', 'p');
    raise exception 'FALHA (a): duas chaves ativas na mesma organização';
  exception when unique_violation then null;
  end;
  begin
    insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
    values ('b4000000-0000-4000-8000-000000000002', 'deepseek', 'c', 'i', '9999', 'r', 'p');
    raise exception 'FALHA (a): fornecedor fora da lista aceito';
  exception when check_violation then null;
  end;
  begin
    update public.ai_credentials set status = 'revogada' where key_hint = 'abcd';
    raise exception 'FALHA (a): chave revogada sem revoked_at';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_usage_events (organization_id, feature, tier, provider, model, credential_scope, status)
    values ('a4000000-0000-4000-8000-000000000001', 'x', 'padrao', 'openai', 'm', 'padrao', 'erro');
    raise exception 'FALHA (a): evento de erro sem error_code';
  exception when check_violation then null;
  end;
  -- Revogar libera outra chave ativa; a revogada vira histórico.
  update public.ai_credentials set status = 'revogada', revoked_at = now() where key_hint = 'abcd';
  insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
  values ('a4000000-0000-4000-8000-000000000001', 'gemini', 'CIFRA-SECRETA', 'IV-SECRETO', 'efgh', 'r', 'p');
  delete from public.ai_credentials where key_hint = 'efgh';
  raise notice 'OK (a): uma chave ativa por organização e uma padrão; listas e estados validados';
end $$;

-- (b) privilégios: nada de chave, preço ou escrita pela API -------------------
do $$
declare _r text;
begin
  foreach _r in array array['anon', 'authenticated'] loop
    if has_table_privilege(_r, 'public.ai_credentials', 'select')
       or has_table_privilege(_r, 'public.ai_model_prices', 'select') then
      raise exception 'FALHA (b): % lê ai_credentials ou ai_model_prices', _r;
    end if;
    if has_table_privilege(_r, 'public.ai_org_settings', 'insert,update,delete')
       or has_table_privilege(_r, 'public.ai_usage_events', 'insert,update,delete')
       or has_table_privilege(_r, 'public.ai_credentials', 'insert,update,delete')
       or has_table_privilege(_r, 'public.ai_model_prices', 'insert,update,delete') then
      raise exception 'FALHA (b): % escreve em tabela de IA', _r;
    end if;
    if has_function_privilege(_r, 'public.ia_situacao(uuid, uuid)', 'execute')
       or has_function_privilege(_r, 'public.ia_parametros(uuid)', 'execute')
       or has_function_privilege(_r, 'public.ia_consumo_detalhado(uuid)', 'execute') then
      raise exception 'FALHA (b): % executa função interna de IA', _r;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.ia_consumo_organizacao(uuid)', 'execute')
     or has_function_privilege('anon', 'public.admin_ia_clientes()', 'execute') then
    raise exception 'FALHA (b): anon executa função de leitura de IA';
  end if;
  -- Nenhuma função de IA expõe a cifra na assinatura.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'ia\_%' or p.proname like 'admin\_ia\_%')
       and p.proargnames && array['key_ciphertext', 'key_iv']
  ) then
    raise exception 'FALHA (b): função de IA com key_ciphertext/key_iv na assinatura';
  end if;
  raise notice 'OK (b): chaves e preços sem acesso pela API; escrita só do servidor; internas só service role';
end $$;

-- Org A: orçamento de R$ 1,00 e uso no mês (inclui via_padrao) e no anterior.
insert into public.ai_org_settings (organization_id, monthly_budget_cents) values
  ('a4000000-0000-4000-8000-000000000001', 100);
insert into public.ai_usage_events (organization_id, user_id, feature, tier, provider, model, credential_scope, estimated_cost_brl, status, created_at)
values
  ('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'score-leads', 'rapido', 'openai', 'r', 'padrao', 0.85, 'sucesso', now()),
  ('a4000000-0000-4000-8000-000000000001', null, 'x', 'padrao', 'openai', 'p', 'padrao', 50, 'sucesso', date_trunc('month', now()) - interval '1 day');
-- Tentativa barrada antes do fornecedor: não conta como requisição.
insert into public.ai_usage_events (organization_id, user_id, feature, tier, provider, model, credential_scope, status, error_code)
values ('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a', 'score-leads', 'rapido', 'openai', 'r', 'padrao', 'bloqueado', 'limite_taxa');

-- (c) ia_situacao: bloqueios, orçamento e limite de taxa ---------------------
do $$
declare s jsonb;
begin
  -- 85% do orçamento: alerta, sem corte. O evento do mês passado não conta;
  -- o bloqueado não conta como requisição.
  s := public.ia_situacao('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a');
  if s->>'bloqueio' is not null or not (s->>'alerta_atingido')::boolean or (s->>'orcamento_esgotado')::boolean
     or (s->>'gasto_mes_brl')::numeric <> 0.85 or (s->>'requisicoes_minuto_org')::int <> 1 then
    raise exception 'FALHA (c): alerta de 80%%: %', s;
  end if;
  -- Chamada via chave padrão (Q4) conta no gasto do cliente: passa de 100%.
  insert into public.ai_usage_events (organization_id, user_id, feature, tier, provider, model, credential_scope, estimated_cost_brl, status)
  values ('a4000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-00000000000c', 'brandtrack-detect-image', 'visao', 'openai', 'v', 'via_padrao', 0.20, 'sucesso');
  s := public.ia_situacao('a4000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-00000000000a');
  if s->>'bloqueio' is distinct from 'orcamento_esgotado' or (s->>'gasto_mes_brl')::numeric <> 1.05
     or (s->>'requisicoes_minuto_org')::int <> 2 or (s->>'requisicoes_minuto_usuario')::int <> 1 then
    raise exception 'FALHA (c): corte em 100%% na chave padrão: %', s;
  end if;
  -- Com chave exclusiva, 100% só alerta (Q5)...
  insert into public.ai_credentials (organization_id, provider, key_ciphertext, key_iv, key_hint, model_rapido, model_padrao)
  values ('a4000000-0000-4000-8000-000000000001', 'gemini', 'CIFRA-SECRETA', 'IV-SECRETO', 'ijkl', 'r', 'p');
  s := public.ia_situacao('a4000000-0000-4000-8000-000000000001', null);
  if s->>'bloqueio' is not null or not (s->>'orcamento_esgotado')::boolean or not (s->>'chave_exclusiva')::boolean then
    raise exception 'FALHA (c): chave exclusiva deveria só alertar: %', s;
  end if;
  -- ...a menos que o superadmin force o corte.
  update public.ai_org_settings set hard_limit = true where organization_id = 'a4000000-0000-4000-8000-000000000001';
  s := public.ia_situacao('a4000000-0000-4000-8000-000000000001', null);
  if s->>'bloqueio' is distinct from 'orcamento_esgotado' then
    raise exception 'FALHA (c): corte forçado: %', s;
  end if;
  -- IA desabilitada vem antes de tudo.
  update public.ai_org_settings set ai_enabled = false where organization_id = 'a4000000-0000-4000-8000-000000000001';
  s := public.ia_situacao('a4000000-0000-4000-8000-000000000001', null);
  if s->>'bloqueio' is distinct from 'ia_desabilitada' then
    raise exception 'FALHA (c): ia_desabilitada: %', s;
  end if;
  update public.ai_org_settings set ai_enabled = true, hard_limit = null where organization_id = 'a4000000-0000-4000-8000-000000000001';
  -- Usuário de fora da organização é recusado.
  begin
    s := public.ia_situacao('b4000000-0000-4000-8000-000000000002', '4a000000-0000-4000-8000-00000000000a');
    raise exception 'FALHA (c): ia_situacao aceitou quem não é membro';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (c): ia_situacao alerta em 80%%, corta em 100%% na chave padrão, só alerta na exclusiva, respeita corte forçado e IA desabilitada';
end $$;

-- (d) owner lê só o que é da própria organização, e não escreve -------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  if exists (select 1 from public.ai_org_settings where organization_id <> 'a4000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.ai_usage_events where organization_id <> 'a4000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (d): owner A lê configuração ou uso de outra organização';
  end if;
  if (select count(*) from public.ai_usage_events where organization_id = 'a4000000-0000-4000-8000-000000000001') <> 4 then
    raise exception 'FALHA (d): owner A não lê o uso da própria organização';
  end if;
  begin
    update public.ai_org_settings set monthly_budget_cents = 999999 where organization_id = 'a4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): owner alterou o próprio orçamento';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_usage_events (organization_id, feature, tier, provider, model, credential_scope, status)
    values ('a4000000-0000-4000-8000-000000000001', 'x', 'padrao', 'openai', 'm', 'padrao', 'sucesso');
    raise exception 'FALHA (d): owner gravou uso';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_usage_events where organization_id = 'a4000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (d): owner apagou uso';
  exception when insufficient_privilege then null;
  end;

  r := public.ia_consumo_organizacao('a4000000-0000-4000-8000-000000000001');
  if (r->>'gasto_mes_brl')::numeric <> 1.05 or (r->>'requisicoes_mes')::int <> 2
     or jsonb_array_length(r->'por_funcionalidade') <> 2 then
    raise exception 'FALHA (d): resumo do owner: %', r;
  end if;
  -- Sem fornecedor, modelo nem chave no resumo.
  if r::text ~ 'CIFRA|IV-SECRETO|openai|gemini|anthropic|ijkl|1234' then
    raise exception 'FALHA (d): resumo do owner expõe fornecedor ou chave: %', r;
  end if;
  begin
    perform public.ia_consumo_organizacao('b4000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (d): owner A leu o resumo da Org B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_ia_clientes();
    raise exception 'FALHA (d): owner executou admin_ia_clientes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (d): owner lê configuração, uso e resumo só da própria organização, sem fornecedor nem chave, e não escreve';
end $$;
reset role;

-- (e) membro que não é owner/admin, e anon ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.ai_usage_events) or exists (select 1 from public.ai_org_settings) then
    raise exception 'FALHA (e): comercial lê uso ou configuração de IA';
  end if;
  begin
    perform public.ia_consumo_organizacao('a4000000-0000-4000-8000-000000000001');
    raise exception 'FALHA (e): comercial leu o resumo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (e): membro que não é owner/admin não lê uso, configuração nem resumo';
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform count(*) from public.ai_usage_events;
    raise exception 'FALHA (e): anon leu uso';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ia_consumo_organizacao('a4000000-0000-4000-8000-000000000001');
    raise exception 'FALHA (e): anon executou o resumo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (e): anon sem acesso';
end $$;
reset role;

-- (f) organização sem acesso: barrada na guarda e na leitura ----------------
update public.billing_accounts set trial_ends_at = now() - interval '1 day'
 where organization_id = 'b4000000-0000-4000-8000-000000000002';
do $$
declare s jsonb;
begin
  s := public.ia_situacao('b4000000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-00000000000b');
  if s->>'bloqueio' is distinct from 'cobranca_bloqueada' then
    raise exception 'FALHA (f): cobrança bloqueada deveria barrar com o próprio motivo: %', s;
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.ai_usage_events where organization_id = 'b4000000-0000-4000-8000-000000000002')
     or exists (select 1 from public.ai_org_settings where organization_id = 'b4000000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (f): organização sem acesso lê o próprio uso/configuração';
  end if;
  begin
    perform public.ia_consumo_organizacao('b4000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (f): organização sem acesso leu o resumo';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (f): organização sem acesso é barrada como cobranca_bloqueada e não lê o próprio uso';
end $$;
reset role;

-- (g) superadmin: metadados, consumo e preços, nunca a cifra ----------------
insert into public.ai_model_prices (provider, model, input_brl_per_mtok, output_brl_per_mtok)
values ('openai', 'r', 1, 4);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"4e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare r jsonb; t text;
begin
  if (select count(*) from public.admin_ia_padrao() where key_hint = '1234') <> 1 then
    raise exception 'FALHA (g): admin_ia_padrao';
  end if;
  select row_to_json(c)::text into t from public.admin_ia_clientes() c
   where organization_id = 'a4000000-0000-4000-8000-000000000001';
  if t is null or t !~ '"mode":"exclusiva"' or t !~ '"provider":"gemini"' or t !~ '"via_padrao_month":1' then
    raise exception 'FALHA (g): admin_ia_clientes (exclusiva): %', t;
  end if;
  select row_to_json(c)::text into t from public.admin_ia_clientes() c
   where organization_id = 'b4000000-0000-4000-8000-000000000002';
  if t !~ '"mode":"padrao"' or t !~ '"provider":"openai"' or t !~ '"plan_id":null' then
    raise exception 'FALHA (g): admin_ia_clientes (padrão, sem acesso): %', t;
  end if;
  select string_agg(row_to_json(c)::text, ',') into t from public.admin_ia_clientes() c;
  if t ~ 'CIFRA|IV-SECRETO' then
    raise exception 'FALHA (g): admin_ia_clientes expõe a cifra';
  end if;

  r := public.admin_ia_cliente_detalhe('a4000000-0000-4000-8000-000000000001');
  if r::text ~ 'CIFRA|IV-SECRETO' then
    raise exception 'FALHA (g): detalhe expõe a cifra';
  end if;
  -- Chaves da organização: a ativa primeiro, a revogada como histórico.
  if jsonb_array_length(r->'credenciais') <> 2 or r->'credenciais'->0->>'status' <> 'ativa'
     or (r->>'via_padrao_mes')::int <> 1 or (r->'efetivo'->>'chave_exclusiva')::boolean is not true then
    raise exception 'FALHA (g): admin_ia_cliente_detalhe: %', r;
  end if;
  if public.admin_ia_cliente_detalhe(gen_random_uuid()) is not null then
    raise exception 'FALHA (g): detalhe de organização inexistente não é nulo';
  end if;

  r := public.admin_ia_consumo(6);
  if jsonb_array_length(r->'meses') <> 6
     or (r->'meses'->5->>'gasto_brl')::numeric < 1.05
     or (r->'meses'->4->>'gasto_brl')::numeric < 50
     or jsonb_array_length(r->'top_mes') < 2 then
    raise exception 'FALHA (g): admin_ia_consumo: %', r;
  end if;
  begin
    perform public.admin_ia_consumo(0);
    raise exception 'FALHA (g): admin_ia_consumo aceitou 0 meses';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.admin_ia_precos() where provider = 'openai' and model = 'r') <> 1 then
    raise exception 'FALHA (g): admin_ia_precos';
  end if;
  -- O superadmin não ganha leitura direta das tabelas de IA de cliente.
  if exists (select 1 from public.ai_usage_events) or exists (select 1 from public.ai_org_settings) then
    raise exception 'FALHA (g): superadmin lê ai_usage_events/ai_org_settings direto';
  end if;
  raise notice 'OK (g): superadmin lê padrão, clientes, detalhe, consumo e preços pelas funções, nunca a cifra';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes de IA ==='
