# Runbook — Provisionar homologação e produção no Dockploy

Passo a passo para instanciar um ambiente hospedado do BrandPlay na VPS. Faça
**homologação primeiro**, valide de ponta a ponta, e só então repita para
produção trocando os valores da coluna de produção.

O desenho e o porquê de cada regra estão em
`docs/architecture/deployment.md`. Este runbook é só a sequência.

## 0. Pré-requisitos

- VPS com Dockploy instalado (a mesma que já hospeda o central-check serve —
  cada projeto é um projeto separado no Dockploy).
- Acesso do Dockploy ao repositório `brandplay-ti/brandplay_saas` no GitHub.
- Branches `hml` e `main` existindo no repositório.
- DNS: registros `A` (ou `CNAME`) apontando para a VPS:

  | Ambiente    | Portal          | API (Kong)          |
  | ----------- | --------------- | ------------------- |
  | Homologação | `hml.<dominio>` | `api.hml.<dominio>` |
  | Produção    | `<dominio>`     | `api.<dominio>`     |

- Segredos **novos** para o ambiente, gerados na sua máquina:

  ```bash
  npm run supabase:chaves
  ```

  Guarde a saída num cofre (não em arquivo do repositório). Cada ambiente
  recebe o próprio conjunto — nunca reaproveite os de outro ambiente nem os
  locais.

## 1. Projeto no Dockploy

Crie (uma vez) o projeto `brandplay`. Os quatro serviços abaixo vivem nele.

## 2. Serviço do Supabase (Compose)

1. **Create Service → Compose**, nome `supabase-hml` (ou `supabase-producao`).
2. **Provider**: GitHub, repositório `brandplay_saas`, branch `hml` (ou
   `main`).
3. **Compose path**: `./docker/supabase/docker-compose.yml`.
   Não aponte para o `docker-compose.local.yml` — ele é só de desenvolvimento.
4. **Watch paths**: `docker/**` e `supabase/**`. **Autodeploy ligado** (é um
   toggle separado do trigger; desligado, o push passa em silêncio).
5. **Environment**: cole o conteúdo de `docker/supabase/.env.example` e
   preencha:
   - os segredos gerados no passo 0 (`POSTGRES_PASSWORD`, `JWT_SECRET`,
     `ANON_KEY`, `SERVICE_ROLE_KEY`, `*_ASYMMETRIC`, `SUPABASE_PUBLISHABLE_KEY`,
     `SUPABASE_SECRET_KEY`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE`,
     `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `REALTIME_DB_ENC_KEY`,
     `POOLER_TENANT_ID`);
   - os endereços e nomes da tabela "Variáveis por ambiente" em
     `docs/architecture/deployment.md` (`COMPOSE_PROJECT_NAME`,
     `SUPABASE_HOST`, `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL`, `SITE_URL`,
     `ADDITIONAL_REDIRECT_URLS`, `APP_URL`);
   - SMTP real com TLS (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
     `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME`) — o padrão `mail:1025` é o
     Mailpit, que não existe nos hospedados;
   - `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_DOMAIN`,
     `EMAIL_FROM` do ambiente.
6. **Domains**: `api.hml.<dominio>` → serviço `kong`, porta `8000`, HTTPS
   ligado (Let's Encrypt). Nenhum outro serviço do stack recebe domínio.
7. **Deploy**. Espere **todos** os serviços ficarem saudáveis — `functions`
   leva até ~1 min no primeiro boot (build da imagem + download de módulos).

Conferir de fora:

```bash
curl -sI https://api.hml.<dominio>/auth/v1/health      # Server: kong/…
curl -fsS https://api.hml.<dominio>/functions/v1/saude # {"status":"ok"}
```

## 3. Banco: migrations

O stack sobe com o banco **vazio**. Aplique as migrations seguindo
`docs/runbooks/primeira-carga.md` (pelo SQL Editor do Studio ou pela linha de
comando na VPS) e confira com a seção "Conferir" de lá.

## 4. Serviço do portal (Application)

1. **Create Service → Application**, nome `portal-hml` (ou
   `portal-producao`).
2. **Provider**: GitHub, mesmo repositório, branch `hml` (ou `main`).
3. **Build path / pasta base**: `/portal`. **Build type**: `Dockerfile`
   (`Dockerfile` na raiz da pasta base). Se usar Nixpacks, garanta que
   `NIXPACKS_NODE_VERSION` **não** esteja definida.
4. **Watch paths**: `portal/**`. Autodeploy ligado.
5. **Build arguments** (não variáveis de runtime — o Vite as embute no build):

   ```
   VITE_PUBLIC_SUPABASE_URL=https://api.hml.<dominio>
   VITE_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY deste ambiente>
   ```

   O build **para** com a explicação se faltar uma delas, se estiverem com o
   nome do Lovable/Studio (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`),
   sem `https://` ou apontando para `localhost`.

6. **Domains**: `hml.<dominio>` → porta `3000`, HTTPS ligado.
7. **Deploy**.

## 5. Conferir o ambiente inteiro

```bash
npm run supabase:checar -- https://api.hml.<dominio> <ANON_KEY> --portal https://hml.<dominio>
```

Ele sobe pela pilha (bundle publicado → domínio → chave → CORS → schema →
isolamento → Edge Functions → links dos e-mails) e para na primeira camada que
falhar, dizendo onde mexer. Só lê: pode rodar contra produção.

Depois, no navegador: cadastre um usuário de teste, confirme que o e-mail
chega com link para o domínio do portal, crie a organização no onboarding.

## 6. GitHub Actions (deploy manual e status de migrations)

1. Na VPS, clone o repositório e crie os arquivos de ambiente — passo a passo
   em `docs/runbooks/primeira-carga.md`, "Caminho B".
2. No GitHub, **Settings → Environments**: crie `homologacao` e `producao`;
   em `producao`, ligue _required reviewers_.
3. Secrets do repositório: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
4. Secrets de cada environment: `DOCKPLOY_DEPLOY_WEBHOOK` (webhook de deploy
   do serviço do portal) e `APP_HEALTH_URL` (a URL do portal).
5. Rode **Deploy (VPS)** com `apenas_status` marcado na primeira vez.

## 7. Produção

Repita os passos 2 a 6 com branch `main`, `COMPOSE_PROJECT_NAME=brandplay-producao`,
os domínios de produção e um **conjunto novo de segredos**. Antes de abrir para
usuários: backup inicial (`docs/runbooks/backup.md`) e, se for o corte do
Lovable, o procedimento de `docs/architecture/plano-migracao-dados-lovable-vps.md`.
