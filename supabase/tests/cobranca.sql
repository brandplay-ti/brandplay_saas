-- Testes de cobrança e planos (0024, ADR-0007, docs/business/cobranca.md).
--
--   npm run supabase:test        (roda junto com seguranca.sql)
--
-- Tudo numa transação revertida no fim: cria os próprios usuários e
-- organizações e não deixa resíduo. Cada verificação que falha levanta
-- exceção; com psql -v ON_ERROR_STOP=1 o script termina com erro.
--
-- Usuários (uuid fixos): A = owner da Org A, B = owner da Org B,
-- C = financeiro na Org A.

\echo ''
\echo '=== Testes de cobrança (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '1a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'cobranca.a@teste.local', '{"full_name":"Cobranca A"}'),
  ('00000000-0000-0000-0000-000000000000', '1b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'cobranca.b@teste.local', '{"full_name":"Cobranca B"}'),
  ('00000000-0000-0000-0000-000000000000', '1c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'cobranca.c@teste.local', '{"full_name":"Cobranca C"}');

insert into public.organizations (id, owner_id, name) values
  ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Org A (cobrança)'),
  ('b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b', 'Org B (cobrança)');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a1000000-0000-4000-8000-000000000001', '1c000000-0000-4000-8000-00000000000c', 'financeiro', 'ativo'),
  -- A também é membro da Org B: o bloqueio de B não pode alcançar A.
  ('b1000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-00000000000a', 'comercial', 'ativo');

-- Dados da Org B para o bloqueio (k..m): patrocinador, entrega, propriedade
-- publicada e um usuário do portal do patrocinador (P), que não é membro.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'cobranca.p@teste.local', '{"full_name":"Patrocinador P"}');
insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5b100000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b', 'Sponsor B (cobrança)');
insert into public.deliveries (id, organization_id, owner_id, sponsor_id, title, brand) values
  ('de100000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b',
   '5b100000-0000-4000-8000-000000000002', 'Entrega B', 'Marca B');
insert into public.sports_properties (id, organization_id, owner_id, name, category, is_published) values
  ('9b100000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b',
   'Propriedade publicada B', 'futebol', true);
insert into public.sponsor_portal_access (organization_id, sponsor_id, user_id, granted_by, status) values
  ('b1000000-0000-4000-8000-000000000002', '5b100000-0000-4000-8000-000000000002',
   '1f000000-0000-4000-8000-00000000000f', '1b000000-0000-4000-8000-00000000000b', 'ativo');

-- (a) organização nova nasce com conta de cobrança e teste de 14 dias -------
do $$
declare _fim timestamptz;
begin
  select trial_ends_at into _fim
    from public.billing_accounts
   where organization_id = 'a1000000-0000-4000-8000-000000000001';
  if _fim is null then
    raise exception 'FALHA (a): organização nova sem conta de cobrança';
  end if;
  if _fim < now() + interval '13 days 23 hours' or _fim > now() + interval '14 days 1 hour' then
    raise exception 'FALHA (a): teste deveria acabar em 14 dias, acaba em %', _fim;
  end if;
  raise notice 'OK (a): organização nova ganha teste de 14 dias';
end $$;

-- (b) status: membro vê acesso pelo teste; não membro é recusado ------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('a1000000-0000-4000-8000-000000000001');
  if (_s->>'access')::boolean is not true or _s->>'source' <> 'trial' or _s->'plan'->>'id' <> 'pro' then
    raise exception 'FALHA (b): status do teste inesperado: %', _s;
  end if;
  begin
    perform public.billing_status('b1000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (b): não membro consultou o status de outra organização';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (b): status do teste visível ao membro, recusado ao não membro';
end $$;
reset role;

-- Assinatura Starter ativa para a Org A (como o webhook gravaria).
insert into public.billing_subscriptions
  (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('a1000000-0000-4000-8000-000000000001', 'starter', 'ativa', 'cus_teste_a', 'sub_teste_a');
insert into public.billing_invoices
  (organization_id, stripe_invoice_id, status, amount_cents)
values
  ('a1000000-0000-4000-8000-000000000001', 'in_teste_a', 'paga', 49000);

-- (c) RLS: só owner/admin da própria organização lê; ninguém escreve --------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.billing_subscriptions where stripe_subscription_id = 'sub_teste_a') <> 1 then
    raise exception 'FALHA (c): owner não lê a assinatura da própria organização';
  end if;
  if (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_teste_a') <> 1 then
    raise exception 'FALHA (c): owner não lê a fatura da própria organização';
  end if;
  begin
    update public.billing_accounts set trial_ends_at = now() + interval '10 years'
     where organization_id = 'a1000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (c): owner estendeu o próprio teste';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.billing_subscriptions (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
    values ('a1000000-0000-4000-8000-000000000001', 'pro', 'ativa', 'cus_x', 'sub_forjada');
    raise exception 'FALHA (c): owner gravou assinatura pela API';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.billing_stripe_events;
    raise exception 'FALHA (c): authenticated leu billing_stripe_events';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (c): owner lê a cobrança da própria organização e não escreve';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_teste_a') <> 0 then
    raise exception 'FALHA (c): membro financeiro lê faturas (só owner/admin)';
  end if;
  raise notice 'OK (c): membro que não é owner/admin não lê faturas';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.billing_subscriptions where stripe_subscription_id = 'sub_teste_a') <> 0 then
    raise exception 'FALHA (c): owner da Org B lê assinatura da Org A';
  end if;
  raise notice 'OK (c): isolamento da cobrança entre organizações';
end $$;
reset role;

set local role anon;
do $$
begin
  if (select count(*) from public.billing_plans where active) < 2 then
    raise exception 'FALHA (c): catálogo não é legível sem sessão';
  end if;
  raise notice 'OK (c): catálogo de planos legível sem sessão';
end $$;
reset role;

-- (d) limite de propriedades (Starter = 3 raízes; edição não conta) ---------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare _hint text; _detail text; _raiz uuid;
begin
  -- organization_id explícito: sem ele, `set_org_id` usaria a organização
  -- mais antiga do usuário, que é a pessoal criada por handle_new_user.
  insert into public.sports_properties (organization_id, owner_id, name, category)
  values ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Raiz 1', 'futebol')
  returning id into _raiz;
  insert into public.sports_properties (organization_id, owner_id, name, category)
  values ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Raiz 2', 'futebol'),
         ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Raiz 3', 'futebol');

  -- edição de uma propriedade existente: não ocupa vaga
  insert into public.sports_properties (organization_id, owner_id, name, category, parent_property_id, season_year)
  values ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Raiz 1 2027',
          'futebol', _raiz, 2027);

  begin
    insert into public.sports_properties (organization_id, owner_id, name, category)
    values ('a1000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-00000000000a', 'Raiz 4', 'futebol');
    raise exception 'FALHA (d): quarta propriedade aceita no Starter';
  exception when check_violation then
    get stacked diagnostics _hint = pg_exception_hint, _detail = pg_exception_detail;
    if _hint <> 'limite_plano:propriedades' or _detail <> 'pro' then
      raise exception 'FALHA (d): erro de limite sem hint/sugestão esperados (% / %)', _hint, _detail;
    end if;
  end;
  raise notice 'OK (d): Starter bloqueia a 4ª propriedade raiz e sugere o Pro; edição não conta';
end $$;
reset role;

-- (e) limite de usuários (Starter = 1; a Org A já tem 2 membros) ------------
do $$
declare _hint text; _detail text;
begin
  begin
    insert into public.organization_invites (organization_id, email, role, invited_by)
    values ('a1000000-0000-4000-8000-000000000001', 'novo@teste.local', 'comercial', '1a000000-0000-4000-8000-00000000000a');
    raise exception 'FALHA (e): convite aceito acima do limite do Starter';
  exception when check_violation then
    get stacked diagnostics _hint = pg_exception_hint, _detail = pg_exception_detail;
    if _hint <> 'limite_plano:usuarios' or _detail <> 'pro' then
      raise exception 'FALHA (e): erro de limite sem hint/sugestão esperados (% / %)', _hint, _detail;
    end if;
  end;
  raise notice 'OK (e): Starter bloqueia convite acima do limite de usuários';
end $$;

-- (f) Pro = 10 usuários: convite reserva vaga; aceitar nunca é bloqueado ----
update public.billing_subscriptions set plan_id = 'pro' where stripe_subscription_id = 'sub_teste_a';

do $$
declare i int; _hint text;
begin
  -- 2 membros ativos + 8 convites = 10 vagas
  for i in 1..8 loop
    insert into public.organization_invites (organization_id, email, role, invited_by)
    values ('a1000000-0000-4000-8000-000000000001', format('convidado%s@teste.local', i), 'comercial',
            '1a000000-0000-4000-8000-00000000000a');
  end loop;

  begin
    insert into public.organization_invites (organization_id, email, role, invited_by)
    values ('a1000000-0000-4000-8000-000000000001', 'excedente@teste.local', 'comercial',
            '1a000000-0000-4000-8000-00000000000a');
    raise exception 'FALHA (f): 11º usuário aceito no Pro';
  exception when check_violation then
    get stacked diagnostics _hint = pg_exception_hint;
    if _hint <> 'limite_plano:usuarios' then
      raise exception 'FALHA (f): hint inesperado %', _hint;
    end if;
  end;

  -- O convidado se cadastra: handle_new_user aceita o convite e o insere como
  -- membro. Com as 10 vagas ocupadas, passa porque a vaga era dele.
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
    ('00000000-0000-0000-0000-000000000000', '1d000000-0000-4000-8000-00000000000d', 'authenticated',
     'authenticated', 'convidado1@teste.local', '{"full_name":"Convidado 1"}');

  if not exists (
    select 1 from public.organization_members
     where organization_id = 'a1000000-0000-4000-8000-000000000001'
       and user_id = '1d000000-0000-4000-8000-00000000000d'
       and status = 'ativo'
  ) then
    raise exception 'FALHA (f): convidado não virou membro ao se cadastrar';
  end if;
  raise notice 'OK (f): convite reserva vaga e o aceite não é bloqueado no limite';
end $$;

-- (g) reativação acima do limite é bloqueada --------------------------------
do $$
declare _hint text;
begin
  update public.organization_members set status = 'revogado'
   where organization_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = '1c000000-0000-4000-8000-00000000000c';

  -- a vaga liberada é ocupada por um convite novo
  insert into public.organization_invites (organization_id, email, role, invited_by)
  values ('a1000000-0000-4000-8000-000000000001', 'ocupa@teste.local', 'comercial',
          '1a000000-0000-4000-8000-00000000000a');

  begin
    update public.organization_members set status = 'ativo'
     where organization_id = 'a1000000-0000-4000-8000-000000000001'
       and user_id = '1c000000-0000-4000-8000-00000000000c';
    raise exception 'FALHA (g): reativação aceita acima do limite';
  exception when check_violation then
    get stacked diagnostics _hint = pg_exception_hint;
    if _hint <> 'limite_plano:usuarios' then
      raise exception 'FALHA (g): hint inesperado %', _hint;
    end if;
  end;
  raise notice 'OK (g): reativação acima do limite é bloqueada';
end $$;

-- (h) teste vencido e sem assinatura: sem acesso, sem crescer ---------------
update public.billing_accounts set trial_ends_at = now() - interval '1 day'
 where organization_id = 'b1000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb; _hint text;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if (_s->>'access')::boolean is not false or _s->>'source' <> 'none' or _s->'plan' <> 'null'::jsonb then
    raise exception 'FALHA (h): organização com teste vencido ainda tem acesso: %', _s;
  end if;
  begin
    insert into public.sports_properties (organization_id, owner_id, name, category)
    values ('b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b', 'Depois do teste', 'futebol');
    raise exception 'FALHA (h): propriedade criada sem plano';
  exception when check_violation then
    get stacked diagnostics _hint = pg_exception_hint;
    if _hint <> 'limite_plano:sem_plano' then
      raise exception 'FALHA (h): hint inesperado %', _hint;
    end if;
  end;
  raise notice 'OK (h): teste vencido sem assinatura bloqueia acesso e cadastro';
end $$;
reset role;

-- (i) assinatura cancelada não dá acesso; inadimplente dá -------------------
insert into public.billing_subscriptions
  (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('b1000000-0000-4000-8000-000000000002', 'starter', 'cancelada', 'cus_teste_b', 'sub_teste_b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (public.billing_status('b1000000-0000-4000-8000-000000000002')->>'access')::boolean then
    raise exception 'FALHA (i): assinatura cancelada deu acesso';
  end if;
end $$;
reset role;

update public.billing_subscriptions set status = 'inadimplente' where stripe_subscription_id = 'sub_teste_b';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if (_s->>'access')::boolean is not true or _s->>'source' <> 'subscription' then
    raise exception 'FALHA (i): assinatura inadimplente deveria manter o acesso: %', _s;
  end if;
  raise notice 'OK (i): cancelada não dá acesso; inadimplente mantém enquanto o Stripe cobra';
end $$;
reset role;

-- (j) carga em massa pode ignorar os limites na transação -------------------
update public.billing_subscriptions set status = 'cancelada' where stripe_subscription_id = 'sub_teste_b';
set local brandplay.ignorar_limites = 'on';
insert into public.sports_properties (organization_id, owner_id, name, category)
values ('b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b', 'Importada', 'futebol');
set local brandplay.ignorar_limites = 'off';
\echo 'OK (j): carga com brandplay.ignorar_limites ignora os limites'

-- (k) liberação provisória enquanto o boleto compensa (0025) ---------------
-- Org B: teste vencido; nova contratação Starter com boleto aguardando.
insert into public.billing_subscriptions
  (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('b1000000-0000-4000-8000-000000000002', 'starter', 'incompleta', 'cus_teste_b', 'sub_teste_b2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (public.billing_status('b1000000-0000-4000-8000-000000000002')->>'access')::boolean then
    raise exception 'FALHA (k): boleto aguardando, sem liberação, já dá acesso';
  end if;
  begin
    insert into public.billing_access_grants (organization_id, kind, stripe_invoice_id, receipt_path, expires_at)
    values ('b1000000-0000-4000-8000-000000000002', 'confianca', 'in_forjada',
            'b1000000-0000-4000-8000-000000000002/x.pdf', now() + interval '10 years');
    raise exception 'FALHA (k): cliente gravou a própria liberação pela API';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Como a manage-billing gravaria, depois de conferir a fatura no Stripe.
insert into public.billing_access_grants
  (organization_id, kind, stripe_invoice_id, receipt_path, granted_by, expires_at)
values
  ('b1000000-0000-4000-8000-000000000002', 'confianca', 'in_boleto_b',
   'b1000000-0000-4000-8000-000000000002/comprovante.pdf', '1b000000-0000-4000-8000-00000000000b',
   now() + interval '72 hours');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if (_s->>'access')::boolean is not true or _s->>'source' <> 'provisional'
     or _s->'plan'->>'id' <> 'starter' or _s->'provisional_access' = 'null'::jsonb then
    raise exception 'FALHA (k): liberação vigente não dá acesso com o plano contratado: %', _s;
  end if;
  raise notice 'OK (k): liberação provisória dá acesso, com os limites do plano contratado';
end $$;
reset role;

do $$
begin
  begin
    insert into public.billing_access_grants
      (organization_id, kind, stripe_invoice_id, receipt_path, expires_at)
    values
      ('b1000000-0000-4000-8000-000000000002', 'confianca', 'in_boleto_b',
       'b1000000-0000-4000-8000-000000000002/outro.pdf', now() + interval '72 hours');
    raise exception 'FALHA (k): segunda liberação em confiança para a mesma fatura';
  exception when unique_violation then null;
  end;
  begin
    insert into public.billing_access_grants (organization_id, kind, expires_at)
    values ('b1000000-0000-4000-8000-000000000002', 'manual', now() + interval '1 day');
    raise exception 'FALHA (k): liberação manual sem comentário';
  exception when check_violation then null;
  end;
  raise notice 'OK (k): uma liberação em confiança por fatura; manual exige comentário';
end $$;

-- O prazo passa: o acesso cai sozinho.
update public.billing_access_grants set expires_at = now() - interval '1 minute'
 where organization_id = 'b1000000-0000-4000-8000-000000000002';

-- (l) bloqueio total no banco (0026) — a Org B está sem acesso ---------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (public.billing_status('b1000000-0000-4000-8000-000000000002')->>'access')::boolean then
    raise exception 'FALHA (l): liberação vencida ainda dá acesso';
  end if;
  if (select count(*) from public.sponsors where id = '5b100000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALHA (l): membro de organização sem acesso lê patrocinador';
  end if;
  if (select count(*) from public.deliveries where id = 'de100000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALHA (l): membro de organização sem acesso lê entrega';
  end if;
  update public.sponsors set name = 'Alterado' where id = '5b100000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA (l): membro de organização sem acesso alterou patrocinador'; end if;
  begin
    insert into public.sponsors (organization_id, owner_id, name)
    values ('b1000000-0000-4000-8000-000000000002', '1b000000-0000-4000-8000-00000000000b', 'Novo');
    raise exception 'FALHA (l): membro de organização sem acesso inseriu patrocinador';
  exception when insufficient_privilege then null;
  end;

  -- o que precisa continuar acessível para regularizar
  if (select count(*) from public.organizations where id = 'b1000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FALHA (l): owner bloqueado não lê a própria organização';
  end if;
  if (select count(*) from public.organization_members where organization_id = 'b1000000-0000-4000-8000-000000000002') < 1 then
    raise exception 'FALHA (l): owner bloqueado não lê a equipe';
  end if;
  if (select count(*) from public.billing_subscriptions where organization_id = 'b1000000-0000-4000-8000-000000000002') < 1 then
    raise exception 'FALHA (l): owner bloqueado não lê a assinatura para regularizar';
  end if;
  raise notice 'OK (l): organização sem acesso fica bloqueada no banco, menos o necessário para regularizar';
end $$;
reset role;

-- A é membro da Org A (com acesso) e da Org B (sem): o bloqueio é por organização.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sponsors where id = '5b100000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALHA (l): A lê patrocinador da Org B, que está sem acesso';
  end if;
  if (select count(*) from public.sports_properties where organization_id = 'a1000000-0000-4000-8000-000000000001') < 3 then
    raise exception 'FALHA (l): o bloqueio da Org B alcançou a Org A';
  end if;
  raise notice 'OK (l): o bloqueio vale por organização';
end $$;
reset role;

-- P (portal do patrocinador) não é membro da Org B: continua vendo a entrega.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.deliveries where id = 'de100000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FALHA (l): o portal do patrocinador perdeu acesso com a organização bloqueada';
  end if;
  raise notice 'OK (l): portal do patrocinador não é afetado';
end $$;
reset role;

set local role anon;
do $$
begin
  if (select count(*) from public.sports_properties where id = '9b100000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FALHA (l): Media Kit público sumiu com a organização bloqueada';
  end if;
  raise notice 'OK (l): Media Kit público não é afetado';
end $$;
reset role;

-- (m) cobertura: toda tabela de organização tem a policy de bloqueio ---------
-- A lista de exceções é a da 0026 mais a auditoria da plataforma (0027).
-- Tabela nova com organization_id que não estiver aqui precisa da policy
-- `billing_access_restrictive`.
do $$
declare _faltando text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into _faltando
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     )
     and c.relname <> all (array[
       'billing_accounts', 'billing_subscriptions', 'billing_invoices', 'billing_access_grants',
       -- Desconto do superadmin: a tela de plano e a área /admin leem com a
       -- organização bloqueada (0035).
       'billing_discounts',
       'organization_members', 'organization_invites', 'backend_error_logs', 'error_reports',
       -- Dado da plataforma, não da organização: só o superadmin lê (0027).
       'platform_admin_audit_log',
       -- Sessão do operador, não dado da organização (0035).
       'platform_support_sessions',
       -- Chaves de IA cifradas: dado da plataforma, sem acesso nenhum pela
       -- API — nem do owner (0031).
       'ai_credentials'
     ])
     and not exists (
       select 1 from pg_policy p
        where p.polrelid = c.oid and p.polname = 'billing_access_restrictive' and not p.polpermissive
     );
  if _faltando is not null then
    raise exception 'FALHA (m): tabelas de organização sem bloqueio de cobrança (0026): %', _faltando;
  end if;
  raise notice 'OK (m): toda tabela de organização tem a policy de bloqueio de cobrança';
end $$;

-- (n) isenção de 100% tira o aviso de teste e mantém o acesso (0039) --------
-- Org B está sem acesso: teste vencido, liberação vencida, sem assinatura paga.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.billing_discounts (organization_id, percent_off, duration_months, comment)
    values ('b1000000-0000-4000-8000-000000000002', 100, 12, 'cliente não concede isenção');
    raise exception 'FALHA (n): o cliente gravou a própria isenção';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

insert into public.billing_discounts
  (organization_id, percent_off, duration_months, comment, stripe_status)
values
  ('b1000000-0000-4000-8000-000000000002', 100, 12, 'cortesia de um ano', 'aguardando_checkout');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if (_s->>'access')::boolean is not true or _s->>'source' <> 'exemption'
     or _s->'plan'->>'id' <> 'pro' or _s->>'exemption_ends_at' is null then
    raise exception 'FALHA (n): isenção de 100%% não deu acesso: %', _s;
  end if;
  if (select count(*) from public.sponsors where id = '5b100000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'FALHA (n): isenção vigente continuou bloqueando o dado da organização';
  end if;
  raise notice 'OK (n): isenção de 100%% mantém o acesso, fora do teste';
end $$;
reset role;

-- 50% não substitui o teste nem destranca quem já está sem acesso.
update public.billing_discounts
   set revoked_at = now(), stripe_status = 'revogado'
 where organization_id = 'b1000000-0000-4000-8000-000000000002'
   and percent_off = 100;

insert into public.billing_discounts
  (organization_id, percent_off, duration_months, comment, stripe_status)
values
  ('b1000000-0000-4000-8000-000000000002', 50, 12, 'meio desconto', 'aguardando_checkout');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if (_s->>'access')::boolean or _s->>'source' <> 'none' then
    raise exception 'FALHA (n): desconto de 50%% deu acesso: %', _s;
  end if;
end $$;
reset role;

-- Com o teste ainda valendo, 50% continua teste; 100% vira isenção.
update public.billing_accounts
   set trial_ends_at = now() + interval '10 days'
 where organization_id = 'b1000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if public.billing_status('b1000000-0000-4000-8000-000000000002')->>'source' <> 'trial' then
    raise exception 'FALHA (n): desconto parcial escondeu o teste';
  end if;
end $$;
reset role;

update public.billing_discounts
   set revoked_at = now(), stripe_status = 'revogado'
 where organization_id = 'b1000000-0000-4000-8000-000000000002'
   and percent_off = 50
   and revoked_at is null;

insert into public.billing_discounts
  (organization_id, percent_off, duration_months, comment, stripe_status)
values
  ('b1000000-0000-4000-8000-000000000002', 100, 12, 'isenta durante o teste', 'pendente');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('b1000000-0000-4000-8000-000000000002');
  if _s->>'source' <> 'exemption' then
    raise exception 'FALHA (n): isenção durante o teste continuou como teste: %', _s;
  end if;
end $$;
reset role;

-- Fora do prazo, falha no Stripe e assinatura paga não contam como isenção.
update public.billing_discounts
   set created_at = now() - interval '13 months'
 where organization_id = 'b1000000-0000-4000-8000-000000000002'
   and percent_off = 100
   and revoked_at is null;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if public.billing_status('b1000000-0000-4000-8000-000000000002')->>'source' <> 'trial' then
    raise exception 'FALHA (n): isenção vencida ainda esconde o teste';
  end if;
end $$;
reset role;

update public.billing_discounts
   set created_at = now(), stripe_status = 'falhou'
 where organization_id = 'b1000000-0000-4000-8000-000000000002'
   and percent_off = 100
   and revoked_at is null;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if public.billing_status('b1000000-0000-4000-8000-000000000002')->>'source' <> 'trial' then
    raise exception 'FALHA (n): isenção que falhou no Stripe escondeu o teste';
  end if;
end $$;
reset role;

-- Org A tem assinatura ativa: a isenção não troca a situação.
insert into public.billing_discounts
  (organization_id, percent_off, duration_months, comment, stripe_status)
values
  ('a1000000-0000-4000-8000-000000000001', 100, 12, 'assinante isento', 'aplicado');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"1a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.billing_status('a1000000-0000-4000-8000-000000000001');
  if _s->>'source' <> 'subscription' or _s->>'exemption_ends_at' is null then
    raise exception 'FALHA (n): assinatura deveria prevalecer sobre a isenção: %', _s;
  end if;
  raise notice 'OK (n): parcial, vencida e falha não isentam; assinatura prevalece';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes de cobrança ==='
