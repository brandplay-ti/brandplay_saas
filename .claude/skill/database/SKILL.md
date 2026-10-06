---
name: database
description: Analisa e implementa alterações no banco Supabase do BrandPlay com foco em migrations e RLS por organização.
---

# Database

Antes de alterar o banco:

1. Identifique as tabelas relacionadas em `supabase/migrations/0003_tables.sql`.
2. Identifique foreign keys e se `organization_id` é direto ou herdado de uma
   tabela pai.
3. Identifique índices existentes.
4. Confira se RLS já está habilitada para a tabela (`0005_rls_policies.sql`,
   Seção 1).
5. Identifique as policies existentes e qual dos padrões elas seguem (ver
   `.claude/rules/supabase.md`: tenant por linha própria, tenant herdado,
   escopo por usuário, admin-write, público, portal do patrocinador).
6. Procure referências no código: `portal/src/integrations/supabase/types.ts`,
   hooks em `portal/src/hooks/`, Edge Functions em `supabase/functions/`.
7. Consulte `supabase/migrations/SCHEMA_NOTES.md` — ele documenta suposições e
   divergências assumidas na reconstrução do schema; uma alteração pode estar
   corrigindo (ou piorando) uma suposição já sinalizada ali.

## Migration

Toda alteração estrutural gera uma migration **nova** (`000N_descricao.sql`).
Nunca editar `0001`–`0005` existentes. A migration deve ser revisável e
segura: uma intenção clara por arquivo.

Toda tabela nova precisa de `created_at`/`updated_at` e, quando for tabela de
domínio, de `organization_id` (direto ou herdado).

## RLS

Para cada tabela criada ou alterada, defina explicitamente a estratégia de:

- SELECT
- INSERT
- UPDATE
- DELETE

Identifique qual dos padrões de `0005_rls_policies.sql` se aplica antes de
escrever a policy do zero. Nomeie a policy seguindo a convenção existente:
`<tabela>_tenant`, `<tabela>_via_<pai>`, `<tabela>_own`,
`<tabela>_admin_write`, `<tabela>_public_read`, `<tabela>_sponsor_portal`.

## Segurança

Nunca desabilitar RLS para resolver um problema de aplicação. Nunca colocar
`service_role` no frontend. Confirme que nenhuma policy nova permite que um
usuário veja dado de uma organização da qual não é membro ativo (ou, no caso
do portal, de um patrocinador ao qual não tem `sponsor_portal_access` ativo).

## Compatibilidade

Avalie compatibilidade entre:

- schema atual;
- migration nova;
- código atual (hooks, componentes, Edge Functions que já leem/escrevem a
  tabela);
- código novo que a tarefa está introduzindo;
- possibilidade de rollback da migration.

## Finalização

Apresente:

### Schema changes

Alterações realizadas (tabelas, colunas, índices, constraints).

### Security

Policies e RLS criados/alterados, e qual padrão cada um segue.

### Migration

Arquivo da migration nova.

### Impact

Possíveis impactos em código existente (types.ts desatualizado, Edge Function
que precisa ser ajustada, etc.).

### Validation

Como a alteração foi validada (`npm run supabase:migrate`,
`npm run supabase:migrate:status`, `npm run supabase:test` quando a mudança
tocou RLS).
