# Docker

Builds reproduzíveis, versões de imagem controladas deliberadamente, execução
sem root quando suportado, nenhum segredo embutido em imagem e volumes
persistentes separados de containers descartáveis.

## Ambiente local

O Supabase de desenvolvimento roda via `docker/supabase/docker-compose.yml`
(`npm run supabase:up`, `supabase:migrate`, `supabase:seed`). Instruções,
endpoints e limites em `docker/supabase/README.md`; pipeline e migrations em
`docs/infrastructure/cicd.md`.

## Imagens

- `docker/supabase/docker-compose.yml` fixa as versões de todas as imagens do
  Supabase. Trocar uma versão exige revisar `docker/files/volumes/` no mesmo
  passo (`docker/files/volumes/README.md`).
- `docker/supabase/functions.Dockerfile` fixa o `edge-runtime`.
- `portal/Dockerfile` fixa o Node (`node:26-alpine`) e roda como `node`.
