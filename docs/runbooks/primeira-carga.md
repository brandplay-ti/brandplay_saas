# Runbook — Primeira carga do banco (homologação e produção)

Sintoma que traz alguém até aqui: **o portal subiu, mas o Supabase está
vazio.** O cadastro falha, ou funciona e as telas aparecem em branco.

É esperado. O build do portal **não roda migrations**, e não deve: publicar o
portal é reversível, uma migration não é.

Homologação e produção são **serviços Compose do Dockploy**, cada um com sua
rede Docker, seus containers, sua senha e seu Studio, todos a partir do mesmo
`docker/supabase/docker-compose.yml`. Este runbook vale para os dois.

## O que cada ambiente recebe

| Etapa               | O que traz                                                                      |
| ------------------- | ------------------------------------------------------------------------------- |
| Migrations          | schema, enums, funções, RLS e policies, buckets do Storage, gatilhos            |
| Edge Functions      | já vêm na imagem do serviço `functions` — nada a carregar à mão                 |
| Dados (só no corte) | importação do Lovable — `docs/architecture/plano-migracao-dados-lovable-vps.md` |

## O que eles NUNCA recebem

**Nunca rode `supabase/seed/00-seed.sql` em homologação nem em produção.** Ele
cria um usuário com senha de desenvolvimento escrita neste repositório. Rodá-lo
num ambiente exposto publica uma conta com senha conhecida.

## Antes de tudo: espere o stack subir inteiro

**Confirme que TODOS os serviços estão saudáveis antes de aplicar migration.**

- **`storage.buckets`** — `0007_storage_buckets.sql` insere ali. A tabela é
  criada pelo serviço `storage` no bootstrap dele, não pela imagem do Postgres.
  Migrar antes falha na 0007 com `relation "storage.buckets" does not exist`.
- **`auth.users`** — `0003_tables.sql` cria FKs de várias tabelas
  (`profiles`, `organizations`, `organization_members`, ...) para
  `auth.users`. O GoTrue aplica as **próprias** migrations ao subir, e várias
  alteram essa tabela: FKs criadas antes de ele terminar o travam no meio. Nada
  reclama — só o cadastro falha, com `Database error finding user`. Foi o que
  custou um ambiente de homologação no central-check.

Confira antes:

```sql
select count(*) as migrations_gotrue from auth.schema_migrations;   -- esperado: 76
select to_regclass('storage.buckets') is not null as storage_pronto; -- esperado: true
```

## Caminho A — SQL Editor do Studio (sem SSH)

O Studio de cada ambiente responde em `https://api.<dominio>` atrás do basic
auth do dashboard. O editor não executa shell, então gere a versão achatada:

```bash
npm run supabase:bundle
```

Sai `supabase/bundle/01-migrations.sql` (derivado, fora do versionamento): as
migrations em ordem, cada uma na própria transação, com o mesmo registro de
versão que o `migrate.sh` grava. O arquivo tem guardas: aborta se o banco já
tiver migration aplicada, se o GoTrue não tiver terminado, ou se
`storage.buckets` não existir.

1. Abra o **SQL Editor** do ambiente. Confirme pela URL que é o ambiente
   certo — homologação e produção são fáceis de confundir.
2. Cole `01-migrations.sql` e execute.
3. Confira com a seção **Conferir**.

Banco já migrado, só com pendentes:
`node supabase/tools/gerar-bundle.mjs --desde <versao>` gera
`bundle/pendentes.sql`.

O editor conecta como `postgres`, que no Supabase não é superusuário. Se ele
recusar alguma migration por privilégio, use o Caminho B, que conecta como
`supabase_admin`.

## Caminho B — linha de comando na VPS

É o que o workflow do GitHub Actions usa. Os comandos não dependem do nome que
o Dockploy deu aos containers: usam um container efêmero com `psql`, na mesma
rede Docker do ambiente.

### Descobrir a rede e o container de cada ambiente

```bash
docker ps --format '{{.Names}}	{{.Networks}}' | grep -i -E 'brandplay.*db'
```

Cada ambiente aparece com a própria rede (o `COMPOSE_PROJECT_NAME` faz parte
do nome). Anote o par (container do Postgres, rede) de **cada um** e confira
duas vezes qual é qual.

### Um arquivo de ambiente para cada

```bash
sudo install -d -m 700 /etc/brandplay

sudo tee /etc/brandplay/homologacao.env >/dev/null <<'ENV'
DATABASE_URL=postgres://supabase_admin:SENHA_HML@CONTAINER_DB_HML:5432/postgres
SUPABASE_NETWORK=REDE_DO_SUPABASE_HML
VPS_APP_DIR=/opt/brandplay
ENV

sudo tee /etc/brandplay/producao.env >/dev/null <<'ENV'
DATABASE_URL=postgres://supabase_admin:SENHA_PRD@CONTAINER_DB_PRD:5432/postgres
SUPABASE_NETWORK=REDE_DO_SUPABASE_PRD
VPS_APP_DIR=/opt/brandplay
ENV

sudo chmod 600 /etc/brandplay/*.env
```

A senha é a `POSTGRES_PASSWORD` daquele ambiente no Dockploy. Ela fica na VPS
— não nos secrets do GitHub e nunca no repositório.

### Clone do repositório

É de onde saem `supabase/migrations` e `supabase/tools`. Um clone serve os dois
ambientes:

```bash
sudo git clone https://github.com/brandplay-ti/brandplay_saas.git /opt/brandplay
```

### Execução

```bash
AMBIENTE=homologacao   # ou: producao
set -a; . "/etc/brandplay/$AMBIENTE.env"; set +a; cd "$VPS_APP_DIR"
git fetch --all --prune && git checkout --detach origin/hml   # ou origin/main
echo "alvo: $AMBIENTE — rede $SUPABASE_NETWORK"
```

Confira o eco antes de continuar.

**1. Ver o que está pendente** (não altera nada):

```bash
docker run --rm --network "$SUPABASE_NETWORK" -v "$PWD/supabase:/supabase:ro" -e DATABASE_URL="$DATABASE_URL" postgres:17-alpine sh /supabase/tools/migrate.sh --status
```

**2. Backup** — `docs/runbooks/backup.md` (num banco novo e vazio, pode
pular).

**3. Aplicar:**

```bash
docker run --rm --network "$SUPABASE_NETWORK" -v "$PWD/supabase:/supabase:ro" -e DATABASE_URL="$DATABASE_URL" -e LOCK_TIMEOUT=5s -e STATEMENT_TIMEOUT=5min postgres:17-alpine sh /supabase/tools/migrate.sh
```

## Conferir

```sql
select count(*) || ' migrations' from migrations.schema_migrations;

select count(*) filter (where c.relrowsecurity) || ' de ' || count(*) || ' tabelas com RLS'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

select count(*) || ' policies' from pg_policies where schemaname = 'public';

select count(*) || ' buckets' from storage.buckets;

select 'ORGANIZACOES (0 num banco novo) ' || count(*) from public.organizations;
```

O número de migrations deve ser o de arquivos em `supabase/migrations/`.
**Toda tabela de `public` deve ter RLS.** Organizações diferente de zero num
banco que não recebeu importação significa que dado de teste entrou: pare e
investigue.

E, de fora:

```bash
npm run supabase:checar -- https://api.<dominio> <ANON_KEY> --portal https://<dominio>
```

## Depois da carga

1. **Crie o primeiro usuário pela aplicação**, pelo cadastro do portal —
   nunca por SQL. O gatilho `handle_new_user` cria `profile`, a organização e
   a linha de `organization_members` com papel `owner` de forma consistente.
2. **Backup inicial**, já com o schema, antes do primeiro dado real.
3. No corte do Lovable: importação dos dados reais seguindo
   `docs/architecture/plano-migracao-dados-lovable-vps.md` (seção 3), com
   ensaio em homologação antes.

## Edge Functions

Sintoma: toda função responde 500 com
`could not find an appropriate entrypoint` — inclusive um nome inventado.

O container está no ar, mas sem as funções. Elas são **assadas na imagem** do
serviço `functions` por `docker/supabase/functions.Dockerfile`
(`pull_policy: build`); nos hospedados não há mount. Confira:

- o deploy do serviço do Supabase rodou depois do último commit em
  `supabase/functions/` (watch em `supabase/**` e autodeploy ligado);
- o healthcheck do `functions` está verde — ele chama `/saude`;
- `curl -fsS https://api.<dominio>/functions/v1/saude` responde
  `{"status":"ok"}`.

Primeira chamada de cada função lenta ou com timeout costuma ser download dos
módulos remotos (`esm.sh`/`deno.land`); o volume `deno-cache` guarda entre
reinícios. O container precisa de saída para a internet.

As funções leem segredos do ambiente do serviço:

| Variável            | Sem ela                                       |
| ------------------- | --------------------------------------------- |
| `ANTHROPIC_API_KEY` | toda funcionalidade de IA falha               |
| `RESEND_API_KEY`    | convites e notificações por e-mail não saem   |
| `APP_URL`           | links dos e-mails apontam para o lugar errado |
| `SERVICE_ROLE_KEY`  | operações privilegiadas falham                |

## Os e-mails de autenticação e o `SITE_URL`

Sintoma: o cadastro conclui, o e-mail chega, e o link aponta para
`http://localhost:8080`.

O link é montado pelo GoTrue a partir do `SITE_URL` do serviço. O cadastro
passa `emailRedirectTo` (`/onboarding/organizacao`), e um destino fora de
`ADDITIONAL_REDIRECT_URLS` é **descartado em silêncio** — o GoTrue usa o
`SITE_URL` no lugar. Ajuste os dois no serviço do Supabase daquele ambiente
(tabela em `docs/architecture/deployment.md`). O passo 7 do `supabase:checar`
sonda exatamente isso.

## Se o portal não conecta

1. **Console do navegador.** Tela branca com erro de URL/chave do Supabase:
   build sem os build arguments — ver `docs/architecture/deployment.md`.
2. **"CORS error" no navegador quase nunca é CORS.** Olhe a URL da requisição:
   se não é o domínio esperado, o problema é o valor embutido no bundle. O
   passo 0 do `supabase:checar --portal` aponta isso.
3. **`404 page not found` em qualquer caminho** é do Traefik, não do Kong: o
   domínio não está ligado ao serviço `kong` porta `8000`, ou o stack não está
   rodando.
4. **Trocar a variável no Dockploy não muda o portal publicado** — exige
   rebuild.
