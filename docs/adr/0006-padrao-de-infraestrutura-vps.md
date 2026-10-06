# ADR-0006: Padrão de infraestrutura da VPS (Dockploy + monorepo do central-check)

Status: Accepted

## Contexto

A ADR-0001 decidiu sair do Lovable Cloud para Supabase self-hosted numa VPS
própria, mas deixou em aberto a ferramenta de deploy e o desenho dos ambientes
hospedados (`docs/architecture/plano-migracao-dados-lovable-vps.md`, decisão
M4). O repositório ainda tinha o formato do Lovable: frontend na raiz, sem
build para container, sem workflow de deploy e com um `.env` de segredos
locais versionado.

O projeto `central-check` já roda nesse arranjo — VPS única com Dockploy atrás
de Traefik, Supabase self-hosted e portal no mesmo projeto, homologação e
produção como serviços separados. Vários dos detalhes desse desenho foram
pagos com incidentes (banco apagado por bind mount num redeploy, Edge
Functions servindo 500 com container saudável, Node errado no Nixpacks, bundle
publicado com string vazia), e cada um virou uma guarda versionada.

## Decisão

Adotar no BrandPlay **o mesmo padrão do central-check**, sem variações locais:

- **Monorepo npm com workspace `portal/`** para o frontend; `supabase/`,
  `docker/`, `docs/` e `.claude/` na raiz. Comandos sempre a partir da raiz.
- **Um único `docker/supabase/docker-compose.yml`** para local, homologação e
  produção, distinguidos só pelas variáveis de ambiente.
  `docker-compose.local.yml` acrescenta apenas portas, Mailpit e mounts.
- **Dockploy na VPS**, com um projeto contendo, por ambiente, um serviço
  Compose do Supabase (watch em `docker/**` e `supabase/**`) e uma aplicação
  do portal (pasta base `/portal`, `Dockerfile` ou Nixpacks). Configuração de
  produção — segredos, domínios, TLS, volumes — vive no Dockploy, nunca no
  repositório.
- **Branches**: `dev` é a branch padrão e alvo dos PRs de feature; `hml`
  publica homologação; `main` publica produção. Promoção sempre
  `dev` → `hml` → `main`, por PR.
- **Edge Functions assadas na imagem** (`functions.Dockerfile`), com
  healthcheck que exercita a função `saude`.
- **Migrations fora do pipeline**: aplicadas à mão com `migrate.sh` (ou pelo
  bundle no SQL Editor), homologação primeiro; o workflow de deploy só lista o
  que está pendente.
- **Bloco de portas próprio no ambiente local** (Kong 8010, Studio 54325,
  Postgres 54324, Redis 6380, Mailpit 8026, portal 8080), para conviver com o
  stack do central-check na mesma máquina.

O padrão foi extraído para
[`docs/infrastructure/padrao-de-projeto.md`](../infrastructure/padrao-de-projeto.md),
para que projetos novos já nasçam nele.

## Consequências

Positivas:

- As guardas que o central-check aprendeu na prática chegam prontas: nenhuma
  daquelas falhas precisa acontecer de novo aqui.
- Quem opera um projeto opera o outro: mesmos comandos, mesmos runbooks, mesma
  forma no Dockploy.
- `docker/supabase/.env` saiu do versionamento, e o `.gitignore` agora recusa
  qualquer `.env*` que não seja `.example`.

Negativas:

- O build do portal no Dockploy usa `npm install` sem lockfile (o lock é do
  workspace e fica fora do contexto `/portal`) — risco aceito, herdado, com a
  correção documentada em `docs/architecture/deployment.md`.
- Mover o frontend para `portal/` mexe no caminho de todos os arquivos de
  `src/`: PRs abertos contra o layout antigo precisam de rebase.
- O primeiro commit do repositório ainda contém o `docker/supabase/.env` local
  no histórico. Os segredos dele são só de desenvolvimento, mas devem ser
  regenerados (`npm run supabase:chaves`) e nunca reaproveitados.

## Relacionadas

- ADR-0001 (sair do Lovable Cloud)
- `docs/architecture/deployment.md`
- `docs/infrastructure/cicd.md`
- `docs/runbooks/primeira-carga.md`
