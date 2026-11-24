-- Testes do perfil Suporte da equipe da plataforma (0046, BP-4).
--
--   npm run supabase:test
--
-- Tudo numa transação revertida no fim. Cada verificação que falha levanta
-- exceção; com psql -v ON_ERROR_STOP=1 o script termina com erro.
--
-- Usuários (uuid fixos): S = superadmin (sem organização), P = suporte criado
-- com pré-cadastro, A = owner da Org A.

\echo ''
\echo '=== Testes da equipe da plataforma (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '3a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'equipe.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '3e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'equipe.s@teste.local', '{"full_name":"Superadmin S"}');

-- O superadmin S entrou sem pré-cadastro: sai sem a organização pessoal.
delete from public.organization_members where user_id = '3e000000-0000-4000-8000-00000000000e';
delete from public.organizations where owner_id = '3e000000-0000-4000-8000-00000000000e';

insert into public.organizations (id, owner_id, name) values
  ('a3000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-00000000000a', 'Org A (equipe)');

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-00000000000a', 'Sponsor A (equipe)');

insert into public.billing_subscriptions
  (id, organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values
  ('5b300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'starter', 'ativa', 'cus_eq_a', 'sub_eq_a');
insert into public.billing_invoices
  (id, organization_id, subscription_id, stripe_invoice_id, status, amount_cents)
values
  ('1b300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '5b300000-0000-4000-8000-000000000001', 'in_eq_a', 'aberta', 49000);
insert into public.billing_discounts (organization_id, percent_off, duration_months, comment)
values ('a3000000-0000-4000-8000-000000000001', 10, 3, 'Desconto de teste');

select public.platform_admin_grant('equipe.s@teste.local', 'Teste automatizado');

-- (a) pré-cadastro: só o superadmin; a conta nova nasce sem organização ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin perform public.admin_equipe_pre_cadastro('equipe.p@teste.local');
    raise exception 'FALHA (a): owner comum gravou pré-cadastro da equipe';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.platform_staff_signups;
    raise exception 'FALHA (a): authenticated lê platform_staff_signups';
  exception when insufficient_privilege then null; end;
  raise notice 'OK (a): pré-cadastro fechado para quem não é superadmin';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
select public.admin_equipe_pre_cadastro(' Equipe.P@teste.local ');
reset role;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '3f000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'equipe.p@teste.local', '{"full_name":"Suporte P"}');

do $$
begin
  if exists (select 1 from public.organizations where owner_id = '3f000000-0000-4000-8000-00000000000f')
     or exists (select 1 from public.organization_members where user_id = '3f000000-0000-4000-8000-00000000000f') then
    raise exception 'FALHA (a): conta da equipe ganhou organização pessoal';
  end if;
  raise notice 'OK (a): conta com pré-cadastro nasce sem organização pessoal';
end $$;

-- (b) concessão de suporte: só superadmin, com motivo, nunca superadmin ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin perform public.admin_equipe_conceder_suporte('equipe.a@teste.local', 'eu mesmo');
    raise exception 'FALHA (b): owner comum se concedeu suporte';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_equipe();
    raise exception 'FALHA (b): owner comum listou a equipe';
  exception when insufficient_privilege then null; end;
  raise notice 'OK (b): owner comum não mexe na equipe';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare _n integer;
begin
  begin perform public.admin_equipe_conceder_suporte('equipe.p@teste.local', ' ');
    raise exception 'FALHA (b): concessão sem motivo';
  exception when check_violation then null; end;
  begin perform public.admin_equipe_conceder_suporte('ninguem@teste.local', 'Atendimento');
    raise exception 'FALHA (b): concessão para e-mail sem conta';
  exception when no_data_found then null; end;
  begin perform public.admin_equipe_conceder_suporte('equipe.s@teste.local', 'Rebaixar');
    raise exception 'FALHA (b): superadmin rebaixado a suporte pela tela';
  exception when check_violation then null; end;

  perform public.admin_equipe_conceder_suporte('EQUIPE.P@teste.local', 'Atendimento ao cliente');

  select count(*) into _n from public.admin_equipe()
   where (user_id = '3f000000-0000-4000-8000-00000000000f' and role = 'suporte' and revoked_at is null)
      or (user_id = '3e000000-0000-4000-8000-00000000000e' and role = 'superadmin');
  if _n <> 2 then
    raise exception 'FALHA (b): admin_equipe não mostra o superadmin e o suporte';
  end if;
  if (select count(*) from public.platform_admin_audit_log
       where action = 'suporte_concedido' and target_id = '3f000000-0000-4000-8000-00000000000f'
         and admin_user_id = '3e000000-0000-4000-8000-00000000000e') <> 1 then
    raise exception 'FALHA (b): concessão de suporte não auditada';
  end if;
  raise notice 'OK (b): superadmin concede suporte com motivo e auditoria, sem rebaixar superadmin';
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.platform_staff_signups where email = 'equipe.p@teste.local' and consumed_at is null) then
    raise exception 'FALHA (b): pré-cadastro não foi consumido na concessão';
  end if;
end $$;

-- (c) o suporte: clientes, ficha e descontos; nada de faturamento -------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
declare _c record; _d jsonb;
begin
  if public.is_platform_admin() or not public.is_platform_staff() or public.platform_role() <> 'suporte' then
    raise exception 'FALHA (c): papel do suporte mal reconhecido';
  end if;

  select * into _c from public.admin_clientes() where organization_id = 'a3000000-0000-4000-8000-000000000001';
  if _c.organization_id is null or _c.open_invoices <> 1 then
    raise exception 'FALHA (c): suporte não lista o cliente: %', row_to_json(_c);
  end if;
  if _c.mrr_cents is not null then
    raise exception 'FALHA (c): suporte recebeu MRR do cliente';
  end if;
  _d := public.admin_cliente_detalhe('a3000000-0000-4000-8000-000000000001');
  if jsonb_array_length(_d->'invoices') <> 1 then
    raise exception 'FALHA (c): suporte não vê as faturas da ficha: %', _d;
  end if;
  if (select count(*) from public.admin_tipos_de_cliente()) = 0
     or public.admin_tipo_de_cliente('a3000000-0000-4000-8000-000000000001') is null then
    raise exception 'FALHA (c): suporte não lê o tipo de cliente';
  end if;
  if (select count(*) from public.billing_discounts where organization_id = 'a3000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA (c): suporte não lê os descontos da ficha';
  end if;

  begin perform * from public.admin_faturamento_realizado(12);
    raise exception 'FALHA (c): suporte leu faturamento realizado';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_faturamento_projetado(6, 6);
    raise exception 'FALHA (c): suporte leu faturamento projetado';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_liberar_acesso('a3000000-0000-4000-8000-000000000001', 24, 'Teste');
    raise exception 'FALHA (c): suporte liberou acesso';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_estender_teste('a3000000-0000-4000-8000-000000000001', 7, 'Teste');
    raise exception 'FALHA (c): suporte estendeu teste';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_alterar_tipo_de_cliente('a3000000-0000-4000-8000-000000000001', 'marca', 'Teste');
    raise exception 'FALHA (c): suporte trocou o tipo de cliente';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_ia_clientes();
    raise exception 'FALHA (c): suporte leu a IA dos clientes';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_equipe();
    raise exception 'FALHA (c): suporte listou a equipe';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_equipe_pre_cadastro('outro@teste.local');
    raise exception 'FALHA (c): suporte gravou pré-cadastro';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_equipe_conceder_suporte('equipe.a@teste.local', 'Colega');
    raise exception 'FALHA (c): suporte concedeu suporte';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_equipe_revogar_suporte('3f000000-0000-4000-8000-00000000000f', 'Eu mesmo');
    raise exception 'FALHA (c): suporte revogou suporte';
  exception when insufficient_privilege then null; end;
  begin
    update public.platform_admins set role = 'superadmin' where user_id = '3f000000-0000-4000-8000-00000000000f';
    raise exception 'FALHA (c): suporte se promoveu pela API';
  exception when insufficient_privilege then null; end;

  if (select count(*) from public.billing_invoices) <> 0
     or (select count(*) from public.billing_subscriptions) <> 0
     or (select count(*) from public.platform_admin_audit_log) <> 0 then
    raise exception 'FALHA (c): suporte lê cobrança ou auditoria direto nas tabelas';
  end if;
  if (select count(*) from public.sponsors where id = '5a300000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (c): suporte lê dado de domínio sem sessão de suporte';
  end if;
  raise notice 'OK (c): suporte vê clientes, ficha e descontos; não vê faturamento, planos, IA nem equipe';
end $$;
reset role;

-- (d) o suporte abre sessão de suporte na organização -----------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
declare _s jsonb;
begin
  _s := public.admin_abrir_sessao_suporte('a3000000-0000-4000-8000-000000000001', 8, 'Seleção de cliente no menu');
  if not public.is_org_member('a3000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (d): sessão do suporte não vale como membro';
  end if;
  if public.has_org_role('a3000000-0000-4000-8000-000000000001', array['owner']) then
    raise exception 'FALHA (d): sessão do suporte virou owner';
  end if;
  if (public.admin_sessao_suporte_ativa()->>'id')::uuid <> (_s->>'id')::uuid then
    raise exception 'FALHA (d): suporte não encontra a própria sessão ativa';
  end if;
  raise notice 'OK (d): suporte abre sessão de suporte como admin, sem virar owner';
end $$;
reset role;

-- (e) o superadmin continua com tudo -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare _c record;
begin
  if not public.is_platform_admin() or not public.is_platform_staff() or public.platform_role() <> 'superadmin' then
    raise exception 'FALHA (e): superadmin mal reconhecido';
  end if;
  select * into _c from public.admin_clientes() where organization_id = 'a3000000-0000-4000-8000-000000000001';
  if _c.mrr_cents is distinct from (select price_cents from public.billing_plans where id = 'starter') then
    raise exception 'FALHA (e): superadmin perdeu o MRR: %', row_to_json(_c);
  end if;
  perform * from public.admin_faturamento_realizado(12);
  if (select count(*) from public.billing_invoices where stripe_invoice_id = 'in_eq_a') <> 1 then
    raise exception 'FALHA (e): superadmin perdeu a leitura da cobrança';
  end if;
  raise notice 'OK (e): superadmin mantém faturamento e cobrança';
end $$;

-- (f) revogação: só suporte, encerra a sessão aberta, auditada --------------
do $$
begin
  begin perform public.admin_equipe_revogar_suporte('3e000000-0000-4000-8000-00000000000e', 'Saiu');
    raise exception 'FALHA (f): superadmin revogado pela tela';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_equipe_revogar_suporte('3f000000-0000-4000-8000-00000000000f', '');
    raise exception 'FALHA (f): revogação sem motivo';
  exception when check_violation then null; end;
  perform public.admin_equipe_revogar_suporte('3f000000-0000-4000-8000-00000000000f', 'Saiu da equipe');
  if (select count(*) from public.platform_admin_audit_log
       where action = 'suporte_revogado' and target_id = '3f000000-0000-4000-8000-00000000000f') <> 1 then
    raise exception 'FALHA (f): revogação não auditada';
  end if;
  raise notice 'OK (f): superadmin revoga suporte com motivo; superadmin só sai pelo banco';
end $$;
reset role;

do $$
begin
  if exists (select 1 from public.platform_support_sessions
              where admin_user_id = '3f000000-0000-4000-8000-00000000000f' and ended_at is null) then
    raise exception 'FALHA (f): sessão de suporte continuou aberta após a revogação';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
begin
  if public.is_platform_staff() or public.platform_role() is not null
     or public.is_org_member('a3000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (f): suporte revogado ainda tem acesso';
  end if;
  begin perform * from public.admin_clientes();
    raise exception 'FALHA (f): suporte revogado listou clientes';
  exception when insufficient_privilege then null; end;
  raise notice 'OK (f): revogação vale na próxima consulta';
end $$;
reset role;

-- (g) reativar pela tela volta como suporte; promover só pelo banco ---------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
select public.admin_equipe_conceder_suporte('equipe.p@teste.local', 'Voltou para a equipe');
reset role;

select public.platform_admin_grant('equipe.p@teste.local', 'Promovido por quem opera o banco');

do $$
begin
  if (select role from public.platform_admins where user_id = '3f000000-0000-4000-8000-00000000000f') <> 'superadmin'
     or (select revoked_at from public.platform_admins where user_id = '3f000000-0000-4000-8000-00000000000f') is not null then
    raise exception 'FALHA (g): concessão manual não promoveu o suporte a superadmin';
  end if;
  raise notice 'OK (g): reativação pela tela e promoção só pelo banco';
end $$;

-- (h) anon não executa nada da equipe ---------------------------------------
set local role anon;
do $$
begin
  begin perform public.is_platform_staff();
    raise exception 'FALHA (h): anon executou is_platform_staff';
  exception when insufficient_privilege then null; end;
  begin perform public.platform_role();
    raise exception 'FALHA (h): anon executou platform_role';
  exception when insufficient_privilege then null; end;
  begin perform * from public.admin_equipe();
    raise exception 'FALHA (h): anon executou admin_equipe';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_equipe_pre_cadastro('x@teste.local');
    raise exception 'FALHA (h): anon executou admin_equipe_pre_cadastro';
  exception when insufficient_privilege then null; end;
  raise notice 'OK (h): anon não executa nada da equipe';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes da equipe da plataforma ==='
