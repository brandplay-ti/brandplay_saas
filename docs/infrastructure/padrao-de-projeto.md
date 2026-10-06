# Padrão de projeto — SaaS com Supabase self-hosted na VPS (Dockploy)

Instruções para **iniciar um projeto novo** (ou migrar um vindo do Lovable)
já no padrão usado pelo `central-check` e pelo `brandplay`. Escrito para ser
seguido por uma pessoa ou pelo Claude Code: copie este arquivo para o projeto
novo, ou peça "inicie este projeto seguindo `padrao-de-projeto.md`".

Projetos de referência (copie deles, não reescreva):

| Projeto       | Caminho local                        | Observação                                       |
| ------------- | ------------------------------------ | ------------------------------------------------ |
| central-check | `C:\Projetos\central-check\v2`       | origem do padrão; em produção                    |
| brandplay     | `C:\Projetos\jiatech\brandplay-saas` | segunda aplicação; migrado do Lovable (ADR-0006) |

Cada regra abaixo foi paga com um incidente real. O porquê de cada uma está
comentado nos próprios arquivos de referência — leia o comentário antes de
"simplificar" qualquer coisa.

---

## 1. Arquitetura alvo

```
                 Internet
                    │ DNS (domínio próprio — nunca o sslip.io do Dockploy)
                    ▼
          Traefik (Dockploy, TLS)
           │                   │
   <dominio> (portal)    api.<dominio> (kong:8000)
           │                   │
  portal: serve -s dist   Supabase self-hosted (1 compose)
  (Dockerfile, Node 26)   kong · auth · rest · realtime · storage · imgproxy
                          meta · functions · supavisor · studio · redis · db
```

- Uma VPS, um projeto por produto no Dockploy, **dois serviços por
  ambiente** (Supabase Compose + portal Application).
- Ambientes: **local** (Docker Desktop), **homologação** (branch `hml`) e
  **produção** (branch `main`). `dev` é a branch padrão de integração.
- O **mesmo** `docker-compose.yml` nos três ambientes; só o `.env` muda.

## 2. Estrutura do repositório

```
.claude/                      regras e skills do Claude Code
  settings.json               nega leitura de .env, chaves e exportações
  launch.json                 preview do portal no Claude Code
  rules/                      architecture, cicd, frontend, git, security, supabase, testing
  skill/                      database, review
.github/workflows/
  ci.yml                      portal (lint/types/test/build) + migrations em banco limpo
  deploy.yml                  manual: atualiza clone na VPS, lista migrations, webhook, health
docker/
  supabase/
    docker-compose.yml        stack completo — o MESMO em local, hml e produção
    docker-compose.local.yml  só portas, Mailpit e mounts (NUNCA "override.yml")
    functions.Dockerfile      edge-runtime com as funções assadas na imagem
    .env.example              contrato das variáveis do stack
    README.md
  files/volumes/              kong.yml, SQL de init, pooler.exs (upstream fixado num commit)
docs/
  adr/                        decisões (NNNN-titulo.md)
  architecture/deployment.md  topologia no Dockploy, variáveis por ambiente, build do portal
  infrastructure/             cicd, docker, production, networking, backup, monitoring, este padrão
  runbooks/                   provisionar-ambiente, primeira-carga, deployment, backup, rollback, restore
portal/                       aplicação React (workspace npm)
  Dockerfile                  node:26-alpine, build + serve, usuário não-root, porta 3000
  nixpacks.toml               alternativa ao Dockerfile, com Node e archive fixados
  .dockerignore  .nvmrc  .env.example
  scripts/checar-build.mjs    recusa build sem/errado VITE_PUBLIC_SUPABASE_*
  scripts/checar-node.mjs     prebuild: recusa Node antigo com mensagem legível
  vite.config.ts              plugin que recusa `dev` contra Supabase remoto
  src/  public/  e2e/  ...
supabase/
  migrations/                 0001_*.sql ... — fonte única do schema
  seed/00-seed.sql            SÓ LOCAL (senha pública)
  tests/                      testes SQL de RLS/segurança
  functions/
    main/index.ts             roteador do edge-runtime
    saude/index.ts            canário do healthcheck
    <funcao>/index.ts
  tools/
    migrate.sh                runner único (local, CI, hospedados)
    gerar-chaves-locais.mjs   JWT_SECRET + ANON/SERVICE_ROLE coerentes
    gerar-chave-de-papel.mjs  confere chaves de um JWT_SECRET existente
    gerar-bundle.mjs          migrations achatadas para o SQL Editor do Studio
    checar-supabase.mjs       diagnóstico de um ambiente, camada por camada
.env.example                  índice de onde cada variável vive (não é carregado)
.gitattributes                LF obrigatório (migrate.sh, SQL, checksums)
.gitignore                    recusa QUALQUER .env* exceto .env.example
.nvmrc .prettierrc.json .prettierignore
package.json                  raiz: workspaces ["portal"] + scripts supabase:*
CLAUDE.md  README.md  CONTRIBUTING.md  SECURITY.md
```

## 3. Bloco de portas local (um por projeto)

Cada projeto publica o stack local num **bloco de portas próprio**, para que
vários projetos subam juntos na mesma máquina. As portas vivem em
`docker/supabase/.env` (`*_PORT_HOST`) e são lidas só pelo
`docker-compose.local.yml`; o portal usa a porta do `vite.config.ts`.

| Projeto       | Portal | Kong (API) | Studio | Postgres | Redis | Mailpit |
| ------------- | ------ | ---------- | ------ | -------- | ----- | ------- |
| central-check | 3000   | 8000       | 54323  | 54322    | 6379  | 8025    |
| brandplay     | 8080   | 8010       | 54325  | 54324    | 6380  | 8026    |
| _próximo_     | 8090   | 8020       | 54327  | 54326    | 6381  | 8027    |

Ao criar um projeto, **reserve a próxima linha nesta tabela** (e atualize a
cópia deste arquivo nos outros projetos).

## 4. Invariantes — não negociáveis

1. **Um compose para três ambientes.** O override local nunca troca imagem,
   versão ou variável que mude comportamento. O nome é
   `docker-compose.local.yml`, nunca `docker-compose.override.yml` (o Dockploy
   carregaria sozinho).
2. **Dado em volume nomeado, configuração em bind mount.** O Dockploy refaz o
   clone a cada deploy: banco em bind mount é banco apagado.
3. **Edge Functions assadas na imagem** (`functions.Dockerfile`,
   `pull_policy: build`, sem `image:` fixo), com healthcheck que chama
   `/functions/v1/saude` — nunca só o `main`.
4. **`COMPOSE_PROJECT_NAME` único por ambiente** (`<projeto>-hml`,
   `<projeto>-producao`).
5. **Segredos gerados, nunca escolhidos nem reaproveitados.**
   `npm run supabase:chaves` produz o conjunto coerente; cada ambiente tem o
   seu; valor local nunca vai para hospedado e vice-versa.
6. **Nenhum `.env` versionado.** `.gitignore` com `.env`, `.env.*`,
   `!.env.example`. Segredos de hml/produção vivem no Dockploy; DSN de banco
   para automação vive em `/etc/<projeto>/<ambiente>.env` na VPS (modo 600).
7. **Variáveis do frontend com nome fixo:** `VITE_PUBLIC_SUPABASE_URL` e
   `VITE_PUBLIC_SUPABASE_ANON_KEY`, passadas ao Dockploy como **build
   arguments**. Nada secreto com prefixo `VITE_`.
8. **Build do portal com contexto `/portal`.** Tudo que o build lê fica em
   `portal/`. Node fixado no `Dockerfile`, `nixpacks.toml`, `.nvmrc`,
   `engines` e CI — o mesmo major em todos.
9. **Guardas que falham cedo:** `checar-build.mjs` (variáveis do build),
   `checar-node.mjs` (versão do Node), plugin do Vite que recusa `dev` contra
   Supabase remoto.
10. **Migrations fora do pipeline.** Aplicadas à mão com `migrate.sh` (ou
    bundle no Studio), homologação primeiro, backup antes. CI prova que
    aplicam em banco limpo e são idempotentes. Migration aplicada nunca é
    editada. Destrutiva exige `-- destrutivo: aprovado por <nome> em <data>`
    na primeira linha.
11. **Seed só local.** Ambiente hospedado nunca recebe arquivo com senha
    escrita no repositório.
12. **LF em tudo** (`.gitattributes`): CRLF quebra o `migrate.sh` dentro do
    container e muda o checksum das migrations.
13. **Domínio próprio** para portal e API; só o `kong` recebe domínio no stack.
14. **RLS em toda tabela de tenant**, testada em `supabase/tests/`.

## 5. Iniciar um projeto novo — passo a passo

### 5.1 Copiar o esqueleto

A partir do projeto de referência mais próximo (brandplay para app vindo do
Lovable, central-check para os demais), copie **como estão**:

```
docker/                                   (inteiro)
supabase/tools/{migrate.sh,gerar-chaves-locais.mjs,gerar-chave-de-papel.mjs,gerar-bundle.mjs,checar-supabase.mjs}
supabase/functions/{main,saude}/
portal/{Dockerfile,nixpacks.toml,.dockerignore,.nvmrc,.env.example}
portal/scripts/{checar-build.mjs,checar-node.mjs}
.github/workflows/{ci.yml,deploy.yml}
.claude/{settings.json,launch.json,rules/,skill/}
.gitattributes .gitignore .nvmrc .prettierrc.json .prettierignore .env.example
docs/architecture/deployment.md docs/infrastructure/ docs/runbooks/
```

### 5.2 Trocar o que é do projeto

Procure e substitua (`grep -rn -i "brandplay\|central-check"` deve zerar fora
de `docs/adr/` e deste arquivo):

| Onde                                             | O que trocar                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker/supabase/docker-compose.yml`             | padrão de `name: ${COMPOSE_PROJECT_NAME:-<projeto>-supabase}`                                                                                             |
| `docker/supabase/docker-compose.yml`             | bloco `environment` do `functions`: segredos das integrações do projeto                                                                                   |
| `docker/supabase/.env.example`                   | `COMPOSE_PROJECT_NAME`, `STUDIO_DEFAULT_*`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`, URLs locais, `*_PORT_HOST` (bloco da seção 3), segredos de integração |
| `supabase/tools/migrate.sh` e `gerar-bundle.mjs` | chave do advisory lock: `hashtext('<projeto>-migrations')` (os dois iguais)                                                                               |
| `supabase/tools/gerar-bundle.mjs`                | cabeçalhos; guardas de pré-requisito (GoTrue, `storage.buckets`); catálogos de configuração, se houver                                                    |
| `supabase/tools/checar-supabase.mjs`             | `TABELA_SONDA` (tabela legível por `anon`), `TABELAS_PRIVADAS` (tabelas de tenant), rota de retorno do cadastro no passo 7                                |
| `portal/vite.config.ts`                          | nome do plugin, porta do `server`, URL local na mensagem                                                                                                  |
| `portal/.env.example`                            | URL local (porta do Kong do bloco)                                                                                                                        |
| `.github/workflows/deploy.yml`                   | `/etc/<projeto>/`, `/opt/<projeto>`                                                                                                                       |
| `package.json` (raiz e `portal/`)                | `name`; scripts `supabase:test`/`supabase:seed` apontando para os arquivos do projeto                                                                     |
| `.claude/launch.json`                            | porta do portal                                                                                                                                           |
| `docs/`                                          | domínios, nomes de serviço, tabelas e contagens esperadas                                                                                                 |

### 5.3 Frontend no workspace

- Código React em `portal/` (`src/`, `public/`, `index.html`, configs do Vite,
  Tailwind, TS, ESLint, Vitest, Playwright; E2E em `portal/e2e/`).
- `portal/package.json`: `name: "portal"`, scripts `dev`, `prebuild`
  (`node scripts/checar-node.mjs`), `build`, `preview`, `start`
  (`serve -s dist`), `lint`, `type-check`, `test`, `test:e2e`; dependência
  `serve`; `engines.node: "26.x"`.
- Raiz `package.json`: `workspaces: ["portal"]`, scripts que delegam
  (`npm run <x> -w portal`) e os `supabase:*` (copie da referência).
- Cliente Supabase lendo `import.meta.env.VITE_PUBLIC_SUPABASE_URL` e
  `VITE_PUBLIC_SUPABASE_ANON_KEY`.
- `npm install` na raiz para gerar o `package-lock.json` do workspace. Um
  gerenciador só (npm): apague `bun.lock`/`bun.lockb`/`yarn.lock`.

### 5.4 Backend

- Schema em `supabase/migrations/NNNN_descricao.sql`, numeração sequencial.
- `supabase/seed/00-seed.sql` com usuário de exemplo **local** e idempotente.
- `supabase/tests/*.sql` para RLS, rodados por `npm run supabase:test`.
- Edge Functions em `supabase/functions/<nome>/index.ts`; segredos lidos de
  `Deno.env` e declarados no bloco `functions` do compose e no `.env.example`.

### 5.5 Subir local e validar

```bash
npm install
cp docker/supabase/.env.example docker/supabase/.env
npm run supabase:chaves            # cole a saída em docker/supabase/.env
npm run supabase:up
npm run supabase:migrate
npm run supabase:seed
cp portal/.env.example portal/.env.local   # ANON_KEY do docker/supabase/.env
npm run dev
npm run type-check && npm test && npm run build
npm run supabase:migrate           # deve dizer "nenhuma migration pendente"
npm run supabase:test
```

### 5.6 Ambientes hospedados

Siga `docs/runbooks/provisionar-ambiente.md` (homologação primeiro, depois
produção) e `docs/runbooks/primeira-carga.md`.

## 6. Vindo do Lovable — checklist extra

- [ ] Exportar o código atual do Lovable e importar numa branch (`sync/…`).
- [ ] Schema versionado em `supabase/migrations/` (o Lovable traz as próprias
      em `supabase/migrations/<timestamp>_<uuid>.sql`: guarde-as como
      referência em `supabase/lovable-migrations/` e escreva migrations
      numeradas, reconciliadas — ver ADR-0004/0005 do brandplay).
- [ ] Trocar o gateway de IA do Lovable (`LOVABLE_API_KEY`,
      `ai.gateway.lovable.dev`) pela API do provedor (no brandplay: Anthropic,
      `ANTHROPIC_API_KEY`).
- [ ] Remover `lovable-tagger` do `vite.config.ts`/`package.json` e scripts
      do Lovable do `index.html`.
- [ ] Renomear `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` para
      `VITE_PUBLIC_SUPABASE_URL`/`VITE_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Remover `supabase/config.toml` com o `project_id` do Lovable Cloud.
- [ ] Tirar do versionamento `.env` (o Lovable versiona) e qualquer
      `docker/supabase/.env`; regenerar os segredos que já estiveram em commit.
- [ ] Domínio `.lovable.app` → domínio próprio; links de e-mail via `APP_URL`.
- [ ] Migração de dados com ensaio em homologação (ferramentas em
      `supabase/tools/migracao-lovable/` do brandplay).

## 7. Claude Code

- `CLAUDE.md` com: objetivo, fontes de verdade, estrutura do monorepo, stack,
  princípios, processo obrigatório (antes/depois de editar), isolamento de
  tenant, segurança, Supabase, Git, CI/CD, produção, Definition of Done.
- `.claude/settings.json` negando leitura de `.env`, `.env.local`, chaves e
  exportações de dados.
- `.claude/rules/*.md` específicos do domínio do projeto (copie a estrutura,
  reescreva o conteúdo).
- Commits: `<tipo>(<escopo>): <descricao em portugues>`, tipos `feature`,
  `fix`, `refactor`, `chore`, `test`, `docs`, `perf`, `build`, `ci`,
  `security`.

## 8. Pronto para homologação quando

- [ ] `grep` da seção 5.2 sem resíduo do projeto de referência.
- [ ] `git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v example` vazio.
- [ ] Ciclo limpo local passa: `supabase:reset` → `up` → `migrate` (2x) →
      `seed` → `test`.
- [ ] `type-check`, `test` e `build` verdes; CI verde no PR.
- [ ] `docker build ./portal --build-arg VITE_PUBLIC_SUPABASE_URL=https://api.exemplo.com --build-arg VITE_PUBLIC_SUPABASE_ANON_KEY=x`
      constrói e a imagem responde 200 em `/` e numa rota profunda.
- [ ] Bloco de portas registrado na seção 3.
- [ ] ADR registrando a adoção do padrão.
