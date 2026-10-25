-- Permissões editáveis por organização (0036).
--
-- Transação revertida no fim.

\echo ''
\echo '=== Testes de permissões por organização (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '6a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'perm.a@teste.local', '{"full_name":"Owner A"}'),
  ('00000000-0000-0000-0000-000000000000', '6d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'perm.admin@teste.local', '{"full_name":"Admin A"}'),
  ('00000000-0000-0000-0000-000000000000', '6c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'perm.comercial@teste.local', '{"full_name":"Comercial A"}'),
  ('00000000-0000-0000-0000-000000000000', '6f000000-0000-4000-8000-00000000000f', 'authenticated', 'authenticated', 'perm.financeiro@teste.local', '{"full_name":"Financeiro A"}'),
  ('00000000-0000-0000-0000-000000000000', '6e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'perm.operacional@teste.local', '{"full_name":"Operacional A"}'),
  ('00000000-0000-0000-0000-000000000000', '6b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'perm.b@teste.local', '{"full_name":"Owner B"}');

insert into public.organizations (id, owner_id, name) values
  ('a6000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-00000000000a', 'Org A (permissoes)'),
  ('b6000000-0000-4000-8000-000000000002', '6b000000-0000-4000-8000-00000000000b', 'Org B (permissoes)');

insert into public.organization_members (organization_id, user_id, role, status) values
  ('a6000000-0000-4000-8000-000000000001', '6d000000-0000-4000-8000-00000000000d', 'admin', 'ativo'),
  ('a6000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-00000000000c', 'comercial', 'ativo'),
  ('a6000000-0000-4000-8000-000000000001', '6f000000-0000-4000-8000-00000000000f', 'financeiro', 'ativo'),
  ('a6000000-0000-4000-8000-000000000001', '6e000000-0000-4000-8000-00000000000e', 'operacional', 'ativo');

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a600000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-00000000000a', 'Sponsor A (permissoes)');

-- (a) organização nova nasce com o padrão do banco -------------------------
do $$
begin
  if (select count(*) from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001') <> 20 then
    raise exception 'FALHA (a): a organização não ganhou as 20 permissões';
  end if;
  if (select access from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001'
         and role = 'operacional' and module = 'crm') <> 'read' then
    raise exception 'FALHA (a): operacional deixou de ler o CRM';
  end if;
  if (select access from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001'
         and role = 'operacional' and module = 'team') <> 'none' then
    raise exception 'FALHA (a): operacional ganhou acesso à equipe';
  end if;
  if (select count(*) from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001'
         and role = 'owner' and access = 'write') <> 4 then
    raise exception 'FALHA (a): proprietário não ficou com edição nos quatro módulos';
  end if;
  if not public.can_access_module(
       '6e000000-0000-4000-8000-00000000000e',
       'a6000000-0000-4000-8000-000000000001', 'crm', false) then
    raise exception 'FALHA (a): operacional não lê o CRM pela função';
  end if;
  if public.can_access_module(
       '6e000000-0000-4000-8000-00000000000e',
       'a6000000-0000-4000-8000-000000000001', 'crm', true) then
    raise exception 'FALHA (a): operacional escreve no CRM';
  end if;
  if public.can_access_module(
       '6c000000-0000-4000-8000-00000000000c',
       'a6000000-0000-4000-8000-000000000001', 'team', false) then
    raise exception 'FALHA (a): comercial lê a equipe';
  end if;
  raise notice 'OK (a): organização nova nasce com o padrão do banco';
end $$;

-- (b) admin fecha o financeiro do comercial; a leitura de parcelas usa isso
do $$
begin
  if not exists (
    select 1
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
     where c.relname = 'installments'
       and p.polname = 'installments_tenant_read'
       and pg_get_expr(p.polqual, p.polrelid) like '%financeiro%'
  ) then
    raise exception 'FALHA (b): a leitura de parcelas não consulta o módulo financeiro';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
update public.organization_role_grants
   set access = 'none'
 where organization_id = 'a6000000-0000-4000-8000-000000000001'
   and role = 'comercial'
   and module = 'financeiro';
do $$
begin
  if public.can_access_module(
       '6c000000-0000-4000-8000-00000000000c',
       'a6000000-0000-4000-8000-000000000001', 'financeiro', false) then
    raise exception 'FALHA (b): comercial ainda lê o financeiro';
  end if;
  if (select count(*) from public.team_audit_log
       where organization_id = 'a6000000-0000-4000-8000-000000000001'
         and action = 'permission_changed'
         and actor_id = '6d000000-0000-4000-8000-00000000000d') <> 1 then
    raise exception 'FALHA (b): a alteração não entrou na auditoria da equipe';
  end if;
  raise notice 'OK (b): admin fecha o financeiro do comercial e a auditoria registra';
end $$;

-- (c) proprietário não perde edição; admin não mexe na equipe dos admins ----
do $$
declare n int;
begin
  update public.organization_role_grants
     set access = 'read'
   where organization_id = 'a6000000-0000-4000-8000-000000000001'
     and role = 'owner'
     and module = 'team';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHA (c): admin alterou permissão do proprietário';
  end if;
  begin
    update public.organization_role_grants
       set access = 'none'
     where organization_id = 'a6000000-0000-4000-8000-000000000001'
       and role = 'admin'
       and module = 'team';
    raise exception 'FALHA (c): admin tirou o próprio acesso de equipe';
  exception when check_violation then null;
  end;
  raise notice 'OK (c): proprietário segue com edição e a equipe dos admins fica com o proprietário';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
update public.organization_role_grants
   set access = 'read'
 where organization_id = 'a6000000-0000-4000-8000-000000000001'
   and role = 'admin'
   and module = 'crm';
do $$
begin
  if (select access from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001'
         and role = 'admin' and module = 'crm') <> 'read' then
    raise exception 'FALHA (c): proprietário não editou o administrador';
  end if;
  raise notice 'OK (c): proprietário edita os demais papéis';
end $$;
reset role;

do $$
begin
  begin
    update public.organization_role_grants
       set access = 'read'
     where organization_id = 'a6000000-0000-4000-8000-000000000001'
       and role = 'owner'
       and module = 'crm';
    raise exception 'FALHA (c): o banco aceitou tirar edição do proprietário';
  exception when check_violation then null;
  end;
end $$;

-- (d) financeiro não grava; admin de outra organização não alcança ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6f000000-0000-4000-8000-00000000000f","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.organization_role_grants
     set access = 'none'
   where organization_id = 'a6000000-0000-4000-8000-000000000001'
     and role = 'comercial'
     and module = 'crm';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHA (d): financeiro alterou permissão';
  end if;
  begin
    insert into public.organization_role_grants (organization_id, role, module, access)
    values ('a6000000-0000-4000-8000-000000000001', 'comercial', 'crm', 'none');
    raise exception 'FALHA (d): membro inseriu permissão pela API';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (d): financeiro não altera a matriz';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.organization_role_grants
     set access = 'none'
   where organization_id = 'a6000000-0000-4000-8000-000000000001'
     and role = 'comercial'
     and module = 'crm';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALHA (d): admin de outra organização alterou a matriz';
  end if;
  if (select count(*) from public.organization_role_grants
       where organization_id = 'a6000000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (d): owner B leu a matriz da Org A';
  end if;
  raise notice 'OK (d): a matriz não atravessa organizações';
end $$;
reset role;

-- (e) sem acesso no CRM, o operacional deixa de ver o patrocinador ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
update public.organization_role_grants
   set access = 'none'
 where organization_id = 'a6000000-0000-4000-8000-000000000001'
   and role = 'operacional'
   and module = 'crm';
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.sponsors
       where id = '5a600000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'FALHA (e): operacional sem CRM ainda lê o patrocinador';
  end if;
  raise notice 'OK (e): sem acesso no CRM o patrocinador some';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes de permissões por organização ==='
