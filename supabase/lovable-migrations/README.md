# Migrations originais do Lovable Cloud (somente referência)

Estes 95 arquivos vieram do export do Lovable em 2026-10-01
(`chore(sync): importa codigo atual do lovable…`). São o histórico **real** do
schema do banco do Lovable Cloud (projeto `qwyqmzvbopcirhkoenmp`), na ordem em
que a plataforma os aplicou.

**Não são aplicados** pelo `supabase/tools/migrate.sh` nem pelo CI: ficam fora
de `supabase/migrations/` de propósito. O schema do self-hosted continua sendo
`supabase/migrations/0001_…` em diante (ADR-0004).

Uso: fonte da verdade para reconciliar o schema reconstruído com o banco real
antes da migração de dados (`docs/architecture/plano-migracao-dados-lovable-vps.md`,
seção 2). Cada diferença encontrada vira uma migration nova numerada em
`supabase/migrations/`. Nunca copiar estes arquivos para lá como estão:
eles recriam tabelas que já existem e não seguem o padrão de RLS de
`0005_rls_policies.sql`.
