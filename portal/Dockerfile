# Build do portal.
#
# ─── O contexto e `portal/`, e nao a raiz ────────────────────────────
#
# O Dockploy e configurado com a pasta base em `/portal` (padrao herdado do
# central-check — ver docs/architecture/deployment.md). Tudo que o build
# precisa tem de estar **aqui dentro**: manifesto, pin de versao, scripts.
#
# No central-check isso custou quatro builds quebrados: o pin de Node estava em
# `engines`, `.nvmrc` e `nixpacks.toml` na raiz do repositorio — que o Dockploy
# nunca leu — e o Nixpacks caiu calado no Node 18.
#
# Aqui a versao do Node e a primeira linha do arquivo. Trocar de versao e
# trocar a tag.
#
# ─── `npm install`, e nao `npm ci` ───────────────────────────────────
#
# O `package-lock.json` e do workspace e vive na **raiz** do repositorio, fora
# deste contexto. Sem ele o `npm ci` nao roda, e o que sobra e `npm install`,
# que resolve as versoes na hora do build.
#
# Isso custa reprodutibilidade: dois builds do mesmo commit podem instalar
# patches diferentes. A correcao e mudar a pasta base do Dockploy para a raiz
# do repositorio, onde o lockfile esta — ver docs/architecture/deployment.md.

FROM node:26-alpine AS build

WORKDIR /app

# Manifesto primeiro: a camada de instalacao so e refeita quando as
# dependencias mudam, e nao a cada alteracao de codigo.
COPY package.json ./

RUN npm install --no-audit --no-fund

COPY . .

# ─── As variaveis do Supabase sao lidas no BUILD ─────────────────────
#
# O Vite embute `import.meta.env.VITE_*` no bundle durante o `vite build`. Elas
# **nao** sao lidas quando o container sobe: passa-las so como variavel de
# runtime gera um build que sai com codigo 0 e um bundle com string vazia, e o
# sintoma aparece so no navegador, como tela branca.
#
# No Dockploy, declare as duas como **build arguments**.
ARG VITE_PUBLIC_SUPABASE_URL
ARG VITE_PUBLIC_SUPABASE_ANON_KEY

ENV VITE_PUBLIC_SUPABASE_URL=$VITE_PUBLIC_SUPABASE_URL
ENV VITE_PUBLIC_SUPABASE_ANON_KEY=$VITE_PUBLIC_SUPABASE_ANON_KEY

# Falhar aqui, com o motivo escrito, vale mais que descobrir pela tela branca.
RUN node scripts/checar-build.mjs

RUN npm run build

# ─── Imagem final ────────────────────────────────────────────────────
# So os arquivos estaticos e o servidor: sem `node_modules` de build, sem
# codigo-fonte.
FROM node:26-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# `serve -s`: toda rota desconhecida devolve `index.html`. Sem isso, um F5 em
# `/dashboard/pipeline` responde 404 — a rota existe no React Router, nao no
# servidor de arquivos.
RUN npm install --global serve@14

COPY --from=build /app/dist ./dist

# Nao roda como root: a imagem `node` ja traz o usuario `node`.
USER node

EXPOSE 3000

CMD ["serve", "-s", "dist"]
