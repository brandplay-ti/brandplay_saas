# Supabase self-hosted (local, homologação e produção)

Stack Docker do Supabase self-hosted, alinhado ao
[ADR-0001](../../docs/adr/0001-sair-do-lovable-cloud.md). Substitui o Supabase
remoto do Lovable Cloud. É o **mesmo** compose nos três ambientes — o padrão
herdado do central-check, descrito em
[`docs/infrastructure/padrao-de-projeto.md`](../../docs/infrastructure/padrao-de-projeto.md).

## Subir o ambiente

```bash
cp docker/supabase/.env.example docker/supabase/.env
npm run supabase:chaves      # gera JWT_SECRET/ANON_KEY/SERVICE_ROLE_KEY etc. — cole no .env
npm run supabase:up
npm run supabase:migrate
npm run supabase:seed        # cria organização + usuário de teste
```

`supabase:up` sobe os containers, `supabase:migrate` aplica as migrations
pendentes de `supabase/migrations/` e `supabase:seed` cria 1 organização + 1
usuário owner (`supabase/seed/00-seed.sql`, idempotente). Os dois últimos rodam
**depois** do stack no ar: o schema `auth` só existe quando o GoTrue aplica as
próprias migrations.

Em um volume novo (primeiro `up`, ou depois de `supabase:reset`), o serviço
`storage` ainda está criando o próprio schema (`storage.buckets`,
`storage.objects`) nos primeiros segundos depois de "healthy". Se
`supabase:migrate` rodar nesse intervalo, a migration que cria os buckets
(`0007_storage_buckets.sql`) falha com `relation "storage.buckets" does not
exist` — rode `npm run supabase:migrate` de novo (`migrate.sh` só aplica o que
falta, então repetir é seguro).

`supabase:seed` é **exclusivamente local**: a senha do usuário de exemplo está
escrita no repositório. Homologação e produção recebem só migrations e, no
corte, os dados reais importados do Lovable — ver
`docs/runbooks/primeira-carga.md`.

### Usuário de exemplo

| E-mail                  | Senha           | Organização                    |
| ----------------------- | --------------- | ------------------------------ |
| `owner@brandplay.local` | `brandplay-dev` | BrandPlay Demo (papel `owner`) |

`npm run supabase:migrate:status` lista o que já foi aplicado e o que está
pendente. O runner é o mesmo usado em CI e nos ambientes hospedados.

Para recomeçar do zero (apaga volumes e dados locais):

```bash
npm run supabase:reset
```

## Endpoints

As portas são o **bloco próprio** do BrandPlay (`*_PORT_HOST` no `.env`), para
este stack subir junto com o do central-check na mesma máquina.

| Serviço                                                | URL                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Portal (Vite)                                          | http://localhost:8080                                              |
| API Gateway (REST, Auth, Storage, Realtime, Functions) | http://localhost:8010                                              |
| Studio                                                 | http://localhost:54325                                             |
| Postgres                                               | `postgres://postgres:<POSTGRES_PASSWORD>@localhost:54324/postgres` |
| Caixa de e-mail (Mailpit)                              | http://localhost:8026                                              |
| Redis                                                  | `localhost:6380`                                                   |

## Frontend

Crie `portal/.env.local` a partir de `portal/.env.example` (tem precedência
sobre o `.env` no Vite e não é versionado):

```
VITE_PUBLIC_SUPABASE_URL="http://localhost:8010"
VITE_PUBLIC_SUPABASE_ANON_KEY="<ANON_KEY do docker/supabase/.env>"
```

`npm run dev` **recusa** subir apontando para um Supabase que não seja
`localhost` (guarda em `portal/vite.config.ts`): desenvolvimento roda contra o
stack local, nunca contra o Lovable Cloud nem contra homologação.

## Estrutura

```
docker/supabase/
  docker-compose.yml       stack completo — o MESMO em local, homologação e produção
  docker-compose.local.yml override de desenvolvimento (portas, Mailpit, mounts)
  functions.Dockerfile     imagem do edge-runtime com as funções assadas
  .env.example             contrato das variáveis

docker/files/volumes/      arquivos montados nos containers (boilerplate do
                           upstream supabase/supabase, ver docker/files/volumes/README.md)
  api/                     kong.yml e kong-entrypoint.sh
  db/                      bootstrap do Postgres (roles, jwt, realtime, webhooks, ...)
  pooler/                  pooler.exs do supavisor

supabase/                  montado em /supabase no container do banco (só no local)
  migrations/              fonte única do schema (ver SCHEMA_NOTES.md)
  lovable-migrations/      migrations originais do Lovable — referência, não aplicadas
  seed/                    usuário e organização de exemplo (só local)
  tests/                   testes de segurança (seguranca.sql)
  tools/                   migrate.sh, chaves, checar-supabase, bundle, migração do Lovable
  functions/               edge functions, assadas na imagem do edge-runtime
    main/                  roteador de /functions/v1/<nome>
    saude/                 canário do healthcheck do container
```

## Um compose para os três ambientes

`docker-compose.yml` é a fonte única: é o que sobe localmente e o que o
Dockploy consome em homologação e produção. O que distingue um ambiente do
outro é o `.env` (no Dockploy, as variáveis do serviço), e nada mais.

`docker-compose.local.yml` acrescenta **só** o que não existe num ambiente
hospedado: portas publicadas, Mailpit, o mount de `supabase/` no `db` e o de
`supabase/functions` no `functions` e no `studio`. Ele nunca troca imagem,
versão ou variável que mude comportamento.

O nome dele não é `docker-compose.override.yml` de propósito: aquele é
carregado automaticamente por qualquer `docker compose up` no diretório,
inclusive o do Dockploy, e vazaria configuração local para produção.

## Edge Functions: imagem nos hospedados, bind aqui

O serviço `functions` **constrói** a própria imagem
(`docker/supabase/functions.Dockerfile`), que copia `supabase/functions` para
dentro dela. Localmente o override monta a pasta por cima, então editar uma
função tem efeito sem rebuild. Em homologação e produção não existe mount
nenhum: roda o que foi assado no deploy.

O healthcheck do container chama `/saude`, uma função de verdade despachada
pelo `main` — um `main` respondendo não prova que as funções estão
alcançáveis. O porquê completo está em `functions.Dockerfile` e em
`docs/architecture/deployment.md`.

Se o cache do build atrapalhar, rebuilde explicitamente:

```bash
docker compose --env-file docker/supabase/.env -f docker/supabase/docker-compose.yml -f docker/supabase/docker-compose.local.yml build --no-cache functions
```

## O Dockploy observa `docker/` e `supabase/`

O serviço do Supabase de cada ambiente hospedado fica com **watch** nessas
pastas. Qualquer alteração que chegue na branch daquele ambiente dispara
redeploy do stack sozinha.

Ou seja: **mexer em `docker/` é uma ação, não só um diff.** Editar o compose, o
`kong.yml` ou um SQL de init reinicia o stack. O que isso implica:

- os bind mounts de `../files/volumes/` são atualizados a cada deploy — é o
  objetivo: configuração e código seguem o repositório;
- **dado não pode morar ali**, porque o diretório da aplicação é refeito.
  Banco, arquivos do Storage e snippets do Studio são volumes nomeados;
- os SQL de init só rodam **na criação do volume** — editá-los não muda um
  ambiente existente;
- commit em `supabase/migrations/` também redeploya o stack, mas **não aplica
  migration nenhuma**: aplicar é o procedimento manual de
  `docs/runbooks/primeira-carga.md`.

## Segredos

```bash
npm run supabase:chaves
```

`ANON_KEY` e `SERVICE_ROLE_KEY` são JWTs assinados com o `JWT_SECRET`: trocar
um sem regerar os outros produz um stack em que nada autentica. O comando gera
o conjunto coerente, e existe para remover o incentivo de copiar as chaves de
homologação para cá. Trocar `POSTGRES_PASSWORD` depois do primeiro `up` exige
`npm run supabase:reset`.

Para conferir se as chaves de um ambiente hospedado batem com o `JWT_SECRET`
dele (sem gerar segredo novo):

```bash
JWT_SECRET=<segredo-do-ambiente> npm run supabase:chave-de-papel
```

`RESEND_API_KEY` e `ANTHROPIC_API_KEY` ficam vazios até você colar chaves de
**teste**. Nunca use chaves de produção aqui. Em homologação e produção nenhum
desses valores vem de arquivo do repositório: são configurados no Dockploy
(`docs/architecture/deployment.md`).

## Segurança

- `docker/supabase/.env` e `portal/.env.local` não são versionados (o
  `.gitignore` recusa qualquer `.env*` exceto `.env.example`).
- RLS é obrigatório em toda tabela de tenant (`organization_id`) — ver
  `supabase/migrations/0005_rls_policies.sql` e `SECURITY.md`.
- `SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `ANTHROPIC_API_KEY` só podem ser
  usados no servidor e nas Edge Functions, nunca no client (nada com prefixo
  `VITE_`).
- Este stack local é de desenvolvimento: sem TLS, sem backup e com senhas
  conhecidas. Os ambientes hospedados seguem `docs/infrastructure/production.md`.
