# CI/CD

Fonte de verdade: `docs/infrastructure/cicd.md` (pipeline) e
`docs/architecture/deployment.md` (topologia no Dockploy). Decisão registrada
na ADR-0006.

## Ambientes

- local — `docker/supabase/` + `npm run dev` (bloco de portas 8080/8010/...)
- homologação — branch `hml`, serviços `supabase-hml` e `portal-hml` no Dockploy
- produção — branch `main`, serviços `supabase-producao` e `portal-producao`

`dev` é a branch padrão e o alvo dos PRs de feature. Promoção:
`dev` → `hml` → `main`, sempre por PR.

## CI (`.github/workflows/ci.yml`)

Todo PR e todo push em `dev`, `hml` e `main` executam:

**`portal`**: `npm ci` → lint (**não bloqueante** — dívida herdada do Lovable,
ver `docs/infrastructure/cicd.md`) → `type-check` → `test` → `build`.

**`migrations`**: guarda contra migration destrutiva sem marcador
(`-- destrutivo: aprovado por <nome> em <data>` na primeira linha) → sobe o
mesmo stack de `docker/supabase/` → aplica as migrations → exige idempotência →
seed local → `supabase/tests/seguranca.sql`.

Não introduza código que aumente a contagem de erros de lint. Não torne um
passo não bloqueante para fazer um PR passar.

## CD (`.github/workflows/deploy.yml`)

- O Dockploy publica cada ambiente a partir da branch dele (watch +
  autodeploy). O workflow `Deploy (VPS)` é manual: atualiza o clone na VPS,
  **lista** migrations pendentes, dispara o webhook do portal e faz health
  check.
- **Nenhum passo automatizado escreve no banco.** Migrations são aplicadas à
  mão (`docs/runbooks/primeira-carga.md`), homologação primeiro, com backup
  antes, e **antes** de publicar portal que dependa de schema novo.
- Configuração de containers (segredos, domínios, TLS, volumes) vive no
  Dockploy. Editar o compose local não muda produção; mudar o Dockploy não
  passa por PR — registre em `docs/runbooks/deployment.md`.
- Nunca faça deploy de produção a partir de máquina local como parte do fluxo
  normal. Nunca acesse a VPS sem autorização explícita do usuário.

## Rollback

Portal: republicar a versão anterior. Migration aditiva: reverter o portal
basta. Migration destrutiva: restaurar backup — nunca automaticamente, sem
avaliar perda de dados (`docs/runbooks/rollback.md`).
