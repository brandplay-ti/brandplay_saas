-- Testes do superadmin da plataforma (0027–0029, ADR-0008).
--
--   npm run supabase:test        (roda junto com seguranca.sql e cobranca.sql)
--
-- Tudo numa transação revertida no fim: cria os próprios usuários e
-- organizações e não deixa resíduo. Cada verificação que falha levanta
-- exceção; com psql -v ON_ERROR_STOP=1 o script termina com erro.
--
-- Usuários (uuid fixos): S = superadmin (sem organização), A = owner da Org A,
-- B = owner da Org B, X = superadmin revogado.

\echo ''
\echo '=== Testes do superadmin (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '2a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'superadmin.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '2b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'superadmin.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '2e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'superadmin.s@teste.local', '{"full_name":"Superadmin S"}'),
  ('00000000-0000-0000-0000-000000000000', '2d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'superadmin.x@teste.local', '{"full_name":"Ex-superadmin X"}');

-- handle_new_user cria organização pessoal para cadastro sem convite; o
-- superadmin S e o X saem sem ela, como no seed.
delete from public.organization_members where user_id in ('2e000000-0000-4000-8000-00000000000e', '2d000000-0000-4000-8000-00000000000d');
delete from public.organizations where owner_id in ('2e000000-0000-4000-8000-00000000000e', '2d000000-0000-4000-8000-00000000000d');

insert into public.organizations (id, owner_id, name) values
  ('a2000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-00000000000a', 'Org A (superadmin)'),
  ('b2000000-0000-4000-8000-000000000002', '2b000000-0000-4000-8000-00000000000b', 'Org B (superadmin)');

-- Dado de domínio da Org A: o superadmin NÃO deve enxergar.
insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a200000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-00000000000a', 'Sponsor A (superadmin)');

-- Cobrança: Org A assinante Starter com fatura paga; Org B com teste vencido.
insert into public.billing_subscriptions
  (id, organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('5b200000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'starter', 'ativa', 'cus_sa_a', 'sub_sa_a');
insert into public.billing_invoices
  (organization_id, subscription_id, stripe_invoice_id, status, amount_cents, paid_at)
values
  ('a2000000-0000-4000-8000-000000000001', '5b200000-0000-4000-8000-000000000001', 'in_sa_a', 'paga', 49000, now());
update public.billing_accounts set trial_ends_at = now() - interval '1 day'
 where organization_id = 'b2000000-0000-4000-8000-000000000002';

-- (a) concessão: só por quem opera o banco, com comentário, auditada ---------
do $$
begin
  begin
    perform public.platform_admin_grant('superadmin.s@teste.local', '   ');
    raise exception 'FALHA (a): concessão sem comentário';
  exception when check_violation then null;
  end;
  begin
    perform public.platform_admin_grant('ninguem@teste.local', 'Teste');
    raise exception 'FALHA (a): concessão para e-mail sem conta';
  exception when no_data_found then null;
  end;
end $$;

select public.platform_admin_grant('SUPERADMIN.S@teste.local', 'Teste automatizado');
select public.platform_admin_grant('superadmin.x@teste.local', 'Teste automatizado');
select public.platform_admin_revoke('superadmin.x@teste.local', 'Saiu da equipe');

do $$
begin
  if (select count(*) from public.platform_admin_audit_log
       where target_id in ('2e000000-0000-4000-8000-00000000000e', '2d000000-0000-4000-8000-00000000000d')
         and action in ('superadmin_concedido', 'superadmin_revogado')) <> 3 then
    raise exception 'FALHA (a): concessões e revogação não foram auditadas';
  end if;
  if (select revoked_at from public.platform_admins where user_id = '2d000000-0000-4000-8000-00000000000d') is null then
    raise exception 'FALHA (a): revogação não preencheu revoked_at';
  end if;
  raise notice 'OK (a): concessão e revogação exigem motivo e ficam na auditoria';
end $$;

-- (b) autoconcessão impossível -------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  if public.is_platform_admin() then
    raise exception 'FALHA (b): owner comum é superadmin';
  end if;
  begin
    insert into public.platform_admins (user_id, comment) values ('2a000000-0000-4000-8000-00000000000a', 'eu mesmo');
    raise exception 'FALHA (b): usuário se inseriu em platform_admins';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.platform_admins set revoked_at = null where user_id = '2d000000-0000-4000-8000-00000000000d';
    raise exception 'FALHA (b): usuário alterou platform_admins';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.platform_admin_grant('superadmin.a@teste.local', 'eu mesmo');
    raise exception 'FALHA (b): authenticated executou platform_admin_grant';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.platform_admins) <> 0 then
    raise exception 'FALHA (b): owner comum lê vínculos de superadmin de outros';
  end if;
  raise notice 'OK (b): ninguém se torna superadmin pela API';
end $$;
reset role;

-- O superadmin revogado perde o papel na hora.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
begin
  if public.is_platform_admin() then
    raise exception 'FALHA (b): superadmin revogado continua ativo';
  end if;
  begin
    perform * from public.admin_clientes();
    raise exception 'FALHA (b): superadmin revogado listou clientes';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.platform_admins where user_id = '2d000000-0000-4000-8000-00000000000d') <> 1 then
    raise exception 'FALHA (b): usuário não lê o próprio vínculo';
  end if;
  raise notice 'OK (b): revogação vale na próxima consulta';
end $$;
reset role;

-- (c) funções administrativas recusam quem não é superadmin ---------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin perform * from public.admin_clientes();
    raise exception 'FALHA (c): owner comum listou clientes';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_cliente_detalhe('b2000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (c): owner comum abriu detalhe de outra organização';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_faturamento_realizado(12);
    raise exception 'FALHA (c): owner comum leu faturamento realizado';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_faturamento_projetado(6, 6);
    raise exception 'FALHA (c): owner comum leu faturamento projetado';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_liberar_acesso('a2000000-0000-4000-8000-000000000001', 72, 'eu mesmo');
    raise exception 'FALHA (c): owner comum liberou o próprio acesso';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_estender_teste('a2000000-0000-4000-8000-000000000001', 30, 'eu mesmo');
    raise exception 'FALHA (c): owner comum estendeu o próprio teste';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.platform_admin_audit_log) <> 0 then
    raise exception 'FALHA (c): owner comum lê a auditoria da plataforma';
  end if;
  raise notice 'OK (c): funções administrativas recusam quem não é superadmin';
end $$;
reset role;

set local role anon;
do $$
begin
  begin perform * from public.admin_clientes();
    raise exception 'FALHA (c): anon executou admin_clientes';
  exception when insufficient_privilege then null; end;
  begin perform public.is_platform_admin();
    raise exception 'FALHA (c): anon executou is_platform_admin';
  exception when insufficient_privilege then null; end;
  raise notice 'OK (c): anon não executa nada da área administrativa';
end $$;
reset role;

-- (d) owner comum não lê a cobrança de outra organização ------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.billing_subscriptions where organization_id = 'a2000000-0000-4000-8000-000000000001') <> 0
     or (select count(*) from public.billing_invoices where organization_id = 'a2000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (d): owner da Org B lê a cobrança da Org A';
  end if;
  raise notice 'OK (d): as policies novas não abriram a cobrança entre organizações';
end $$;
reset role;

-- (e) superadmin lê toda a cobrança, mas não o domínio dos clientes -------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare _c record; _d jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'FALHA (e): superadmin concedido não é reconhecido';
  end if;
  if (select count(*) from public.billing_subscriptions where stripe_subscription_id = 'sub_sa_a') <> 1
     or (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_sa_a') <> 1
     or (select count(*) from public.billing_accounts
          where organization_id in ('a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FALHA (e): superadmin não lê a cobrança das organizações';
  end if;
  if (select count(*) from public.sponsors where id = '5a200000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (e): superadmin lê patrocinador de cliente (dado de domínio)';
  end if;
  if (select count(*) from public.organizations where id = 'a2000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (e): superadmin lê organizations direto (deveria ser só pelas funções)';
  end if;

  select * into _c from public.admin_clientes() where organization_id = 'a2000000-0000-4000-8000-000000000001';
  -- MRR pelo preço vigente do catálogo (o superadmin pode ter mudado o preço).
  if _c.access_source <> 'subscription' or _c.plan_id <> 'starter'
     or _c.mrr_cents <> (select price_cents from public.billing_plans where id = 'starter')
     or _c.owner_email <> 'superadmin.a@teste.local' then
    raise exception 'FALHA (e): linha da Org A inesperada: %', row_to_json(_c);
  end if;
  select * into _c from public.admin_clientes() where organization_id = 'b2000000-0000-4000-8000-000000000002';
  if _c.access_source <> 'none' or _c.plan_id is not null then
    raise exception 'FALHA (e): Org B com teste vencido deveria estar sem acesso: %', row_to_json(_c);
  end if;

  _d := public.admin_cliente_detalhe('a2000000-0000-4000-8000-000000000001');
  if _d->'organization'->>'name' <> 'Org A (superadmin)'
     or jsonb_array_length(_d->'invoices') <> 1
     or _d->'billing'->>'access_source' <> 'subscription' then
    raise exception 'FALHA (e): detalhe da Org A inesperado: %', _d;
  end if;
  if public.admin_cliente_detalhe('00000000-0000-4000-8000-0000000000ff') is not null then
    raise exception 'FALHA (e): detalhe de organização inexistente deveria ser nulo';
  end if;
  raise notice 'OK (e): superadmin lê cobrança e contagens, não o domínio dos clientes';
end $$;
reset role;

-- (f) liberação e extensão pelo superadmin: exigem motivo, são auditadas ---
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare _r jsonb; _grant uuid; _fim timestamptz;
begin
  begin
    perform public.admin_liberar_acesso('b2000000-0000-4000-8000-000000000002', 48, ' ');
    raise exception 'FALHA (f): liberação sem motivo';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_liberar_acesso('b2000000-0000-4000-8000-000000000002', 10000, 'Prazo absurdo');
    raise exception 'FALHA (f): liberação acima de 720 h';
  exception when check_violation then null;
  end;

  _r := public.admin_liberar_acesso('b2000000-0000-4000-8000-000000000002', 48, 'Boleto pago, compensação atrasada');
  _grant := (_r->>'id')::uuid;
  if (select kind from public.billing_access_grants where id = _grant) <> 'superadmin'
     or (select granted_by from public.billing_access_grants where id = _grant) <> '2e000000-0000-4000-8000-00000000000e' then
    raise exception 'FALHA (f): liberação gravada sem origem/autor do superadmin';
  end if;
  if public.admin_cliente_detalhe('b2000000-0000-4000-8000-000000000002')->'billing'->>'access_source' <> 'provisional' then
    raise exception 'FALHA (f): liberação do superadmin não deu acesso';
  end if;
  if not exists (
    select 1 from public.platform_admin_audit_log
     where action = 'acesso_liberado'
       and organization_id = 'b2000000-0000-4000-8000-000000000002'
       and admin_user_id = '2e000000-0000-4000-8000-00000000000e'
       and comment = 'Boleto pago, compensação atrasada'
       and before->>'access_plan' is null
       and after->>'access_plan' is not null
  ) then
    raise exception 'FALHA (f): liberação não foi auditada com antes/depois';
  end if;

  perform public.admin_revogar_liberacao(_grant, 'Liberado por engano');
  if public.admin_cliente_detalhe('b2000000-0000-4000-8000-000000000002')->'billing'->>'access_source' <> 'none' then
    raise exception 'FALHA (f): revogação não tirou o acesso';
  end if;
  begin
    perform public.admin_revogar_liberacao(_grant, 'De novo');
    raise exception 'FALHA (f): revogou liberação que já não estava vigente';
  exception when check_violation then null;
  end;

  _r := public.admin_estender_teste('b2000000-0000-4000-8000-000000000002', 7, 'Cliente pediu mais prazo');
  _fim := (_r->>'trial_ends_at')::timestamptz;
  if _fim < now() + interval '6 days 23 hours' or _fim > now() + interval '7 days 1 hour' then
    raise exception 'FALHA (f): teste vencido deveria ir a agora + 7 dias, foi a %', _fim;
  end if;
  if (select count(*) from public.platform_admin_audit_log
       where organization_id = 'b2000000-0000-4000-8000-000000000002'
         and action in ('liberacao_revogada', 'teste_estendido')) <> 2 then
    raise exception 'FALHA (f): revogação/extensão não auditadas';
  end if;
  raise notice 'OK (f): liberação, revogação e extensão exigem motivo e ficam na auditoria';
end $$;
reset role;

-- O owner da Org B volta a ter acesso pelo teste estendido.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if (public.billing_status('b2000000-0000-4000-8000-000000000002')->>'source') <> 'trial' then
    raise exception 'FALHA (f): owner não vê o teste estendido';
  end if;
  begin
    update public.billing_access_grants set revoked_at = null where organization_id = 'b2000000-0000-4000-8000-000000000002';
    raise exception 'FALHA (f): owner alterou liberação';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (f): o efeito chega à organização; ela não altera a liberação';
end $$;
reset role;

-- (g) faturamento: caixa no mês do pagamento; MRR só ativa/inadimplente ---
insert into public.billing_subscriptions
  (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('b2000000-0000-4000-8000-000000000002', 'pro', 'incompleta', 'cus_sa_b', 'sub_sa_b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare _mes record; _p jsonb; _mrr_ativas bigint;
begin
  select * into _mes from public.admin_faturamento_realizado(3) order by month desc limit 1;
  if _mes.month <> date_trunc('month', now())::date or _mes.revenue_cents < 49000 or _mes.paid_invoices < 1 then
    raise exception 'FALHA (g): fatura paga no mês não entrou no realizado: %', row_to_json(_mes);
  end if;
  if (select count(*) from public.admin_faturamento_realizado(3)) <> 3 then
    raise exception 'FALHA (g): realizado deveria ter 3 meses';
  end if;

  -- O banco de teste pode ter outras assinaturas: compara com a mesma regra.
  select coalesce(sum(p.price_cents), 0) into _mrr_ativas
    from public.billing_subscriptions s join public.billing_plans p on p.id = s.plan_id
   where s.status in ('ativa', 'inadimplente');
  _p := public.admin_faturamento_projetado(6, 6);
  if (_p->>'mrr_cents')::bigint <> _mrr_ativas then
    raise exception 'FALHA (g): MRR % diferente de ativa+inadimplente %', _p->>'mrr_cents', _mrr_ativas;
  end if;
  if (_p->>'awaiting_payment')::int < 1 then
    raise exception 'FALHA (g): contratação incompleta não aparece aguardando pagamento';
  end if;
  if jsonb_array_length(_p->'months') <> 6 then
    raise exception 'FALHA (g): projeção deveria ter 6 meses';
  end if;
  raise notice 'OK (g): realizado por caixa e MRR só com assinaturas ativas ou em atraso';
end $$;
reset role;

-- (h) a auditoria é imutável pela API -------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"2e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.platform_admin_audit_log) = 0 then
    raise exception 'FALHA (h): superadmin não lê a auditoria';
  end if;
  begin
    insert into public.platform_admin_audit_log (action) values ('forjada');
    raise exception 'FALHA (h): superadmin inseriu na auditoria pela API';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.platform_admin_audit_log;
    raise exception 'FALHA (h): superadmin apagou a auditoria pela API';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.billing_invoices (organization_id, stripe_invoice_id, status, amount_cents)
    values ('a2000000-0000-4000-8000-000000000001', 'in_forjada', 'paga', 1);
    raise exception 'FALHA (h): superadmin gravou fatura pela API';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (h): auditoria e cobrança continuam só de leitura para o superadmin';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes do superadmin ==='
