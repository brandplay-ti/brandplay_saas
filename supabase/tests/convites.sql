-- Aceite de convite de organização por quem já tem conta (0041).
--
-- Transação revertida no fim.

\echo ''
\echo '=== Testes de convite de organização (transação revertida no fim) ==='

begin;

-- Contas criadas ANTES dos convites: assim handle_new_user não aceita nada
-- sozinho e cada uma ganha só a organização pessoal, como quem já usa a
-- plataforma.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '7a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'conv.owner@teste.local', now(), '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '7c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'conv.existente@teste.local', now(), '{"full_name":"Conta existente"}'),
  ('00000000-0000-0000-0000-000000000000', '7d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'conv.outro@teste.local', now(), '{"full_name":"Outra conta"}'),
  ('00000000-0000-0000-0000-000000000000', '7e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'conv.membro@teste.local', now(), '{"full_name":"Membro comercial"}'),
  ('00000000-0000-0000-0000-000000000000', '7f000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'conv.revogado@teste.local', now(), '{"full_name":"Membro revogado"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'conv.naoconfirmado@teste.local', null, '{"full_name":"Sem confirmar"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'conv.recusa@teste.local', now(), '{"full_name":"Recusa"}');

insert into public.organizations (id, owner_id, name) values
  ('a7000000-0000-4000-8000-000000000001', '7a000000-0000-4000-8000-00000000000a', 'Org A (convites)');

insert into public.organization_members (organization_id, user_id, role, status, updated_at) values
  ('a7000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-00000000000e', 'comercial', 'ativo', now()),
  ('a7000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-00000000000f', 'financeiro', 'revogado', now() - interval '2 days');

insert into public.organization_invites (id, organization_id, email, role, invited_by, created_at, expires_at) values
  -- conta existente, convite válido
  ('c7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'conv.existente@teste.local', 'operacional', '7a000000-0000-4000-8000-00000000000a', now(), now() + interval '14 days'),
  -- membro ativo convidado como admin
  ('c7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'conv.membro@teste.local', 'admin', '7a000000-0000-4000-8000-00000000000a', now(), now() + interval '14 days'),
  -- membro revogado: um convite anterior à revogação e um posterior
  ('c7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000001', 'conv.revogado@teste.local', 'admin', '7a000000-0000-4000-8000-00000000000a', now() - interval '3 days', now() + interval '11 days'),
  ('c7000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000001', 'conv.revogado@teste.local', 'comercial', '7a000000-0000-4000-8000-00000000000a', now() - interval '1 day', now() + interval '13 days'),
  -- vencido
  ('c7000000-0000-4000-8000-000000000005', 'a7000000-0000-4000-8000-000000000001', 'conv.outro@teste.local', 'comercial', '7a000000-0000-4000-8000-00000000000a', now() - interval '20 days', now() - interval '6 days'),
  -- e-mail não confirmado
  ('c7000000-0000-4000-8000-000000000006', 'a7000000-0000-4000-8000-000000000001', 'conv.naoconfirmado@teste.local', 'comercial', '7a000000-0000-4000-8000-00000000000a', now(), now() + interval '14 days'),
  -- será recusado
  ('c7000000-0000-4000-8000-000000000007', 'a7000000-0000-4000-8000-000000000001', 'CONV.Recusa@teste.local', 'comercial', '7a000000-0000-4000-8000-00000000000a', now(), now() + interval '14 days');

-- (a) quem executa o quê -------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.convites_de_organizacao_pendentes()', 'execute')
     or has_function_privilege('anon', 'public.aceitar_convite_de_organizacao(uuid)', 'execute')
     or has_function_privilege('anon', 'public.recusar_convite_de_organizacao(uuid)', 'execute') then
    raise exception 'FALHA (a): anon executa função de convite';
  end if;
  if has_function_privilege('authenticated', 'public.membro_da_organizacao_por_email(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.convite_da_conta(uuid)', 'execute') then
    raise exception 'FALHA (a): authenticated executa função interna';
  end if;
  if not has_function_privilege('authenticated', 'public.aceitar_convite_de_organizacao(uuid)', 'execute') then
    raise exception 'FALHA (a): authenticated não aceita convite';
  end if;
  raise notice 'OK (a): anon não toca em convite; funções internas só para service_role';
end $$;

-- (b) a conta existente vê só o próprio convite -----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare _ids uuid[];
begin
  select array_agg(id) into _ids from public.convites_de_organizacao_pendentes();
  if _ids is distinct from array['c7000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'FALHA (b): lista inesperada %', _ids;
  end if;
  if exists (select 1 from public.organization_invites) then
    raise exception 'FALHA (b): não membro lê organization_invites direto';
  end if;
  raise notice 'OK (b): a conta vê só o convite do próprio e-mail';
end $$;
reset role;

-- (c) outra conta não aceita convite alheio ---------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000001');
    raise exception 'FALHA (c): convite aceito por outro e-mail';
  exception when no_data_found then null;
  end;
  begin
    perform public.recusar_convite_de_organizacao('c7000000-0000-4000-8000-000000000001');
    raise exception 'FALHA (c): convite recusado por outro e-mail';
  exception when no_data_found then null;
  end;
  begin
    perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000005');
    raise exception 'FALHA (c): convite vencido aceito';
  exception when no_data_found then null;
  end;
  raise notice 'OK (c): convite alheio ou vencido dá o mesmo erro de convite inexistente';
end $$;
reset role;

-- (d) a conta existente aceita e vira membro com o papel do convite ---------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare _org uuid;
begin
  _org := public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000001');
  if _org <> 'a7000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (d): devolveu outra organização %', _org;
  end if;
  if not public.is_org_member('a7000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (d): não virou membro';
  end if;
  if exists (select 1 from public.convites_de_organizacao_pendentes()) then
    raise exception 'FALHA (d): convite aceito continua na lista';
  end if;
  begin
    perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000001');
    raise exception 'FALHA (d): convite aceito duas vezes';
  exception when no_data_found then null;
  end;
end $$;
reset role;

do $$
begin
  if (select role from public.organization_members
       where organization_id = 'a7000000-0000-4000-8000-000000000001'
         and user_id = '7c000000-0000-4000-8000-00000000000c'
         and status = 'ativo') is distinct from 'operacional' then
    raise exception 'FALHA (d): papel diferente do convite';
  end if;
  if (select status from public.organization_invites
       where id = 'c7000000-0000-4000-8000-000000000001') <> 'aceito' then
    raise exception 'FALHA (d): convite não ficou aceito';
  end if;
  if not exists (
    select 1 from public.team_audit_log
     where organization_id = 'a7000000-0000-4000-8000-000000000001'
       and action = 'invite_accepted'
       and actor_id = '7c000000-0000-4000-8000-00000000000c'
       and new_role = 'operacional'
  ) then
    raise exception 'FALHA (d): aceite não foi auditado';
  end if;
  -- a organização pessoal continua: aceitar não troca, soma
  if (select count(*) from public.organization_members
       where user_id = '7c000000-0000-4000-8000-00000000000c' and status = 'ativo') <> 2 then
    raise exception 'FALHA (d): a conta não ficou nas duas organizações';
  end if;
  raise notice 'OK (d): conta existente aceita, entra com o papel do convite e mantém a organização pessoal';
end $$;

-- (e) membro ativo não muda de papel por convite ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.convites_de_organizacao_pendentes()) then
    raise exception 'FALHA (e): membro ativo vê convite da própria organização';
  end if;
  perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000002');
end $$;
reset role;

do $$
begin
  if (select role from public.organization_members
       where organization_id = 'a7000000-0000-4000-8000-000000000001'
         and user_id = '7e000000-0000-4000-8000-00000000000e') <> 'comercial' then
    raise exception 'FALHA (e): convite trocou o papel de membro ativo';
  end if;
  raise notice 'OK (e): membro ativo mantém o papel; o convite só é encerrado';
end $$;

-- (f) membro revogado: convite anterior à revogação não vale; posterior reativa
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000003');
    raise exception 'FALHA (f): convite anterior à revogação reativou o membro';
  exception when no_data_found then null;
  end;
  perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000004');
  if not public.is_org_member('a7000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (f): convite posterior não reativou';
  end if;
end $$;
reset role;

do $$
begin
  if (select role from public.organization_members
       where organization_id = 'a7000000-0000-4000-8000-000000000001'
         and user_id = '7f000000-0000-4000-8000-00000000000f') <> 'comercial' then
    raise exception 'FALHA (f): reativado sem o papel do convite';
  end if;
  raise notice 'OK (f): revogação depois do convite vale mais; convite posterior reativa com o papel dele';
end $$;

-- (g) e-mail não confirmado não vê nem aceita -------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.convites_de_organizacao_pendentes()) then
    raise exception 'FALHA (g): conta sem e-mail confirmado vê convite';
  end if;
  begin
    perform public.aceitar_convite_de_organizacao('c7000000-0000-4000-8000-000000000006');
    raise exception 'FALHA (g): conta sem e-mail confirmado aceitou';
  exception when no_data_found then null;
  end;
  raise notice 'OK (g): e-mail não confirmado não vê nem aceita convite';
end $$;
reset role;

-- (h) recusar (e-mail do convite em outra caixa) ----------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.convites_de_organizacao_pendentes()) <> 1 then
    raise exception 'FALHA (h): convite com e-mail em maiúsculas não aparece';
  end if;
  perform public.recusar_convite_de_organizacao('c7000000-0000-4000-8000-000000000007');
  if exists (select 1 from public.convites_de_organizacao_pendentes()) then
    raise exception 'FALHA (h): convite recusado continua na lista';
  end if;
  if public.is_org_member('a7000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (h): recusar virou membro';
  end if;
end $$;
reset role;

do $$
begin
  if (select status from public.organization_invites
       where id = 'c7000000-0000-4000-8000-000000000007') <> 'recusado' then
    raise exception 'FALHA (h): convite não ficou recusado';
  end if;
  if not exists (
    select 1 from public.team_audit_log
     where action = 'invite_declined'
       and actor_id = '70000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'FALHA (h): recusa não foi auditada';
  end if;
  raise notice 'OK (h): recusa encerra o convite, não vincula e é auditada';
end $$;

-- (i) membro por e-mail (manage-team-access) --------------------------------
do $$
begin
  if (select status from public.membro_da_organizacao_por_email(
        'a7000000-0000-4000-8000-000000000001', ' CONV.membro@teste.local ')) <> 'ativo' then
    raise exception 'FALHA (i): membro ativo não encontrado pelo e-mail';
  end if;
  if exists (select 1 from public.membro_da_organizacao_por_email(
        'a7000000-0000-4000-8000-000000000001', 'conv.outro@teste.local')) then
    raise exception 'FALHA (i): não membro encontrado';
  end if;
  raise notice 'OK (i): membro por e-mail acha só quem está na organização';
end $$;

rollback;
