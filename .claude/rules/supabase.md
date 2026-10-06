# Supabase

## Banco de dados

Toda alteração estrutural exige uma migration nova em
`supabase/migrations/000N_descricao.sql`. Nunca editar uma migration já
aplicada (`0001_extensions.sql` … `0005_rls_policies.sql`) — mesmo para
corrigir um erro nela: crie uma migration nova que corrige o efeito.

Nunca alterar o schema manualmente (inclusive via Supabase Studio) como
solução definitiva — isso não fica versionado e diverge entre ambientes.

## Boas práticas para tabelas novas

- Toda tabela precisa de `created_at` e `updated_at` (padrão já usado em todo
  o schema atual).
- Toda tabela de domínio precisa de `organization_id` — direto, ou herdado de
  uma tabela pai quando a linha não faz sentido sem o pai (ver padrões de RLS
  abaixo).
- Exclusão de registro de negócio relevante (contrato, patrocinador,
  proposta) deve ser avaliada como desativação lógica (campo de status) em vez
  de `DELETE` físico, seguindo o padrão já usado (`status = 'ativo'` /
  `'revogado'` em `organization_members`, `sponsor_portal_access` etc.),
  exceto quando o domínio já tratar aquela entidade como descartável.

## Migrations

Migrations devem ser:

- determinísticas e reproduzíveis;
- versionadas em ordem (não pule nem reutilize um número);
- revisáveis (uma migration, uma intenção clara);
- cuidadosas com operações destrutivas — antes de remover tabela, coluna,
  índice, constraint ou policy, verifique referências no código
  (`portal/src/integrations/supabase/types.ts`, Edge Functions, componentes).

## RLS — obrigatória em toda tabela de organização

Toda tabela exposta à aplicação via `anon`/`authenticated` precisa de RLS
habilitada (`alter table ... enable row level security`) e de policy
explícita de SELECT/INSERT/UPDATE/DELETE. Nunca desabilite RLS para resolver
um problema de aplicação, nem mesmo temporariamente.

O schema atual (`0005_rls_policies.sql`) já estabelece 4 padrões — ao criar
uma tabela nova, identifique qual padrão ela segue em vez de inventar um novo:

1. **Tenant por linha própria** (`<tabela>_tenant`) — a tabela tem
   `organization_id` direto. Uma única policy `for all` usando
   `is_org_member(organization_id)` cobre select/insert/update/delete. É o
   padrão da maioria das ~71 tabelas.
2. **Tenant herdado** (`<tabela>_via_<pai>`) — a tabela não tem
   `organization_id` próprio, mas referencia uma tabela que tem (ex.:
   `ai_messages` via `ai_conversations`). A policy faz join/subquery contra o
   pai para checar `is_org_member`.
3. **Escopo por usuário** (`<tabela>_own`) — dado pessoal do usuário, não da
   organização inteira (ex.: `notifications`: um admin não deve ver
   notificações de outro membro só por serem da mesma organização). Policy
   usa `user_id = auth.uid()`, às vezes combinada com `is_org_member` quando a
   tabela também carrega `organization_id` (preferência pessoal escopada por
   organização).
4. **Escrita restrita a admin** (`<tabela>_admin_write`) — além do padrão 1,
   algumas tabelas administrativas (`organizations`, `organization_invites`,
   `organization_members`, `pipeline_funnels`, `contract_clause_templates`)
   restringem insert/update/delete a `has_org_role(organization_id,
   ['owner','admin'])`, mesmo que a leitura siga o padrão 1.

Dois padrões bônus, usados apenas onde o produto exige acesso fora do modelo
de `organization_members`:

5. **Catálogo/leitura pública** (`<tabela>_public_read`) — usado pelo Media
   Kit público (`/p/:slug`): leitura anônima restrita a registros de uma
   `sports_property` publicada (`is_property_published` e funções irmãs em
   `0004_functions.sql`).
6. **Portal do patrocinador** (`<tabela>_sponsor_portal_*`) — leitura (e, em
   `deliveries`/`delivery_approval_log`, a aprovação) para usuários com
   `sponsor_portal_access` ativo, via `has_sponsor_portal_access(sponsor_id)`,
   escopada por `sponsor_id`, não por organização.

Padrão adicionado pela reconciliação com o Lovable (ADR-0005, `0017`):

7. **Escrita por módulo** (`<tabela>_tenant_read` + `<tabela>_module_<cmd>` /
   `<tabela>_admin_delete`) — leitura para qualquer membro ativo;
   insert/update/delete só para `owner`/`admin` ou o papel do módulo, via
   `can_access_module(auth.uid(), organization_id, '<crm|operacional|financeiro>', true)`
   (`comercial` → crm, `operacional` → operacional, `financeiro` →
   financeiro). Usado nas 38 tabelas de CRM, propostas, contratos, parcelas,
   entregas, ativos e propriedades. Ao criar uma tabela nova desses módulos,
   use este padrão, não o 1 (que deixaria qualquer membro escrever).

Nunca use `has_role(..., 'admin')` (papel **global** de `user_roles`) em
policy de tabela de organização: no Lovable isso dava acesso a todas as
organizações e não foi portado de propósito (ADR-0005).

Ao criar ou alterar uma tabela, sempre avalie explicitamente quem pode ler,
inserir, atualizar e excluir, implemente a policy correspondente e confirme
que ela preserva o isolamento por organização (`CLAUDE.md` seção 6).

## Funções usadas pelas policies

`is_org_member(target_org_id uuid)` e `has_org_role(target_org_id uuid,
allowed_roles text[])`, ambas em `0004_functions.sql`, usam `auth.uid()`
internamente — não aceitam `user_id` como parâmetro. São as preferidas em
policies novas (mais seguras para uso direto em `USING`/`WITH CHECK`).

Existem também as sobrecargas reais do Lovable, com o usuário explícito e
**`_user_id` sempre como primeiro parâmetro** (recriadas nessa ordem em
`0012`): `is_org_member(_user_id, _org_id)`, `has_org_role(_user_id, _org_id,
_roles org_role[])`, `can_access_module(_user_id, _org_id, _module, _write)`,
`has_sponsor_access(_user_id, _sponsor_id)`, `has_role(_user_id, _role)` e
`can_access_contract_file(_user_id, _path)`. As funções e triggers portados
do Lovable as chamam de forma posicional nessa ordem; não a altere. Em Edge
Functions, chame-as via RPC com parâmetros nomeados e sempre com o `user.id`
derivado do JWT, nunca de um campo do body. São executáveis só por
`authenticated` e `service_role`.

Permissões de função: Postgres concede `EXECUTE` a `PUBLIC` (inclusive
`anon`) por padrão. Toda função nova `SECURITY DEFINER` deve fazer
`revoke all ... from public, anon, authenticated` e conceder só a quem
precisa. Funções de trigger ficam só com `service_role` (o disparo do trigger
não exige `EXECUTE`).

## Auth

Nunca colocar credenciais privilegiadas no frontend. A `service_role` nunca é
exposta ao browser. Variáveis `VITE_*` são públicas.

## Edge Functions

Toda Edge Function que recebe requisição autenticada deve validar o JWT,
derivar `user.id` dele, escopar por organização consultando
`organization_members` (nunca aceitar `organization_id` do body) e checar
papel quando a operação exigir. Funções que chamam a Anthropic API devem
manter `ANTHROPIC_API_KEY` só no ambiente da função — nunca retorná-la ou
logá-la.

## Ambiente local

O ambiente sobe via `docker/supabase/` (`npm run supabase:up`, depois
`npm run supabase:migrate`). Chaves geradas localmente
(`npm run supabase:chaves`) são exclusivas de desenvolvimento — nunca
reaproveitar em homologação ou produção. Detalhes em
`docker/supabase/README.md`.
