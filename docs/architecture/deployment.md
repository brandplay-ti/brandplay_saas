# Deployment

Homologação e produção rodam numa **VPS única gerenciada pelo Dockploy**, atrás
do Traefik: o stack do Supabase e o portal ficam no mesmo projeto do Dockploy.
É o mesmo desenho do central-check (ADR-0006); o padrão genérico está em
[`docs/infrastructure/padrao-de-projeto.md`](../infrastructure/padrao-de-projeto.md).

## Topologia no Dockploy

Um projeto `brandplay`, com dois serviços por ambiente. Cada ambiente segue
uma branch: `hml` publica homologação e `main` publica produção. `dev` é a
branch padrão do repositório e o alvo dos PRs de feature; nada publica a partir
dela. Promover é abrir PR `dev` → `hml` e, validado em homologação, `hml` →
`main`.

| Serviço             | Tipo no Dockploy | Fonte                                | Branch | Watch paths                | Domínio (exemplo)                 |
| ------------------- | ---------------- | ------------------------------------ | ------ | -------------------------- | --------------------------------- |
| `supabase-hml`      | Compose          | `docker/supabase/docker-compose.yml` | `hml`  | `docker/**`, `supabase/**` | `api.hml.<dominio>` → `kong:8000` |
| `portal-hml`        | Application      | pasta base `/portal`, `Dockerfile`   | `hml`  | `portal/**`                | `hml.<dominio>` → porta `3000`    |
| `supabase-producao` | Compose          | `docker/supabase/docker-compose.yml` | `main` | `docker/**`, `supabase/**` | `api.<dominio>` → `kong:8000`     |
| `portal-producao`   | Application      | pasta base `/portal`, `Dockerfile`   | `main` | `portal/**`                | `<dominio>` → porta `3000`        |

Regras que não podem variar entre os dois ambientes:

- **`COMPOSE_PROJECT_NAME` diferente em cada serviço do Supabase**
  (`brandplay-hml`, `brandplay-producao`). Dois stacks com o mesmo nome no
  mesmo daemon colidem em rede, volumes e na tag da imagem de `functions`.
- **Segredos novos por ambiente.** `JWT_SECRET`, `ANON_KEY`,
  `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD` e afins são gerados uma vez para
  homologação e outra para produção (`npm run supabase:chaves` serve para
  gerar o conjunto coerente — os valores locais nunca vão para lá).
- **Domínio próprio, nunca o `sslip.io` gerado pelo Dockploy.** O hash do
  domínio gerado muda a cada recriação do serviço, e a URL do Supabase é
  embutida no bundle do portal em tempo de build: cada recriação quebraria o
  portal publicado em silêncio.
- **O `kong` é o único serviço do Supabase com domínio.** Studio, Postgres,
  Redis e o pooler não são publicados; o Studio responde pelo Kong, atrás do
  basic auth do dashboard (`DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`).

## Onde a configuração vive

Configuração de containers e serviços nos ambientes hospedados — variáveis de
ambiente, segredos, domínios, TLS, volumes, limites de recurso, política de
restart — é definida **direto no Dockploy**, não em arquivos deste repositório.

`docker/supabase/docker-compose.yml` é o **único stack do Supabase**, comum a
desenvolvimento, homologação e produção. Só as variáveis mudam entre eles. O
contrato completo das variáveis é `docker/supabase/.env.example`; no Dockploy,
cole o conteúdo equivalente na aba de ambiente do serviço, com os valores
daquele ambiente.

As que mudam por ambiente e mais costumam ficar esquecidas:

| Variável                   | Homologação                 | Produção                |
| -------------------------- | --------------------------- | ----------------------- |
| `COMPOSE_PROJECT_NAME`     | `brandplay-hml`             | `brandplay-producao`    |
| `SUPABASE_HOST`            | `api.hml.<dominio>`         | `api.<dominio>`         |
| `API_EXTERNAL_URL`         | `https://api.hml.<dominio>` | `https://api.<dominio>` |
| `SUPABASE_PUBLIC_URL`      | `https://api.hml.<dominio>` | `https://api.<dominio>` |
| `SITE_URL`                 | `https://hml.<dominio>`     | `https://<dominio>`     |
| `ADDITIONAL_REDIRECT_URLS` | `https://hml.<dominio>/**`  | `https://<dominio>/**`  |
| `APP_URL`                  | `https://hml.<dominio>`     | `https://<dominio>`     |
| `SMTP_*`                   | provedor real, com TLS      | provedor real, com TLS  |
| `ANTHROPIC_API_KEY`        | chave de homologação        | chave de produção       |
| `RESEND_API_KEY`           | chave de homologação        | chave de produção       |

`ADDITIONAL_REDIRECT_URLS` precisa cobrir os caminhos de retorno do cadastro:
`pages/Auth.tsx` manda `emailRedirectTo` para `/onboarding/organizacao` e o
login do patrocinador para `/portal`. Um destino fora da allow list é
descartado **em silêncio** pelo GoTrue, que usa o `SITE_URL` no lugar.

As variáveis de `*_PORT_HOST` são lidas só pelo `docker-compose.local.yml` e
não têm efeito nos hospedados — lá nada é publicado no host, quem expõe é o
Traefik.

### O Dockploy observa `docker/` e `supabase/` — um commit ali é um deploy

O serviço do Supabase de cada ambiente fica com **watch** nessas pastas, com
trigger `On Push` na branch do ambiente. Consequências:

- **Mudar `docker/` é uma ação, não só um diff.** Editar o compose, o
  `kong.yml` ou um SQL de init reinicia o stack daquele ambiente.
- **Os bind mounts de `docker/files/volumes/` são atualizados a cada deploy.**
  É o objetivo: configuração e código seguem o repositório.
- **Dado nunca mora em bind mount.** O diretório da aplicação é refeito a cada
  deploy. Banco, Storage e snippets do Studio são volumes nomeados — no
  central-check, um bind mount do banco apagou a homologação num redeploy.
- **Os SQL de init de `docker/files/volumes/db/` só rodam na criação do
  volume.** Editá-los não muda um ambiente existente.
- **Commit em `supabase/migrations/` redeploya o stack, mas não aplica
  migration nenhuma.** Aplicar é o procedimento manual de
  `docs/runbooks/primeira-carga.md`.
- **`Autodeploy` é um toggle separado do `Trigger Type`.** Desligado, o push
  passa em silêncio: o portal implanta e o Supabase não.

## Edge Functions vão dentro da imagem

O serviço `functions` **constrói** `docker/supabase/functions.Dockerfile`, que
copia `supabase/functions` para dentro da imagem. Nos hospedados nada é
montado: roda o que foi assado no deploy. O ambiente local mantém o bind, no
`docker-compose.local.yml`, para editar sem rebuild.

Três detalhes sustentam isso, e nenhum pode ser removido:

- **`pull_policy: build`** — sem ele, um `up -d` que achasse a imagem local
  reaproveitaria as funções do deploy anterior, desatualizadas em silêncio.
- **Healthcheck em `/saude`**, uma função de verdade despachada pelo `main`. O
  `main` é compilado para `/var/tmp` na subida e segue respondendo mesmo com o
  diretório das funções inacessível — foi assim que o central-check passou um
  deploy inteiro com toda função em 500 e o container "saudável".
- **Sem `image:` fixo.** O Compose nomeia `<projeto>-functions`, e homologação
  e produção são projetos diferentes no mesmo daemon: uma tag fixa deixaria um
  build de homologação sobrescrever a imagem de produção.

Consequência: o editor de Edge Functions do Studio só existe no ambiente local.
Num hospedado ele salvaria no clone e pareceria funcionar sem mudar nada do que
está no ar.

## Build do portal

### O contexto é `portal/`, não a raiz

O serviço do portal no Dockploy usa a pasta base **`/portal`**. Tudo que o
build lê tem de estar dentro dela: manifesto, pin de versão, scripts,
`Dockerfile`, `nixpacks.toml`. No central-check, o pin de Node estava na raiz,
o Dockploy nunca o leu, e o Nixpacks caiu calado no Node 18 — quatro builds
quebrados.

Qualquer coisa acrescentada depois para o deploy — um script de healthcheck,
uma guarda nova — vai em `portal/`, ou fica ausente do build sem aviso.

#### O custo: `npm ci` não é possível

`package-lock.json` é do workspace e vive na **raiz**, fora do contexto. Sem
ele resta `npm install`, que resolve versões na hora: dois builds do mesmo
commit podem instalar patches diferentes. A correção é apontar a pasta base do
Dockploy para a raiz e construir com `-f portal/Dockerfile`. Até lá, o risco é
conhecido e aceito.

### Dockerfile (recomendado) ou Nixpacks

`portal/Dockerfile`, `FROM node:26-alpine`, dois estágios: build e serve. A
versão do Node é a primeira linha do arquivo. A imagem final só tem `dist/` e o
`serve`, roda como o usuário `node` e escuta na porta `3000`.

`portal/nixpacks.toml` declara pacote (`nodejs_26`) e archive do nixpkgs
explicitamente, para o caso de o serviço usar Nixpacks. **Se
`NIXPACKS_NODE_VERSION` estiver definida no Dockploy, remova** — ela briga com
o arquivo.

| Fase    | O que roda                                                       |
| ------- | ---------------------------------------------------------------- |
| install | `npm install` — o manifesto de `portal/`, sem lockfile           |
| build   | `node scripts/checar-build.mjs`, depois `npm run build` → `dist` |
| start   | `serve -s dist`, na porta `3000`                                 |

Arquivos em `portal/` que existem para isso e não devem ser removidos:

- **`scripts/checar-build.mjs`** — para o build quando as variáveis do
  Supabase faltam, estão sob o nome errado (os do Lovable, ou os que o modal
  "Connect" do Studio sugere), não têm esquema ou apontam para `localhost`.
  Roda nos dois caminhos de build e **não** é `prebuild`: localmente o Vite lê
  `.env.local` sozinho e a checagem recusaria um build local correto.
- **`scripts/checar-node.mjs`** (`prebuild`), e o mesmo major em
  `engines.node`, `.nvmrc`, `Dockerfile`, `nixpacks.toml` e no CI.
- **O `-s` em `serve -s`** — devolve `index.html` para rota desconhecida. Sem
  ele, um F5 em `/dashboard/pipeline` responde 404.

### As variáveis do Supabase são lidas no **build**

`VITE_PUBLIC_SUPABASE_URL` e `VITE_PUBLIC_SUPABASE_ANON_KEY` são embutidas no
bundle durante o `vite build`. **No Dockploy, declare as duas como build
arguments** do serviço do portal — como variável só de runtime, o build sai com
código 0 e o bundle leva string vazia (tela branca no navegador).

`VITE_PUBLIC_SUPABASE_URL` precisa do esquema (`https://api.<dominio>`), e o
valor é o domínio do **Kong** daquele ambiente.

Trocar qualquer um dos dois valores exige **rebuild**, não restart. Enquanto
ninguém reconstrói, o Dockploy mostra o valor novo e o portal no ar carrega o
antigo.

## Deploy

O Dockploy publica a partir do repositório (push na branch do ambiente, ou o
workflow `Deploy (VPS)` disparando o webhook). Migrations são um passo separado
e manual — ver `docs/infrastructure/cicd.md`. **O build do portal não roda
migrations**, e não deve: republicar o portal é reversível, uma migration não.

Ordem num deploy que traz schema novo:

```
CI verde → backup → migrations (homologação primeiro) → redeploy do portal → health check
```

Diagnóstico de um ambiente que "não conecta": `npm run supabase:checar --
https://api.<dominio> <ANON_KEY> --portal https://<dominio>`.
