# BrandPlay

**BrandPlay — Transformando patrocínio em resultado.** SaaS de gestão de
patrocínio esportivo de ponta a ponta: propriedades e ativos patrocináveis,
pipeline comercial, propostas, contratos, entregas, financeiro, relatórios de
performance e um portal exclusivo para o patrocinador.

O projeto nasceu no Lovable e roda em arquitetura própria — Supabase
self-hosted e VPS com Dockploy —, no mesmo padrão do central-check
([ADR-0001](docs/adr/0001-sair-do-lovable-cloud.md),
[ADR-0006](docs/adr/0006-padrao-de-infraestrutura-vps.md)).

Monorepo:

```
.claude/    regras e skills do Claude Code
docker/     compose único do Supabase (local, homologação e produção)
docs/       ADRs, arquitetura, infraestrutura, runbooks
portal/     aplicação React (workspace npm)
supabase/   migrations, seed, testes, edge functions, tools
```

## Pré-requisitos

- **Node 26** e npm (`.nvmrc`)
- **Docker Desktop** em execução
- Portas livres: `8080`, `8010`, `8026`, `6380`, `54324`, `54325` — o bloco
  próprio do BrandPlay, que convive com o stack do central-check

## Subindo o ambiente

```bash
npm install
cp docker/supabase/.env.example docker/supabase/.env
npm run supabase:chaves   # gere os segredos e cole no .env
npm run supabase:up
npm run supabase:migrate
npm run supabase:seed
```

`supabase:migrate` e `supabase:seed` rodam **depois** do stack no ar: o schema
`auth` só existe quando o GoTrue aplica as próprias migrations. Se a
`0007_storage_buckets.sql` falhar num volume novo, rode `supabase:migrate` de
novo — o `storage` ainda estava criando o schema dele.

Aponte o portal para o Supabase local criando `portal/.env.local` a partir de
`portal/.env.example`:

```
VITE_PUBLIC_SUPABASE_URL="http://localhost:8010"
VITE_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY de docker/supabase/.env>"
```

E rode o portal:

```bash
npm run dev
```

`npm run dev` recusa subir apontando para um Supabase que não seja local.

## Portas e endereços

| Serviço             | URL                    | Para quê                                        |
| ------------------- | ---------------------- | ----------------------------------------------- |
| **Portal**          | http://localhost:8080  | A aplicação                                     |
| **API Gateway**     | http://localhost:8010  | REST, Auth, Storage, Realtime e Edge Functions  |
| **Supabase Studio** | http://localhost:54325 | Inspecionar tabelas, rodar SQL                  |
| **Mailpit**         | http://localhost:8026  | Caixa de entrada local: confirmação de cadastro |
| **PostgreSQL**      | `localhost:54324`      | `postgres://postgres:<POSTGRES_PASSWORD>@...`   |
| **Redis**           | `localhost:6380`       | Cache                                           |

## Usuário de exemplo

| E-mail                  | Senha           | Organização                    |
| ----------------------- | --------------- | ------------------------------ |
| `owner@brandplay.local` | `brandplay-dev` | BrandPlay Demo (papel `owner`) |

Senha pública, válida só no ambiente local.

## Comandos

### Portal

| Comando              | O que faz                                                    |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | Sobe o portal em http://localhost:8080                       |
| `npm run build`      | Build de produção                                            |
| `npm run lint`       | ESLint                                                       |
| `npm run type-check` | TypeScript                                                   |
| `npm test`           | Testes unitários (Vitest)                                    |
| `npm run test:e2e`   | Testes E2E (Playwright — `npx playwright install` na 1ª vez) |

### Infraestrutura e banco

| Comando                           | O que faz                                              |
| --------------------------------- | ------------------------------------------------------ |
| `npm run supabase:chaves`         | Gera os segredos do ambiente local                     |
| `npm run supabase:chave-de-papel` | Confere ANON/SERVICE_ROLE de um `JWT_SECRET` existente |
| `npm run supabase:checar`         | Diagnostica um Supabase remoto, camada por camada      |
| `npm run supabase:up`             | Sobe o stack                                           |
| `npm run supabase:down`           | Derruba, preservando os volumes                        |
| `npm run supabase:reset`          | Derruba **e apaga os dados**                           |
| `npm run supabase:logs`           | Acompanha os logs                                      |
| `npm run supabase:migrate`        | Aplica as migrations pendentes                         |
| `npm run supabase:migrate:status` | Lista aplicadas e pendentes                            |
| `npm run supabase:seed`           | Usuário e organização de exemplo                       |
| `npm run supabase:test`           | Testes de banco (RLS)                                  |
| `npm run supabase:bundle`         | Migrations achatadas para o SQL Editor do Studio       |

#### Ciclo limpo

O que o CI faz, e o que garante que nada depende de ajuste manual no banco:

```bash
npm run supabase:reset && npm run supabase:up && npm run supabase:migrate && npm run supabase:seed && npm run supabase:test
```

## Homologação e produção

- Como os ambientes estão montados no Dockploy:
  [`docs/architecture/deployment.md`](docs/architecture/deployment.md)
- Instanciar um ambiente:
  [`docs/runbooks/provisionar-ambiente.md`](docs/runbooks/provisionar-ambiente.md)
- Carregar o banco: [`docs/runbooks/primeira-carga.md`](docs/runbooks/primeira-carga.md)
- Pipeline: [`docs/infrastructure/cicd.md`](docs/infrastructure/cicd.md)
- Migração dos dados do Lovable:
  [`docs/architecture/plano-migracao-dados-lovable-vps.md`](docs/architecture/plano-migracao-dados-lovable-vps.md)
- Padrão para projetos novos:
  [`docs/infrastructure/padrao-de-projeto.md`](docs/infrastructure/padrao-de-projeto.md)

## Segredos

`docker/supabase/.env` e `portal/.env.local` **não são versionados** — o
`.gitignore` recusa qualquer `.env*` que não seja `.example`. Chaves de
Anthropic e Resend ficam nesse arquivo no ambiente local e no **Dockploy** nos
hospedados — nunca no repositório.
