#!/usr/bin/env sh
# Aplica as migrations pendentes de supabase/migrations em ordem alfabetica.
#
#   ./supabase/tools/migrate.sh --status     lista aplicadas e pendentes
#   ./supabase/tools/migrate.sh --dry-run    mostra o que seria aplicado
#   ./supabase/tools/migrate.sh              aplica as pendentes
#
# Conexao: variavel DATABASE_URL (ex.: postgres://user:senha@host:5432/postgres).
# Timeouts (opcionais): LOCK_TIMEOUT (padrao 5s), STATEMENT_TIMEOUT (padrao 5min).
#
# Garantias:
# - cada migration roda em UMA transacao junto com o registro da versao, entao
#   ou a migration inteira entra e fica registrada, ou nada acontece;
# - advisory lock impede dois deploys simultaneos aplicando a mesma migration;
# - ON_ERROR_STOP=1: qualquer erro aborta antes de tocar a proxima migration;
# - migration ja aplicada nunca roda de novo.

set -eu

DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../migrations" && pwd)"
DATABASE_URL="${DATABASE_URL:-}"
LOCK_TIMEOUT="${LOCK_TIMEOUT:-5s}"
STATEMENT_TIMEOUT="${STATEMENT_TIMEOUT:-5min}"
MODE="apply"

for arg in "$@"; do
  case "$arg" in
    --status) MODE="status" ;;
    --dry-run) MODE="dry-run" ;;
    *) echo "argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$DATABASE_URL" ]; then
  echo "erro: defina DATABASE_URL" >&2
  exit 2
fi

psql_q() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAq -c "$1"
}

# Tabela de controle. Fica em schema proprio para nao aparecer na API REST.
psql_q "
create schema if not exists migrations;
create table if not exists migrations.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  checksum    text
);
" > /dev/null

APLICADAS="$(psql_q "select version from migrations.schema_migrations order by version;")"

esta_aplicada() {
  echo "$APLICADAS" | grep -Fxq "$1"
}

PENDENTES=""
for arquivo in "$DIR"/*.sql; do
  [ -e "$arquivo" ] || continue
  versao="$(basename "$arquivo" .sql)"
  if esta_aplicada "$versao"; then
    [ "$MODE" = "status" ] && echo "aplicada  $versao"
  else
    PENDENTES="$PENDENTES $versao"
    [ "$MODE" != "apply" ] && echo "pendente  $versao"
  fi
done

if [ "$MODE" != "apply" ]; then
  [ -z "$PENDENTES" ] && echo "nenhuma migration pendente"
  exit 0
fi

if [ -z "$PENDENTES" ]; then
  echo "nenhuma migration pendente"
  exit 0
fi

for versao in $PENDENTES; do
  arquivo="$DIR/$versao.sql"
  checksum="$(sha256sum "$arquivo" | cut -d' ' -f1)"
  echo "aplicando $versao"

  # --single-transaction cobre o -f e o -c: a migration e o registro da versao
  # sao confirmados juntos. O advisory lock serializa deploys concorrentes.
  # lock_timeout evita que a migration fique presa atras de uma transacao longa
  # segurando lock e leve a aplicacao junto; statement_timeout limita o dano de
  # uma migration acidentalmente pesada.
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -c "set lock_timeout = '$LOCK_TIMEOUT';" \
    -c "set statement_timeout = '$STATEMENT_TIMEOUT';" \
    -c "select pg_advisory_xact_lock(hashtext('brandplay-migrations'));" \
    -f "$arquivo" \
    -c "insert into migrations.schema_migrations (version, checksum) values ('$versao', '$checksum');"

  echo "ok        $versao"
done

echo "migrations aplicadas"
