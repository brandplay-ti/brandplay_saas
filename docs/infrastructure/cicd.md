# CI/CD

Cenário: uma VPS com **Dockploy** hospeda o stack do Supabase e o portal, no
mesmo projeto, atrás do Traefik — um par de serviços por ambiente. O
repositório é um monorepo (`portal/`, `supabase/`, `docker/`, `docs/`).

**A configuração de containers e serviços nos ambientes hospedados é feita no
Dockploy**, não neste repositório: variáveis, segredos, domínios, TLS, volumes
e limites de recurso. O pipeline cobre duas coisas — validar o que vai subir
(CI) e disparar/conferir a publicação (CD) — enquanto o ciclo de vida dos
containers é do Dockploy.

## Princípio

O deploy do portal é reversível: basta publicar a versão anterior. **Uma
migration não é.** Por isso os dois têm cadências diferentes:

|          | Portal                     | Migrations                                  |
| -------- | -------------------------- | ------------------------------------------- |
| Gatilho  | push na branch do ambiente | manual, homologação primeiro                |
| Reversão | republicar versão anterior | restaurar backup ou migration compensatória |
| Portão   | CI verde                   | CI verde + revisor + backup verificado      |

## Branches

```
feature/* ──PR──▶ dev ──PR──▶ hml ──PR──▶ main
                               │            │
                     homologação     produção
```

- `dev` é a branch padrão e o alvo dos PRs de feature. Nada publica a partir
  dela.
- `hml` publica homologação (serviços `*-hml` no Dockploy, watch + autodeploy).
- `main` publica produção (serviços `*-producao`).

## CI (`.github/workflows/ci.yml`)

Roda em todo PR e em push para `dev`, `hml` e `main`.

**Job `portal`**: `npm ci` → lint → `type-check` → `test` → `build`, no
workspace `portal`.

**Job `migrations`**:

1. **Guarda contra destruição** — migration com `drop table/schema/column` ou
   `truncate` só passa se a primeira linha declarar
   `-- destrutivo: aprovado por <nome> em <data>`.
2. **Banco limpo** — sobe o mesmo `docker/supabase/docker-compose.yml` dos
   ambientes hospedados, com segredos descartáveis
   (`gerar-chaves-locais.mjs --env`), espera `db`, `auth` e `storage`
   saudáveis e aplica todas as migrations com `migrate.sh`.
3. **Idempotência** — roda o runner de novo e exige "nenhuma migration
   pendente".
4. **Seed + testes de segurança** — `supabase:seed` exercita os gatilhos de
   cadastro (`handle_new_user`) e `supabase:test` roda
   `supabase/tests/seguranca.sql` (RLS para `anon`).

O que o CI **não** cobre hoje: testes E2E (dependem do stack completo e de
dados) e isolamento entre organizações com usuários reais (roteiro comentado em
`seguranca.sql`).

### Dívida conhecida

- **Lint não bloqueante.** O código herdado do Lovable chega com ~250 erros de
  ESLint, quase todos `@typescript-eslint/no-explicit-any`. O passo roda com
  `continue-on-error` para o número ficar visível; quando zerar, remova a
  flag. Código novo não deve aumentar a contagem.
- **Prettier fora do CI.** `.prettierrc.json` é o mesmo do central-check, mas
  `portal/src` ainda não foi formatado. Formatar é um PR próprio, só de
  formatação (`npm run format`), sem mudança funcional — depois disso, entra
  o passo `npm run format:check`, como no central-check.

## CD (`.github/workflows/deploy.yml`)

**O pipeline não toca no banco.** Migrations são aplicadas à mão; o workflow
cuida da aplicação e apenas **relata** o que está pendente.

`workflow_dispatch` com `ambiente` (`homologacao` ou `producao`). Cada um é um
_environment_ do GitHub; configure `producao` com _required reviewers_.
Sequência:

1. atualiza o clone do repositório na VPS para o commit disparado (é dele que
   saem `supabase/migrations` e `supabase/tools` para migrar à mão);
2. lista as migrations pendentes (`migrate.sh --status`) — somente leitura;
3. dispara o redeploy do portal no Dockploy (webhook do serviço);
4. health check com retry — se falhar, o job falha.

Há o modo `apenas_status`: para no passo 2.

### Como o workflow alcança o banco

Os nomes de container e de rede são definidos pelo Dockploy, então os passos
de banco usam um **container efêmero** com `psql`, ligado à rede Docker do
ambiente, com `supabase/` do clone montado. Isso exige, na VPS, um arquivo por
ambiente (modo `600`):

```
/etc/brandplay/homologacao.env
/etc/brandplay/producao.env
```

com `DATABASE_URL`, `SUPABASE_NETWORK` e `VPS_APP_DIR`. Arquivos separados, e
não um só com prefixos: apontar homologação para o banco de produção por erro
de variável é o acidente que o desenho torna impossível. O DSN fica **na VPS**,
não nos secrets do GitHub. Passo a passo em `docs/runbooks/primeira-carga.md`.

Secrets do repositório: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. Secrets de cada
environment: `DOCKPLOY_DEPLOY_WEBHOOK` e `APP_HEALTH_URL`.

Os segredos de runtime (`SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`RESEND_API_KEY`, ...) **não** entram no GitHub Actions: vivem no Dockploy.

## Runner de migrations

`supabase/tools/migrate.sh` — local, CI e hospedados usam o mesmo script:

```bash
DATABASE_URL=postgres://... sh supabase/tools/migrate.sh --status
DATABASE_URL=postgres://... sh supabase/tools/migrate.sh
```

Garantias:

- cada migration roda em **uma transação junto com o registro da versão**;
- `pg_advisory_xact_lock` serializa deploys concorrentes;
- `lock_timeout` (5s) impede que a migration fique presa atrás de uma
  transação longa, levando a aplicação junto;
- `statement_timeout` (5min) limita o estrago de uma migration pesada;
- versão já aplicada nunca roda de novo; o checksum fica gravado em
  `migrations.schema_migrations` (schema próprio, fora do PostgREST).

Sem SSH, `npm run supabase:bundle` gera as migrations achatadas para colar no
SQL Editor do Studio, com os mesmos checksums — depois disso o runner
reconhece tudo como aplicado.

**Homologação primeiro, sempre.**

## Escrevendo migrations seguras

- **Expand/contract.** Primeiro adicione (coluna nova nullable, tabela nova,
  backfill); só remova depois que a aplicação parar de usar o formato antigo.
- **Nome imutável.** Migration aplicada em qualquer ambiente não se edita:
  corrija com uma nova.
- **Índice em tabela grande:** `create index concurrently`, que não roda em
  transação — trate fora do runner.
- **Backfill grande em lotes**, fora da migration de schema.
- Toda migration que mexe em tabela com `organization_id` revê a RLS junto
  (`CLAUDE.md`, seção 6).

## Rollback

1. **Portal:** republicar a versão anterior no Dockploy.
2. **Migration aditiva:** normalmente basta reverter o portal.
3. **Migration destrutiva:** restaurar o dump tirado antes de migrar
   (`docs/runbooks/backup.md`). Perde-se o que foi escrito depois do backup.
