# Runtime das Edge Functions, com o codigo das funcoes assado na imagem.
#
# ─── Por que nao o bind mount, que era o desenho anterior ────────────
#
# O compose montava `supabase/functions` direto do clone do repositorio. No
# Dockploy esse clone e refeito a cada deploy, e `docker compose up -d` so
# recria um container cuja DEFINICAO mudou — a do `functions` nao muda. O
# container seguia rodando preso ao diretorio antigo, e o `main`, ja compilado
# em /var/tmp na subida, continuava respondendo como se estivesse tudo bem.
#
# O resultado e o pior formato possivel de falha: toda funcao devolvendo 500
# com "could not find an appropriate entrypoint", container de pe, nenhum
# alarme, e o descobrimento acontecendo no checkout de um cliente.
#
# Assadas na imagem, as funcoes deixam de depender de um diretorio do host:
# muda o conteudo, muda a imagem, o compose recria o container. Nao ha estado
# no host para ficar para tras. O `pull_policy: build` no compose garante o
# build no deploy mesmo quando quem chama nao passa `--build`.
#
# Em desenvolvimento o bind continua existindo, no `docker-compose.local.yml`:
# la ele e o que permite editar uma funcao sem rebuildar a imagem.
#
# O contexto de build e `supabase/functions` (~130 KB), e nao a raiz do
# repositorio: nao ha por que mandar `portal/`, `docs/` e `node_modules` para o
# daemon.

FROM supabase/edge-runtime:v1.74.0

# A versao do runtime e ESTA linha, e so ela. O compose nao declara `image:`:
# quem nomeia a imagem construida aqui e o proprio Compose, como
# `<projeto>-functions`, para que homologacao e producao — projetos diferentes
# no mesmo daemon — nao disputem uma tag.

# `curl` para o healthcheck do compose. A imagem base e Debian slim e nao traz
# cliente HTTP nenhum — nem curl, nem wget, nem nc, nem o binario do deno.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Por ultimo, de proposito: e a camada que muda a cada alteracao de funcao, e
# manter o `apt` acima dela preserva o cache entre builds.
COPY . /home/deno/functions
