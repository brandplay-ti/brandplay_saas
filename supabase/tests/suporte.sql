-- Desconto e sessão de suporte do superadmin (0035).
--
--   npm run supabase:test
--
-- Transação revertida no fim. S = superadmin sem organização, A = owner da
-- Org A, B = owner da Org B.

\echo ''
\echo '=== Testes de desconto e sessão de suporte (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '3a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'suporte.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '3b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'suporte.b@teste.local', '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', '3e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'suporte.s@teste.local', '{"full_name":"Superadmin S"}');

delete from public.organization_members where user_id = '3e000000-0000-4000-8000-00000000000e';
delete from public.organizations where owner_id = '3e000000-0000-4000-8000-00000000000e';

insert into public.organizations (id, owner_id, name) values
  ('a3000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-00000000000a', 'Org A (suporte)'),
  ('b3000000-0000-4000-8000-000000000002', '3b000000-0000-4000-8000-00000000000b', 'Org B (suporte)');

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a300000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-00000000000a', 'Sponsor A (suporte)');

select public.platform_admin_grant('suporte.s@teste.local', 'Teste da sessão de suporte');

-- (a) quem não é superadmin não abre sessão --------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_abrir_sessao_suporte('b3000000-0000-4000-8000-000000000002', 2, 'quero ver a outra');
    raise exception 'FALHA (a): owner abriu sessão de suporte';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (a): só o superadmin abre sessão';
end $$;
reset role;

-- (b) sessão vê a organização pedida, com papel admin, e mais nenhuma ------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare
  _sessao jsonb;
  _n int;
begin
  if (select count(*) from public.sponsors) <> 0 then
    raise exception 'FALHA (b): superadmin lê patrocinador sem sessão';
  end if;

  begin
    perform public.admin_abrir_sessao_suporte('a3000000-0000-4000-8000-000000000001', 9, 'prazo longo demais');
    raise exception 'FALHA (b): sessão de 9 horas foi aceita';
  exception when check_violation then null;
  end;
  begin
    perform public.admin_abrir_sessao_suporte('a3000000-0000-4000-8000-000000000001', 2, 'ab');
    raise exception 'FALHA (b): sessão sem motivo foi aceita';
  exception when check_violation then null;
  end;

  _sessao := public.admin_abrir_sessao_suporte(
    'a3000000-0000-4000-8000-000000000001', 2, 'Cliente pediu ajuda para achar um contrato');

  if not public.is_org_member('a3000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (b): sessão vigente não entra em is_org_member';
  end if;
  if public.is_org_member('b3000000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (b): sessão abriu outra organização';
  end if;
  if not public.has_org_role('a3000000-0000-4000-8000-000000000001', array['admin']) then
    raise exception 'FALHA (b): sessão não vale como admin';
  end if;
  if public.has_org_role('a3000000-0000-4000-8000-000000000001', array['owner']) then
    raise exception 'FALHA (b): sessão valeu como owner';
  end if;
  if not public.has_org_role('a3000000-0000-4000-8000-000000000001', array['owner', 'admin']) then
    raise exception 'FALHA (b): sessão não passou numa policy de owner ou admin';
  end if;

  select count(*) into _n from public.sponsors;
  if _n <> 1 then
    raise exception 'FALHA (b): superadmin em sessão não leu o patrocinador da organização (viu %)', _n;
  end if;

  if (public.admin_sessao_suporte_ativa() ->> 'organization_id')
     <> 'a3000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (b): admin_sessao_suporte_ativa não devolveu a organização';
  end if;

  -- Trocar de sessão encerra a anterior.
  perform public.admin_abrir_sessao_suporte(
    'a3000000-0000-4000-8000-000000000001', 1, 'Segunda sessão no lugar da primeira');
  if (select count(*) from public.platform_support_sessions
       where admin_user_id = '3e000000-0000-4000-8000-00000000000e' and ended_at is null) <> 1 then
    raise exception 'FALHA (b): ficou mais de uma sessão aberta';
  end if;

  perform public.admin_encerrar_sessao_suporte((_sessao ->> 'id')::uuid, 'A primeira já tinha sido substituída');
  perform public.admin_encerrar_sessao_suporte(
    (public.admin_sessao_suporte_ativa() ->> 'id')::uuid, 'Encerrada no teste');

  if public.is_org_member('a3000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (b): sessão encerrada ainda abre a organização';
  end if;
  if public.admin_sessao_suporte_ativa() is not null then
    raise exception 'FALHA (b): sessão encerrada ainda aparece como ativa';
  end if;
  raise notice 'OK (b): sessão vê só a organização pedida, como admin, e expira ao encerrar';
end $$;

-- (c) sessão vencida não abre nada -----------------------------------------
do $$
begin
  perform set_config(
    'suporte.sessao_id',
    public.admin_abrir_sessao_suporte(
      'a3000000-0000-4000-8000-000000000001', 2, 'Sessão que vamos vencer') ->> 'id',
    true);
end $$;
reset role;

update public.platform_support_sessions
   set created_at = now() - interval '3 hours',
       expires_at = now() - interval '1 hour'
 where id = current_setting('suporte.sessao_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if public.is_org_member('a3000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (c): sessão vencida ainda abre a organização';
  end if;
  if public.admin_sessao_suporte_ativa() is not null then
    raise exception 'FALHA (c): sessão vencida ainda aparece como ativa';
  end if;
  raise notice 'OK (c): sessão vencida não abre a organização';
end $$;
reset role;

-- A sobrecarga por user_id continua olhando só membership.
do $$
begin
  if public.is_org_member(
       '3e000000-0000-4000-8000-00000000000e'::uuid,
       'a3000000-0000-4000-8000-000000000001'::uuid) then
    raise exception 'FALHA (c): is_org_member(user, org) tratou a sessão como membership';
  end if;
  raise notice 'OK (c): a sessão não vira linha em organization_members';
end $$;

-- (d) desconto: o cliente não grava; o owner lê o da própria organização ----
insert into public.billing_discounts (organization_id, percent_off, duration_months, comment, stripe_status)
values
  ('a3000000-0000-4000-8000-000000000001', 100, 3, 'Isenção de teste', 'aguardando_checkout'),
  ('b3000000-0000-4000-8000-000000000002', 10, 1, 'Desconto da Org B', 'aplicado');

do $$
begin
  begin
    insert into public.billing_discounts (organization_id, percent_off, duration_months, comment)
    values ('a3000000-0000-4000-8000-000000000001', 0, 1, 'percentual inválido');
    raise exception 'FALHA (d): percentual 0 foi aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.billing_discounts (organization_id, percent_off, duration_months, comment)
    values ('a3000000-0000-4000-8000-000000000001', 10, 13, 'prazo inválido');
    raise exception 'FALHA (d): prazo de 13 meses foi aceito';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare _n int;
begin
  begin
    insert into public.billing_discounts (organization_id, percent_off, duration_months, comment)
    values ('a3000000-0000-4000-8000-000000000001', 50, 2, 'eu mesmo');
    raise exception 'FALHA (d): owner inseriu desconto pela API';
  exception when insufficient_privilege then null;
  end;
  select count(*) into _n from public.billing_discounts
   where organization_id = 'a3000000-0000-4000-8000-000000000001';
  if _n <> 1 then
    raise exception 'FALHA (d): owner não leu o desconto da própria organização (viu %)', _n;
  end if;
  select count(*) into _n from public.billing_discounts
   where organization_id = 'b3000000-0000-4000-8000-000000000002';
  if _n <> 0 then
    raise exception 'FALHA (d): owner leu desconto de outra organização';
  end if;
  raise notice 'OK (d): owner lê o próprio desconto e não grava';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"3e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.billing_discounts
       where organization_id in (
         'a3000000-0000-4000-8000-000000000001',
         'b3000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FALHA (d): superadmin não leu os descontos das organizações';
  end if;
  if (select count(*) from public.sponsors) <> 0 then
    raise exception 'FALHA (d): superadmin sem sessão voltou a ler patrocinador';
  end if;
  raise notice 'OK (d): superadmin lê desconto e, sem sessão, não lê domínio';
end $$;
reset role;

-- (e) anon não executa -------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform public.admin_abrir_sessao_suporte('a3000000-0000-4000-8000-000000000001', 1, 'anonimo');
    raise exception 'FALHA (e): anon abriu sessão';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (e): anon não abre sessão';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes de desconto e sessão de suporte ==='
