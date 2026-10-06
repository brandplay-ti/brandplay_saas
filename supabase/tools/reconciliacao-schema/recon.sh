#!/usr/bin/env sh
# Recria os bancos descartáveis de reconciliação e compara os catálogos.
# Uso (raiz do repositório, Git Bash): sh supabase/tools/reconciliacao-schema/recon.sh [secao]
#   secao opcional: table|column|enum|function|trigger|view|policy|constraint|index|bucket
# Requer o stack local de pé (fonte da estrutura de auth/storage). Ver README.md.
set -eu

IMG="${RECON_IMAGE:-supabase/postgres:17.6.1.136}"
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
OUT="${RECON_OUT:-$ROOT/.recon}"
mkdir -p "$OUT"

psql_in() { docker exec -i "$1" psql -U supabase_admin -d postgres -q "$@"; }

for n in lovable repo; do
  docker rm -f "recon-$n" >/dev/null 2>&1 || true
  docker run -d --name "recon-$n" -e POSTGRES_PASSWORD=recon-local-only "$IMG" >/dev/null
done

for n in lovable repo; do
  i=0
  until docker exec "recon-$n" pg_isready -U postgres -h localhost >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 60 ] && { echo "timeout esperando recon-$n"; exit 1; }; sleep 2
  done
done
# a imagem reinicia o postgres ao fim do init; garante que o init terminou
sleep 15

docker exec brandplay-supabase-db-1 pg_dump -U supabase_admin -d postgres \
  --schema-only -n auth -n storage --no-owner --no-privileges > "$OUT/base.sql"

for n in lovable repo; do
  docker exec "recon-$n" psql -U supabase_admin -d postgres -q \
    -c "drop schema if exists auth cascade; drop schema if exists storage cascade;" >/dev/null 2>&1
  docker exec -i "recon-$n" psql -U supabase_admin -d postgres -q < "$OUT/base.sql" > "$OUT/base_$n.log" 2>&1 || true
done

apply() {
  c="$1"; shift; ok=0; : > "$OUT/apply_$c.log"
  for f in "$@"; do
    if docker exec -i "$c" psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -1 < "$f" >> "$OUT/apply_$c.log" 2>&1; then
      ok=$((ok + 1))
    else
      echo "FALHOU em $c: $(basename "$f")"
    fi
  done
  echo "$c: $ok de $# aplicadas"
}

apply recon-repo "$ROOT"/supabase/migrations/0*.sql
apply recon-lovable "$ROOT"/supabase/lovable-migrations/2026*.sql

for n in lovable repo; do
  docker exec -i "recon-$n" psql -U supabase_admin -d postgres -q < "$DIR/catalog.sql" > "$OUT/cat_$n.txt"
done

python "$DIR/compare.py" "$OUT/cat_lovable.txt" "$OUT/cat_repo.txt" ${1:-}
