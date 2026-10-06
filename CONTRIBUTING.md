# Contribuindo

Mudanças focadas, testadas e seguras para o isolamento entre organizações.

Monorepo: `portal/` (app React, workspace npm), `supabase/` (migrations, seed,
testes, edge functions, tools), `docker/` (stack do Supabase), `docs/`. Rode
todos os comandos a partir da raiz.

Antes de mudar comportamento de domínio:

1. Leia `CLAUDE.md`.
2. Leia `supabase/migrations/SCHEMA_NOTES.md` e as ADRs relevantes.
3. Identifique impacto em organização (tenant), autorização, RLS e ciclo de
   vida dos dados.
4. Implemente com testes.
5. Atualize a documentação se o comportamento ou a arquitetura mudar.

Branches: PRs de feature vão para `dev`; promoção `dev` → `hml` → `main`.

Formato de commit: `<tipo>(<escopo>): <descricao em portugues>`

Tipos: feature, fix, refactor, chore, docs, test, perf, build, ci, security.
