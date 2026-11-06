-- Tipo de cliente: agência e marca (0043, plano-visao-de-marca.md).
--
-- Org A é agência, Org M é marca. Transação revertida no fim.

\echo ''
\echo '=== Testes de tipo de cliente (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'tipo.agencia@teste.local', '{"full_name":"Owner Agência"}'),
  ('00000000-0000-0000-0000-000000000000', '7c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'tipo.comercial@teste.local', '{"full_name":"Comercial Agência"}'),
  ('00000000-0000-0000-0000-000000000000', '7b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'tipo.marca@teste.local', '{"full_name":"Owner Marca"}'),
  ('00000000-0000-0000-0000-000000000000', '7d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'tipo.superadmin@teste.local', '{"full_name":"Superadmin"}');

-- Org M nasce agência para ter um funil antigo; vira marca logo abaixo.
insert into public.organizations (id, owner_id, name) values
  ('a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Org A (tipo)'),
  ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Org M (tipo)');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a7000000-0000-4000-8000-000000000001', '7c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo');

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a700000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Sponsor A (tipo)');

insert into public.sports_properties (id, organization_id, owner_id, name, category, is_published, public_slug) values
  ('9a700000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Propriedade A (tipo)', 'futebol', true, 'tipo-a-teste'),
  ('9b700000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Propriedade M (tipo)', 'futebol', true, 'tipo-m-teste');

-- Funil antigo da Org M, de quando era agência; a troca usa o sinal de
-- transação, como as funções da 0043. Criar oportunidade exige auth.uid()
-- (tg_validate_opportunity_org_access).
select set_config('request.jwt.claims', '{"sub":"7b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
insert into public.opportunities (id, organization_id, owner_id, brand, value, stage) values
  ('0b700000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Negócio antigo', 1000, 'prospect');
select set_config('brandplay.tipo_de_cliente', 'on', true);
update public.organizations set client_type = 'marca' where id = 'b7000000-0000-4000-8000-000000000002';
select set_config('brandplay.tipo_de_cliente', 'off', true);

-- (a) padrão e matriz -------------------------------------------------------
do $$
begin
  if (select client_type from public.organizations where id = 'a7000000-0000-4000-8000-000000000001') <> 'agencia' then
    raise exception 'FALHA (a): organização nova não nasceu agência';
  end if;
  if (select count(*) from public.organization_role_grants
       where organization_id = 'a7000000-0000-4000-8000-000000000001' and module = 'vendas') <> 5 then
    raise exception 'FALHA (a): a organização não ganhou as 5 linhas de vendas';
  end if;
  if exists (
    select 1
      from public.organization_role_grants v
      join public.organization_role_grants c
        on c.organization_id = v.organization_id and c.role = v.role and c.module = 'crm'
     where v.module = 'vendas' and v.access <> c.access
  ) then
    raise exception 'FALHA (a): vendas nasceu diferente do crm para algum papel';
  end if;
  raise notice 'OK (a): agência por padrão e vendas igual ao crm';
end $$;

-- (b) a marca não vê nem cria funil; vê e cria o resto ----------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if public.can_access_module('7b000000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000002', 'vendas', false) then
    raise exception 'FALHA (b): owner da marca lê o módulo vendas';
  end if;
  if not public.can_access_module('7b000000-0000-4000-8000-00000000000b', 'b7000000-0000-4000-8000-000000000002', 'crm', true) then
    raise exception 'FALHA (b): owner da marca perdeu o crm';
  end if;
  if exists (select 1 from public.opportunities where id = '0b700000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (b): owner da marca lê a oportunidade antiga';
  end if;
  begin
    insert into public.opportunities (organization_id, owner_id, brand, value, stage)
    values ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Novo', 10, 'prospect');
    raise exception 'FALHA (b): owner da marca criou oportunidade';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.pipeline_funnels (organization_id, name)
    values ('b7000000-0000-4000-8000-000000000002', 'Funil');
    raise exception 'FALHA (b): owner da marca criou funil';
  exception when insufficient_privilege then null;
  end;
  insert into public.sponsors (organization_id, owner_id, name)
  values ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Marca do grupo');
  if not exists (select 1 from public.sponsors where name = 'Marca do grupo') then
    raise exception 'FALHA (b): owner da marca não lê o patrocinador que criou';
  end if;
  raise notice 'OK (b): marca sem funil, com patrocinadores';
end $$;

-- exclusão por has_org_role (padrão admin_delete) também barrada
do $$
declare n integer;
begin
  delete from public.opportunities where organization_id = 'b7000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHA (b): owner da marca apagou oportunidade às cegas';
  end if;
end $$;
reset role;

-- (c) caminhos SECURITY DEFINER: nada nasce no funil da marca --------------
do $$
begin
  begin
    insert into public.opportunities (organization_id, owner_id, brand, value, stage)
    values ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Por definer', 10, 'prospect');
    raise exception 'FALHA (c): oportunidade criada na marca fora da RLS';
  exception when check_violation then null;
  end;
  begin
    insert into public.proposals (organization_id, owner_id, title)
    values ('b7000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Proposta');
    raise exception 'FALHA (c): proposta criada na marca fora da RLS';
  exception when check_violation then null;
  end;
  raise notice 'OK (c): gatilho barra oportunidade e proposta na marca';
end $$;

-- (d) agência: comercial sem vendas continua com patrocinadores -------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
insert into public.opportunities (id, organization_id, owner_id, brand, value, stage) values
  ('0a700000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Negócio A', 500, 'prospect');
update public.organization_role_grants set access = 'none'
 where organization_id = 'a7000000-0000-4000-8000-000000000001' and role = 'comercial' and module = 'vendas';
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.opportunities where id = '0a700000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (d): comercial sem vendas lê a oportunidade';
  end if;
  if not exists (select 1 from public.sponsors where id = '5a700000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (d): comercial sem vendas perdeu o patrocinador';
  end if;
  raise notice 'OK (d): vendas separa o funil do cadastro de patrocinadores';
end $$;
reset role;

-- (e) media kit e lead: fora do ar na marca, no ar na agência ---------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if not exists (select 1 from public.sports_properties where id = '9a700000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (e): media kit da agência saiu do ar';
  end if;
  if exists (select 1 from public.sports_properties where id = '9b700000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (e): media kit da marca continua público';
  end if;
  begin
    insert into public.property_leads (property_id, owner_id, contact_name, email)
    values ('9b700000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-00000000000b', 'Visitante', 'lead.marca@exemplo.com');
    raise exception 'FALHA (e): lead aceito para propriedade da marca';
  exception when insufficient_privilege or check_violation then null;
  end;
  raise notice 'OK (e): media kit e lead só na agência';
end $$;
reset role;

-- (f) o tipo não muda por UPDATE direto -------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    update public.organizations set client_type = 'marca' where id = 'a7000000-0000-4000-8000-000000000001';
    raise exception 'FALHA (f): owner trocou o tipo por update direto';
  exception when check_violation then null;
  end;
  -- o resto da organização continua editável
  update public.organizations set phone = '11 0000-0000' where id = 'a7000000-0000-4000-8000-000000000001';
  raise notice 'OK (f): client_type protegido; resto da organização editável';
end $$;

-- (g) owner corrige durante o teste; depois da contratação, não -------------
do $$
begin
  if public.corrigir_tipo_de_cliente('a7000000-0000-4000-8000-000000000001', 'marca') <> 'marca' then
    raise exception 'FALHA (g): correção do owner não devolveu o tipo novo';
  end if;
  if (select client_type from public.organizations where id = 'a7000000-0000-4000-8000-000000000001') <> 'marca' then
    raise exception 'FALHA (g): correção do owner não gravou';
  end if;
  perform public.corrigir_tipo_de_cliente('a7000000-0000-4000-8000-000000000001', 'agencia');
  if (select count(*) from public.team_audit_log
       where organization_id = 'a7000000-0000-4000-8000-000000000001' and action = 'client_type_changed') <> 2 then
    raise exception 'FALHA (g): correções do owner sem auditoria';
  end if;
  raise notice 'OK (g): owner corrige o tipo antes de contratar, com auditoria';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.corrigir_tipo_de_cliente('a7000000-0000-4000-8000-000000000001', 'marca');
    raise exception 'FALHA (g): comercial corrigiu o tipo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

insert into public.billing_subscriptions (organization_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
values ('a7000000-0000-4000-8000-000000000001', 'starter', 'ativa', 'cus_tipo', 'sub_tipo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.corrigir_tipo_de_cliente('a7000000-0000-4000-8000-000000000001', 'marca');
    raise exception 'FALHA (g): owner trocou o tipo depois de contratar';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_alterar_tipo_de_cliente('a7000000-0000-4000-8000-000000000001', 'marca', 'teste');
    raise exception 'FALHA (g): owner usou a função do superadmin';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- (h) superadmin troca com motivo e auditoria; dados do funil voltam ---------
select public.platform_admin_grant('tipo.superadmin@teste.local', 'Teste de tipo de cliente');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_alterar_tipo_de_cliente('b7000000-0000-4000-8000-000000000002', 'agencia', '  ');
    raise exception 'FALHA (h): troca sem motivo';
  exception when check_violation then null;
  end;
  if ((public.admin_tipo_de_cliente('b7000000-0000-4000-8000-000000000002'))->>'open_opportunities')::int <> 1 then
    raise exception 'FALHA (h): impacto da troca não conta a oportunidade aberta';
  end if;
  perform public.admin_alterar_tipo_de_cliente('b7000000-0000-4000-8000-000000000002', 'agencia', 'Cliente voltou a vender');
  if not exists (
    select 1 from public.platform_admin_audit_log
     where organization_id = 'b7000000-0000-4000-8000-000000000002'
       and action = 'tipo_de_cliente_alterado'
       and after->>'client_type' = 'agencia'
  ) then
    raise exception 'FALHA (h): troca sem auditoria';
  end if;
  raise notice 'OK (h): superadmin troca o tipo com motivo e auditoria';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.opportunities where id = '0b700000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (h): oportunidade antiga não voltou com o tipo agência';
  end if;
  raise notice 'OK (h): de volta a agência, o funil reaparece inteiro';
end $$;
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if not exists (select 1 from public.sports_properties where id = '9b700000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (h): media kit não voltou com o tipo agência';
  end if;
end $$;
reset role;

-- (i) cadastro grava o tipo -------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '7e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'tipo.cadastro.marca@teste.local', '{"full_name":"Cadastro Marca","company":"Marca Nova","client_type":"marca"}'),
  ('00000000-0000-0000-0000-000000000000', '7f000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'tipo.cadastro.x@teste.local', '{"full_name":"Cadastro X","company":"Outra","client_type":"qualquer"}');

do $$
declare _org uuid;
begin
  if (select client_type from public.organizations where owner_id = '7e000000-0000-4000-8000-00000000000e') <> 'marca' then
    raise exception 'FALHA (i): cadastro como marca não gravou o tipo';
  end if;
  if (select client_type from public.organizations where owner_id = '7f000000-0000-4000-8000-00000000000f') <> 'agencia' then
    raise exception 'FALHA (i): tipo inválido no cadastro não virou agência';
  end if;
  _org := public.create_organization_with_owner('7e000000-0000-4000-8000-00000000000e', 'Marca pela tela', null, 'marca');
  if (select client_type from public.organizations where id = _org) <> 'marca' then
    raise exception 'FALHA (i): create_organization_with_owner não gravou o tipo';
  end if;
  begin
    perform public.create_organization_with_owner('7e000000-0000-4000-8000-00000000000e', 'Inválida', null, 'outro');
    raise exception 'FALHA (i): create_organization_with_owner aceitou tipo inválido';
  exception when check_violation then null;
  end;
  raise notice 'OK (i): cadastro e criação de organização gravam o tipo';
end $$;

rollback;

\echo '=== Fim dos testes de tipo de cliente ==='
