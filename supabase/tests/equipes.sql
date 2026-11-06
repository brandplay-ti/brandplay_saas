-- Equipes de trabalho (0042, fase 1 do plano de equipes). Transação revertida
-- no fim.
--
-- (a) privilégios: anon não toca; funções internas só para service_role
-- (b) owner cria equipe; quem não é admin não cria; nome único entre as ativas
-- (c) organization_id do vínculo vem da equipe; nada de outra organização
-- (d) só membro ativo da organização entra; data de fim futura; equipe arquivada não recebe vínculo
-- (e) líder: membros comuns da própria equipe, e só isso (D9)
-- (f) outra organização não vê as equipes
-- (g) projetos_das_equipes: união, subprojetos, edição vence leitura, vínculo vencido, membro revogado, ciclo
-- (h) acesso_do_membro ("Ver como"): só owner/admin
-- (i) escopo da matriz: padrão organização; owner, admin e módulo team travados; mudança auditada
-- (j) convite com equipes: equipe de outra organização recusada; aceite e cadastro entram na equipe
-- (k) auditoria das equipes

\echo ''
\echo '=== Testes de equipes de trabalho (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'eq.owner.a@teste.local', now(), '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'eq.owner.b@teste.local', now(), '{"full_name":"Owner B"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'eq.lider@teste.local', now(), '{"full_name":"Líder comercial"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'eq.operacional@teste.local', now(), '{"full_name":"Operacional"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'eq.revogado@teste.local', now(), '{"full_name":"Revogado"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'eq.comercial@teste.local', now(), '{"full_name":"Comercial sem equipe"}'),
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'eq.convidado@teste.local', now(), '{"full_name":"Convidado"}');

insert into public.organizations (id, owner_id, name) values
  ('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Org A (equipes)'),
  ('eb000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'Org B (equipes)');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'comercial', 'ativo'),
  ('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'operacional', 'ativo'),
  ('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000005', 'financeiro', 'revogado'),
  ('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006', 'comercial', 'ativo');

-- P1 > P1c > P1cc; P2 solta; PB é da Org B.
insert into public.sports_properties (id, organization_id, owner_id, parent_property_id, name, category) values
  ('f1000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', null, 'Copa P1', 'campeonato'),
  ('f1000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Etapa P1c', 'evento'),
  ('f1000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'Jogo P1cc', 'evento'),
  ('f1000000-0000-4000-8000-000000000004', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', null, 'Projeto P2', 'projeto'),
  ('f1000000-0000-4000-8000-000000000005', 'eb000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', null, 'Copa PB', 'campeonato');

-- Equipe da Org B, criada sem sessão (sem auditoria).
insert into public.work_teams (id, organization_id, name) values
  ('ee000000-0000-4000-8000-0000000000b1', 'eb000000-0000-4000-8000-000000000002', 'Time B');

-- (a) privilégios ------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.work_teams', 'select')
     or has_table_privilege('anon', 'public.work_team_members', 'select')
     or has_table_privilege('anon', 'public.work_team_properties', 'select') then
    raise exception 'FALHA (a): anon lê tabela de equipe';
  end if;
  if has_table_privilege('authenticated', 'public.work_teams', 'delete')
     or has_table_privilege('authenticated', 'public.work_team_members', 'delete') then
    raise exception 'FALHA (a): authenticated exclui equipe ou membro (deve arquivar e revogar)';
  end if;
  if has_function_privilege('authenticated', 'public.projetos_das_equipes(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.acesso_do_membro(uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.lidera_equipe(uuid)', 'execute') then
    raise exception 'FALHA (a): função de equipe executável por quem não devia';
  end if;
  if not has_function_privilege('authenticated', 'public.acesso_do_membro(uuid, uuid)', 'execute') then
    raise exception 'FALHA (a): authenticated não executa acesso_do_membro';
  end if;
  raise notice 'OK (a): anon não toca em equipe; projetos_das_equipes só para service_role';
end $$;

-- (b) owner cria; nome único entre as ativas ---------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.work_teams (id, organization_id, name, description) values
  ('ee000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', '  Comercial SP ', 'Time comercial'),
  ('ee000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'Eventos', '   '),
  ('ee000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000001', 'Temporária', null);

-- organization_id enviado errado de propósito: o gatilho põe o da equipe.
insert into public.work_team_members (team_id, organization_id, user_id, team_role) values
  ('ee000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000003', 'lider'),
  ('ee000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'membro'),
  ('ee000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'membro');

insert into public.work_team_properties (team_id, organization_id, property_id, access, include_children) values
  ('ee000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'read', true),
  ('ee000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'write', false),
  ('ee000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'read', true);

do $$
begin
  if (select name from public.work_teams where id = 'ee000000-0000-4000-8000-000000000001') <> 'Comercial SP' then
    raise exception 'FALHA (b): nome sem trim';
  end if;
  if (select description from public.work_teams where id = 'ee000000-0000-4000-8000-000000000002') is not null then
    raise exception 'FALHA (b): descrição em branco não virou nula';
  end if;
  begin
    insert into public.work_teams (organization_id, name)
    values ('ea000000-0000-4000-8000-000000000001', 'comercial sp');
    raise exception 'FALHA (b): nome repetido entre equipes ativas';
  exception when unique_violation then null;
  end;
  raise notice 'OK (b): owner cria equipe; nome único (sem caixa e espaços) entre as ativas';
end $$;

-- (c) nada de outra organização ---------------------------------------------
do $$
begin
  if (select organization_id from public.work_team_members
       where team_id = 'ee000000-0000-4000-8000-000000000001'
         and user_id = 'e1000000-0000-4000-8000-000000000003') <> 'ea000000-0000-4000-8000-000000000001' then
    raise exception 'FALHA (c): organization_id do cliente valeu';
  end if;
  begin
    insert into public.work_team_properties (team_id, property_id)
    values ('ee000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000005');
    raise exception 'FALHA (c): projeto de outra organização vinculado';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002');
    raise exception 'FALHA (c): pessoa de fora da organização entrou na equipe';
  exception when check_violation then null;
  end;
  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-0000000000b1', 'e1000000-0000-4000-8000-000000000004');
    raise exception 'FALHA (c): owner A mexeu na equipe da Org B';
  exception when check_violation or insufficient_privilege then null;
  end;
  raise notice 'OK (c): vínculo herda a organização da equipe; outra organização é recusada';
end $$;

-- (d) membro ativo, data futura, equipe arquivada ---------------------------
do $$
begin
  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000005');
    raise exception 'FALHA (d): membro revogado da organização entrou na equipe';
  exception when check_violation then null;
  end;
  begin
    insert into public.work_team_members (team_id, user_id, expires_at)
    values ('ee000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006', now() - interval '1 day');
    raise exception 'FALHA (d): vínculo nasceu vencido';
  exception when check_violation then null;
  end;

  update public.work_teams set status = 'arquivado' where id = 'ee000000-0000-4000-8000-000000000003';
  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000006');
    raise exception 'FALHA (d): equipe arquivada recebeu membro';
  exception when check_violation then null;
  end;
  begin
    insert into public.work_team_properties (team_id, property_id)
    values ('ee000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000004');
    raise exception 'FALHA (d): equipe arquivada recebeu projeto';
  exception when check_violation then null;
  end;
  -- Arquivada libera o nome.
  insert into public.work_teams (organization_id, name)
  values ('ea000000-0000-4000-8000-000000000001', 'Temporária');
  raise notice 'OK (d): só membro ativo, data de fim futura; arquivada não recebe vínculo e libera o nome';
end $$;
reset role;

-- (b2) quem não é admin não cria equipe nem vincula -------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare _n integer;
begin
  begin
    insert into public.work_teams (organization_id, name)
    values ('ea000000-0000-4000-8000-000000000001', 'Equipe do comercial');
    raise exception 'FALHA (b): comercial criou equipe';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006');
    raise exception 'FALHA (b): comercial se pôs na equipe';
  exception when insufficient_privilege then null;
  end;
  update public.work_teams set name = 'Invadida' where id = 'ee000000-0000-4000-8000-000000000001';
  get diagnostics _n = row_count;
  if _n <> 0 then
    raise exception 'FALHA (b): comercial renomeou equipe';
  end if;
  if (select count(*) from public.work_teams where organization_id = 'ea000000-0000-4000-8000-000000000001') <> 4 then
    raise exception 'FALHA (b): membro da organização não lê as equipes';
  end if;
  raise notice 'OK (b2): membro comum lê as equipes, mas não cria nem se inclui';
end $$;
reset role;

-- (e) líder de equipe (D9) ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare _n integer;
begin
  -- inclui membro comum da organização na própria equipe
  insert into public.work_team_members (team_id, user_id, expires_at)
  values ('ee000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006', now() + interval '30 days');

  begin
    update public.work_team_members set team_role = 'lider'
     where team_id = 'ee000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000006';
    raise exception 'FALHA (e): líder promoveu membro a líder';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.work_team_members (team_id, user_id)
    values ('ee000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000006');
    raise exception 'FALHA (e): líder mexeu em outra equipe';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.work_team_properties (team_id, property_id)
    values ('ee000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004');
    raise exception 'FALHA (e): líder vinculou projeto';
  exception when insufficient_privilege then null;
  end;

  -- não mexe em líder (nem em si mesmo)
  update public.work_team_members set status = 'revogado'
   where team_id = 'ee000000-0000-4000-8000-000000000001'
     and user_id = 'e1000000-0000-4000-8000-000000000003';
  get diagnostics _n = row_count;
  if _n <> 0 then
    raise exception 'FALHA (e): líder alterou vínculo de líder';
  end if;

  -- muda a data de fim e tira membro comum
  update public.work_team_members set expires_at = now() + interval '60 days'
   where team_id = 'ee000000-0000-4000-8000-000000000001'
     and user_id = 'e1000000-0000-4000-8000-000000000004';
  get diagnostics _n = row_count;
  if _n <> 1 then
    raise exception 'FALHA (e): líder não alterou a data de fim do membro';
  end if;
  update public.work_team_members set status = 'revogado'
   where team_id = 'ee000000-0000-4000-8000-000000000001'
     and user_id = 'e1000000-0000-4000-8000-000000000006';
  get diagnostics _n = row_count;
  if _n <> 1 then
    raise exception 'FALHA (e): líder não tirou membro da própria equipe';
  end if;
  raise notice 'OK (e): líder inclui, altera e tira membro comum; não promove, não mexe em líder, outra equipe nem projeto';
end $$;
reset role;

-- (f) outra organização não vê -----------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.work_teams where organization_id = 'ea000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.work_team_members where organization_id = 'ea000000-0000-4000-8000-000000000001')
     or exists (select 1 from public.work_team_properties where organization_id = 'ea000000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (f): Org B lê equipe da Org A';
  end if;
  raise notice 'OK (f): outra organização não vê equipes, membros nem projetos';
end $$;
reset role;

-- (g) projetos alcançados pelas equipes --------------------------------------
-- Operacional (04): T1 dá P1 leitura com subprojetos; T2 dá P1c edição sem
-- subprojetos e P2 leitura.
do $$
declare
  _r record;
  _n integer;
begin
  select count(*) into _n from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004');
  if _n <> 4 then
    raise exception 'FALHA (g): esperava 4 projetos para o operacional, veio %', _n;
  end if;
  select * into _r from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004')
   where property_id = 'f1000000-0000-4000-8000-000000000002';
  if _r.access <> 'write' or cardinality(_r.team_ids) <> 2 then
    raise exception 'FALHA (g): P1c devia ser edição pelas duas equipes, veio % %', _r.access, _r.team_ids;
  end if;
  select * into _r from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004')
   where property_id = 'f1000000-0000-4000-8000-000000000003';
  if _r.access <> 'read' or _r.team_ids <> array['ee000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'FALHA (g): P1cc devia vir só de T1, em leitura';
  end if;
  if exists (select 1 from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000006')) then
    raise exception 'FALHA (g): membro revogado da equipe ainda alcança projeto';
  end if;
end $$;

-- Vínculo vencido (sem passar pelo gatilho, que recusa data passada).
set local session_replication_role = replica;
update public.work_team_members set expires_at = now() - interval '1 minute'
 where team_id = 'ee000000-0000-4000-8000-000000000002'
   and user_id = 'e1000000-0000-4000-8000-000000000004';
-- Ciclo na árvore: P1 vira filho de P1cc.
update public.sports_properties set parent_property_id = 'f1000000-0000-4000-8000-000000000003'
 where id = 'f1000000-0000-4000-8000-000000000001';
set local session_replication_role = origin;

do $$
declare _ids uuid[];
begin
  select array_agg(property_id order by property_id) into _ids
    from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004');
  if _ids is distinct from array[
       'f1000000-0000-4000-8000-000000000001'::uuid,
       'f1000000-0000-4000-8000-000000000002'::uuid,
       'f1000000-0000-4000-8000-000000000003'::uuid] then
    raise exception 'FALHA (g): vínculo vencido ainda vale ou ciclo quebrou a árvore: %', _ids;
  end if;
end $$;

update public.sports_properties set parent_property_id = null
 where id = 'f1000000-0000-4000-8000-000000000001';

update public.organization_members set status = 'revogado'
 where organization_id = 'ea000000-0000-4000-8000-000000000001'
   and user_id = 'e1000000-0000-4000-8000-000000000003';
do $$
begin
  if exists (select 1 from public.projetos_das_equipes('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003')) then
    raise exception 'FALHA (g): membro revogado da organização ainda alcança projeto pela equipe';
  end if;
  raise notice 'OK (g): união das equipes, subprojetos, edição vence leitura; vencido, revogado e ciclo tratados';
end $$;
update public.organization_members set status = 'ativo'
 where organization_id = 'ea000000-0000-4000-8000-000000000001'
   and user_id = 'e1000000-0000-4000-8000-000000000003';

-- (h) "Ver como" só para owner/admin ------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.acesso_do_membro('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004');
    raise exception 'FALHA (h): comercial usou o Ver como';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform * from public.acesso_do_membro('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004');
    raise exception 'FALHA (h): owner de outra organização usou o Ver como';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare _r record;
begin
  select * into _r from public.acesso_do_membro('ea000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004')
   where property_id = 'f1000000-0000-4000-8000-000000000002';
  if _r.property_name <> 'Etapa P1c' or _r.team_names <> array['Comercial SP'] then
    raise exception 'FALHA (h): Ver como devolveu % %', _r.property_name, _r.team_names;
  end if;
  raise notice 'OK (h): Ver como só para owner/admin, com nome do projeto e das equipes';
end $$;
reset role;

-- (i) escopo na matriz --------------------------------------------------------
do $$
begin
  if exists (select 1 from public.organization_role_grants
              where organization_id = 'ea000000-0000-4000-8000-000000000001'
                and scope <> 'organizacao') then
    raise exception 'FALHA (i): escopo padrão não é organização';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    update public.organization_role_grants set scope = 'equipe'
     where organization_id = 'ea000000-0000-4000-8000-000000000001' and role = 'admin' and module = 'crm';
    raise exception 'FALHA (i): administrador saiu do escopo organização';
  exception when check_violation then null;
  end;
  begin
    update public.organization_role_grants set scope = 'equipe'
     where organization_id = 'ea000000-0000-4000-8000-000000000001' and role = 'comercial' and module = 'team';
    raise exception 'FALHA (i): módulo team ganhou escopo de equipe';
  exception when check_violation then null;
  end;
  update public.organization_role_grants set scope = 'equipe'
   where organization_id = 'ea000000-0000-4000-8000-000000000001' and role = 'comercial' and module = 'crm';
  if not exists (
    select 1 from public.team_audit_log
     where organization_id = 'ea000000-0000-4000-8000-000000000001'
       and action = 'scope_changed'
       and metadata ->> 'module' = 'crm'
       and metadata ->> 'after' = 'equipe'
  ) then
    raise exception 'FALHA (i): mudança de escopo não auditada';
  end if;
  raise notice 'OK (i): escopo padrão organização; owner, admin e team travados; mudança auditada';
end $$;
reset role;

-- (j) convite com equipes -------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.organization_invites (organization_id, email, role, invited_by, team_ids)
    values ('ea000000-0000-4000-8000-000000000001', 'eq.convidado@teste.local', 'operacional',
            'e1000000-0000-4000-8000-000000000001',
            array['ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-0000000000b1']::uuid[]);
    raise exception 'FALHA (j): convite levou equipe de outra organização';
  exception when check_violation then null;
  end;
end $$;
insert into public.organization_invites (id, organization_id, email, role, invited_by, team_ids) values
  ('c1000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'eq.convidado@teste.local', 'operacional',
   'e1000000-0000-4000-8000-000000000001',
   array['ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000001']::uuid[]),
  ('c1000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'eq.novo@teste.local', 'comercial',
   'e1000000-0000-4000-8000-000000000001',
   array['ee000000-0000-4000-8000-000000000002']::uuid[]);
reset role;

do $$
begin
  if (select team_ids from public.organization_invites where id = 'c1000000-0000-4000-8000-000000000001')
     <> array['ee000000-0000-4000-8000-000000000001'::uuid] then
    raise exception 'FALHA (j): equipes repetidas no convite';
  end if;
end $$;

-- Conta existente aceita.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select public.aceitar_convite_de_organizacao('c1000000-0000-4000-8000-000000000001');
reset role;

-- Conta nova: handle_new_user aceita o convite no cadastro.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'eq.novo@teste.local', now(), '{"full_name":"Novo"}');

do $$
begin
  if not exists (
    select 1 from public.work_team_members
     where team_id = 'ee000000-0000-4000-8000-000000000001'
       and user_id = 'e1000000-0000-4000-8000-000000000007'
       and status = 'ativo' and team_role = 'membro'
  ) then
    raise exception 'FALHA (j): aceite não pôs a conta existente na equipe do convite';
  end if;
  if not exists (
    select 1 from public.work_team_members
     where team_id = 'ee000000-0000-4000-8000-000000000002'
       and user_id = 'e1000000-0000-4000-8000-000000000008'
       and status = 'ativo'
  ) then
    raise exception 'FALHA (j): cadastro pelo convite não pôs a conta nova na equipe';
  end if;
  raise notice 'OK (j): convite só com equipes da organização; aceite e cadastro entram nas equipes';
end $$;

-- (k) auditoria --------------------------------------------------------------
do $$
declare _faltando text;
begin
  select string_agg(esperado.acao, ', ') into _faltando
    from (values
      ('team_created', 'e1000000-0000-4000-8000-000000000001'),
      ('team_archived', 'e1000000-0000-4000-8000-000000000001'),
      ('team_member_added', 'e1000000-0000-4000-8000-000000000001'),
      ('team_property_added', 'e1000000-0000-4000-8000-000000000001'),
      ('team_member_added', 'e1000000-0000-4000-8000-000000000003'),
      ('team_member_updated', 'e1000000-0000-4000-8000-000000000003'),
      ('team_member_removed', 'e1000000-0000-4000-8000-000000000003'),
      ('team_member_added', 'e1000000-0000-4000-8000-000000000007')
    ) as esperado(acao, ator)
   where not exists (
     select 1 from public.team_audit_log l
      where l.organization_id = 'ea000000-0000-4000-8000-000000000001'
        and l.action = esperado.acao
        and l.actor_id = esperado.ator::uuid
        and l.metadata ? 'team_name'
   );
  if _faltando is not null then
    raise exception 'FALHA (k): auditoria sem %', _faltando;
  end if;
  if exists (
    select 1 from public.team_audit_log
     where organization_id = 'eb000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'FALHA (k): equipe criada sem sessão gerou auditoria';
  end if;
  raise notice 'OK (k): criação, arquivamento, membros e projetos auditados com o autor';
end $$;

rollback;
