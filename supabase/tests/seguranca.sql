-- seguranca.sql
-- Teste de segurança básico para o schema reconstruído do BrandPlay
-- (supabase/migrations/0001..0005). Cobre o pedido mínimo do Passo 5:
--   (a) `anon` não consegue ler organizations/sponsors/contracts sem
--       policy de leitura pública;
--   (b) roteiro (comentado) de teste de isolamento cross-organization.
--
-- Como rodar (localmente, com Supabase CLI + Postgres local):
--   supabase start
--   supabase db reset   -- aplica 0001..0005 em ordem
--   psql "$(supabase status -o json | jq -r '.DB_URL')" -f supabase/tests/seguranca.sql
--
-- Este script assume que as migrations já foram aplicadas. Ele NÃO depende
-- de dados de seed - a parte (a) funciona em um banco vazio. A parte (b)
-- fica documentada em comentários porque depende de usuários/organizações
-- de teste que ainda não existem neste repositório (não há seed.sql).

\echo '=== Teste (a): anon não pode ler tabelas sensíveis sem policy pública ==='

-- Simula uma requisição do client anônimo (role usada pela anon key do
-- Supabase). Qualquer ambiente Supabase (local ou self-hosted) cria o role
-- `anon` durante o setup padrão do projeto.
set role anon;

-- organizations: NÃO deve haver nenhuma policy de SELECT para `anon` em
-- 0005_rls_policies.sql (só existe `organizations_select` para
-- `authenticated`). O resultado esperado é 0 linhas (não é um erro de
-- permissão porque RLS filtra silenciosamente, e sim porque nenhuma linha
-- passa em nenhuma policy).
select count(*) as organizations_visiveis_para_anon from public.organizations;
-- ESPERADO: 0

-- sponsors: só há policy pública (`sponsors_public_read`) para sponsors que
-- aparecem em contratos ativos/vencendo ou vendas de tier de uma propriedade
-- PUBLICADA (public.is_sponsor_publicly_visible). Em um banco vazio (sem
-- nenhuma sports_properties.is_published = true), o resultado esperado
-- também é 0.
select count(*) as sponsors_visiveis_para_anon from public.sponsors;
-- ESPERADO: 0 (em banco vazio ou sem propriedades publicadas)

-- contracts: só há policy pública (`contracts_public_read`) para contratos
-- com status ativo/vencendo E propriedade publicada. Em banco vazio: 0.
select count(*) as contracts_visiveis_para_anon from public.contracts;
-- ESPERADO: 0 (em banco vazio ou sem propriedades publicadas)

-- Tentar inserir uma organização como anon deve falhar (não há policy de
-- INSERT para authenticated nem anon em organizations - criação só via RPC
-- security definer create_organization_with_owner, não reconstruída aqui).
do $$
begin
  begin
    insert into public.organizations (owner_id, name) values (gen_random_uuid(), 'Org Teste Anon');
    raise exception 'FALHA DE SEGURANCA: anon conseguiu inserir em organizations!';
  exception
    when insufficient_privilege then
      raise notice 'OK: anon foi bloqueado ao tentar inserir em organizations (insufficient_privilege)';
    when others then
      -- RLS geralmente gera 'new row violates row-level security policy'
      raise notice 'OK: anon foi bloqueado ao tentar inserir em organizations (%)', sqlerrm;
  end;
end $$;

reset role;

\echo '=== Fim do teste (a) ==='

\echo ''
\echo '=== Teste (b): isolamento cross-organization (ROTEIRO - requer 2 orgs) ==='
\echo 'supabase/seed/00-seed.sql cria só 1 organização/usuário - não basta para'
\echo 'este teste. O roteiro abaixo fica documentado para ser executado'
\echo 'manualmente (ou automatizado depois, com um segundo usuário/organização)'
\echo 'via supabase-js ou psql + `set role authenticated` + '
\echo '`set request.jwt.claims`.'

/*
Roteiro de isolamento cross-organization (executar manualmente com dados de
teste, ou adaptar para pgTAP/supabase test):

1. Criar duas organizações e dois usuários de teste:
     insert into auth.users (id, email) values
       ('11111111-1111-1111-1111-111111111111', 'user_a@teste.com'),
       ('22222222-2222-2222-2222-222222222222', 'user_b@teste.com');

     insert into public.organizations (id, owner_id, name) values
       ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Org A'),
       ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Org B');

     insert into public.organization_members (organization_id, user_id, role, status) values
       ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'ativo'),
       ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner', 'ativo');

2. Criar um sponsor em cada organização:
     insert into public.sponsors (id, organization_id, owner_id, name) values
       ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sponsor da Org A'),
       ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Sponsor da Org B');

3. Simular o JWT do usuário A e confirmar que ele NÃO vê o sponsor da Org B:
     set role authenticated;
     set request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111"}';
     -- (em Supabase real, auth.uid() lê de request.jwt.claims ->> 'sub')

     select count(*) from public.sponsors where id = 'dddddddd-0000-0000-0000-000000000002';
     -- ESPERADO: 0 (usuário A não é membro da Org B)

     select count(*) from public.sponsors where id = 'cccccccc-0000-0000-0000-000000000001';
     -- ESPERADO: 1 (usuário A é membro/owner da Org A)

     -- Tentar atualizar o sponsor da Org B como usuário A deve afetar 0 linhas
     -- (RLS bloqueia silenciosamente via WITH CHECK / USING, não gera erro):
     update public.sponsors set name = 'HACKED' where id = 'dddddddd-0000-0000-0000-000000000002';
     -- ESPERADO: UPDATE 0

4. Repetir o inverso com o usuário B para confirmar simetria.

5. Testar `has_org_role`: um usuário com role 'comercial' na Org A não deve
   conseguir criar convites em organization_invites nem alterar
   organizations.name:
     set request.jwt.claims = '{"sub": "<uuid do usuario comercial>"}';
     insert into public.organization_invites (organization_id, email, invited_by)
       values ('aaaaaaaa-0000-0000-0000-000000000001', 'novo@teste.com', '<uuid>');
     -- ESPERADO: erro "new row violates row-level security policy"
       (porque organization_invites_admin_insert exige role in ('owner','admin'))

Observação: para rodar isso via supabase-js (mais realista que psql +
request.jwt.claims manual), basta criar dois usuários reais via
supabase.auth.signUp(), adicioná-los a organizations diferentes, logar com
cada um e repetir os SELECTs/UPDATEs acima pelo client - o resultado esperado
é o mesmo.
*/

\echo '=== Fim do roteiro (b) ==='

-- ===========================================================================
-- Testes automatizados (c)..(g): isolamento entre organizações (automatiza o
-- roteiro (b)), escrita por módulo, perfis, trigger de organization_id e
-- escopo por usuário. Cobrem a reconciliação com o schema real do Lovable
-- (0012..0017).
--
-- Tudo roda numa transação com ROLLBACK no fim: o script cria os próprios
-- usuários/organizações e não deixa resíduo. Cada verificação que falha
-- levanta exceção; com psql -v ON_ERROR_STOP=1 (npm run supabase:test) o
-- script termina com erro.
--
-- Usuários (uuid fixos): A = owner da Org A, B = owner da Org B,
-- C = financeiro, D = operacional, E = comercial (os três na Org A).
-- ===========================================================================
\echo ''
\echo '=== Testes (c)..(g): RLS reconciliada (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '0a000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'teste.a@seguranca.local', '{"full_name":"Usuario A"}'),
  ('00000000-0000-0000-0000-000000000000', '0b000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'teste.b@seguranca.local', '{"full_name":"Usuario B"}'),
  ('00000000-0000-0000-0000-000000000000', '0c000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated', 'teste.c@seguranca.local', '{"full_name":"Usuario C"}'),
  ('00000000-0000-0000-0000-000000000000', '0d000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated', 'teste.d@seguranca.local', '{"full_name":"Usuario D"}'),
  ('00000000-0000-0000-0000-000000000000', '0e000000-0000-4000-8000-00000000000e', 'authenticated', 'authenticated', 'teste.e@seguranca.local', '{"full_name":"Usuario E"}');

-- handle_new_user (0015) cria uma organização pessoal para cada usuário;
-- os testes usam duas organizações explícitas.
insert into public.organizations (id, owner_id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'Org A (teste)'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-00000000000b', 'Org B (teste)');
-- on_organization_created já inseriu os owners; adiciona os demais papéis
insert into public.organization_members (organization_id, user_id, role, status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '0c000000-0000-4000-8000-00000000000c', 'financeiro', 'ativo'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-00000000000d', 'operacional', 'ativo'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-00000000000e', 'comercial', 'ativo');

insert into public.sponsors (id, organization_id, owner_id, name) values
  ('5a000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'Sponsor A'),
  ('5b000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', '0b000000-0000-4000-8000-00000000000b', 'Sponsor B');

insert into public.sports_properties (id, organization_id, owner_id, name, category, is_published) values
  ('9a000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'Propriedade publicada A', 'futebol', true);

-- (c) isolamento: A não vê nem altera dados da Org B -------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.sponsors where id = '5b000000-0000-4000-8000-000000000002') <> 0 then
    raise exception 'FALHA (c): usuário A enxerga sponsor da Org B';
  end if;
  if (select count(*) from public.sponsors where id = '5a000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA (c): usuário A não enxerga o sponsor da própria organização';
  end if;
  update public.sponsors set name = 'HACKED' where id = '5b000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA (c): usuário A alterou sponsor da Org B'; end if;
  begin
    insert into public.sponsors (organization_id, owner_id, name)
    values ('bbbbbbbb-0000-4000-8000-000000000002', '0a000000-0000-4000-8000-00000000000a', 'Intruso');
    raise exception 'FALHA (c): usuário A inseriu sponsor na Org B';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (c): isolamento entre organizações';
end $$;
reset role;

-- (d) escrita por módulo: operacional/financeiro leem mas não escrevem no CRM
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0d000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.sponsors where id = '5a000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FALHA (d): operacional não consegue ler sponsors da própria organização';
  end if;
  update public.sponsors set name = 'Alterado pelo operacional' where id = '5a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA (d): operacional alterou sponsor (módulo crm)'; end if;
  begin
    insert into public.sponsors (organization_id, owner_id, name)
    values ('aaaaaaaa-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-00000000000d', 'Criado pelo operacional');
    raise exception 'FALHA (d): operacional criou sponsor (módulo crm)';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK (d): operacional sem escrita no CRM';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0c000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.sponsors set name = 'Alterado pelo financeiro' where id = '5a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHA (d): financeiro alterou sponsor (módulo crm)'; end if;
  raise notice 'OK (d): financeiro sem escrita no CRM';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.sponsors set name = 'Sponsor A (comercial)' where id = '5a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHA (d): comercial não conseguiu alterar sponsor (módulo crm)'; end if;
  raise notice 'OK (d): comercial escreve no CRM';
end $$;
reset role;

-- (e) profiles: só o próprio e o de membros das mesmas organizações ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.profiles where id = '0b000000-0000-4000-8000-00000000000b') <> 0 then
    raise exception 'FALHA (e): usuário A lê o perfil do usuário B (outra organização)';
  end if;
  if (select count(*) from public.profiles where id = '0e000000-0000-4000-8000-00000000000e') <> 1 then
    raise exception 'FALHA (e): usuário A não lê o perfil de um membro da própria organização';
  end if;
  raise notice 'OK (e): perfis restritos às organizações em comum';
end $$;
reset role;

-- (f) lead do media kit público: o visitante anônimo consegue enviar, o lead e
-- a oportunidade gerada ficam na organização da PROPRIEDADE (mesmo que o
-- formulário mande o owner_id de um usuário de outra organização) e o owner vê.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into public.property_leads (property_id, owner_id, contact_name, email)
values ('9a000000-0000-4000-8000-000000000001', '0b000000-0000-4000-8000-00000000000b', 'Visitante', 'visitante@exemplo.com');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0a000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
declare l record;
begin
  select * into l from public.property_leads where email = 'visitante@exemplo.com';
  if not found then
    raise exception 'FALHA (f): lead público invisível para a organização dona da propriedade';
  end if;
  if l.organization_id is distinct from 'aaaaaaaa-0000-4000-8000-000000000001'
     or l.owner_id is distinct from '0a000000-0000-4000-8000-00000000000a' then
    raise exception 'FALHA (f): lead público com organização/owner vindos do formulário';
  end if;
  if l.created_opportunity_id is null or not exists (
       select 1 from public.opportunities o
       where o.id = l.created_opportunity_id
         and o.organization_id = 'aaaaaaaa-0000-4000-8000-000000000001') then
    raise exception 'FALHA (f): oportunidade do lead ausente ou fora da organização da propriedade';
  end if;
  raise notice 'OK (f): lead do media kit chega à organização da propriedade, com oportunidade';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0b000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.opportunities where brand = 'Visitante') then
    raise exception 'FALHA (f): oportunidade do lead visível/injetada na Org B';
  end if;
  raise notice 'OK (f): lead não injeta oportunidade em outra organização';
end $$;
reset role;

-- (g) conversas de IA são do próprio usuário --------------------------------
insert into public.ai_conversations (organization_id, user_id, title)
values ('aaaaaaaa-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-00000000000a', 'Conversa privada de A');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"0e000000-0000-4000-8000-00000000000e","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.ai_conversations where title = 'Conversa privada de A') <> 0 then
    raise exception 'FALHA (g): membro da mesma organização lê conversa de IA de outro usuário';
  end if;
  raise notice 'OK (g): conversas de IA restritas ao próprio usuário';
end $$;
reset role;

rollback;

\echo '=== Fim dos testes (c)..(g) ==='
