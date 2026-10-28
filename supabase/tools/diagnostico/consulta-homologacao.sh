#!/bin/bash
# Consulta somente leitura ao Postgres de homologacao.
#
# Este arquivo e enviado por stdin para um bash na VPS. Ele nao recebe
# argumento. A senha fica em /etc/brandplay/homologacao.env, na VPS, e nao volta
# na saida: o que sai sao marcadores --DIAG: e linhas de resultado.
#
# Cada sessao do psql comeca com default_transaction_read_only e so executa
# SELECT. Producao nao e um caminho deste script: o arquivo e a rede sao os
# de homologacao, fixos.

set -euo pipefail

arquivo=/etc/brandplay/homologacao.env
if [ ! -r "$arquivo" ]; then
  echo "DIAG_ERRO arquivo de homologacao ilegivel" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
. "$arquivo"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DIAG_ERRO DATABASE_URL ausente" >&2
  exit 2
fi
if [ -z "${SUPABASE_NETWORK:-}" ]; then
  echo "DIAG_ERRO SUPABASE_NETWORK ausente" >&2
  exit 2
fi

case "$SUPABASE_NETWORK" in
  *[!A-Za-z0-9_.-]*)
    echo "DIAG_ERRO nome de rede invalido" >&2
    exit 3
    ;;
esac
case "$SUPABASE_NETWORK" in
  *producao* | *production*)
    echo "DIAG_ERRO rede parece producao" >&2
    exit 3
    ;;
esac
# Homologacao usa o mesmo compose de producao. O nome da rede pode ser
# brandplay-teste_default, nao precisa conter "hml". O arquivo lido acima ja
# e o de homologacao; aqui so se recusa a rede de producao.
case "$SUPABASE_NETWORK" in
  *hml* | *homolog* | *teste* | *staging*) ;;
  *)
    echo "DIAG_ERRO SUPABASE_NETWORK nao identifica homologacao" >&2
    exit 3
    ;;
esac

# Ultimo @ separa a senha do host. Senha com @ no meio nao pode vazar no erro.
rest="${DATABASE_URL##*@}"
host="${rest%%:*}"
host="${host%%/*}"
case "$host" in
  *[!A-Za-z0-9_.-]*)
    echo "DIAG_ERRO host do banco invalido" >&2
    exit 3
    ;;
esac
case "$host" in
  *producao* | *production*)
    echo "DIAG_ERRO host do banco parece producao ($host)" >&2
    exit 3
    ;;
esac

rodar() {
  docker run --rm --network "$SUPABASE_NETWORK" -e DATABASE_URL -i postgres:17-alpine \
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tAq
}

echo '--DIAG:SINAIS'
sinais="$(
  rodar <<'SQL'
SET default_transaction_read_only = on;
SELECT 'migrations_table=' || (to_regclass('migrations.schema_migrations') IS NOT NULL)::text;
SELECT 'errors_table=' || (to_regclass('public.backend_error_logs') IS NOT NULL)::text;
SELECT 'gotrue_table=' || (to_regclass('auth.schema_migrations') IS NOT NULL)::text;
SELECT 'storage=' || (to_regclass('storage.buckets') IS NOT NULL)::text;
SELECT 'organizations_table=' || (to_regclass('public.organizations') IS NOT NULL)::text;
SQL
)"
printf '%s\n' "$sinais"

if printf '%s\n' "$sinais" | grep -qx 'migrations_table=true'; then
  echo '--DIAG:MIGRATIONS'
  rodar <<'SQL'
SET default_transaction_read_only = on;
SELECT version || E'\t' || coalesce(checksum, '')
FROM migrations.schema_migrations
ORDER BY version;
SQL
else
  echo '--DIAG:MIGRATIONS'
  echo '__sem_tabela__'
fi

if printf '%s\n' "$sinais" | grep -qx 'gotrue_table=true'; then
  echo '--DIAG:GOTRUE'
  rodar <<'SQL'
SET default_transaction_read_only = on;
SELECT count(*)::text FROM auth.schema_migrations;
SQL
else
  echo '--DIAG:GOTRUE'
  echo 'ausente'
fi

if printf '%s\n' "$sinais" | grep -qx 'organizations_table=true'; then
  echo '--DIAG:ORGANIZATIONS'
  rodar <<'SQL'
SET default_transaction_read_only = on;
SELECT count(*)::text FROM public.organizations;
SQL
else
  echo '--DIAG:ORGANIZATIONS'
  echo 'ausente'
fi

if printf '%s\n' "$sinais" | grep -qx 'errors_table=true'; then
  echo '--DIAG:ERROS'
  rodar <<'SQL'
SET default_transaction_read_only = on;
SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"')
  || E'\t' || table_name
  || E'\t' || action
  || E'\t' || coalesce(error_code, '')
  || E'\t' || left(regexp_replace(coalesce(error_message, ''), E'[\t\n\r]+', ' ', 'g'), 160)
FROM public.backend_error_logs
ORDER BY created_at DESC
LIMIT 20;
SQL
else
  echo '--DIAG:ERROS'
  echo '__sem_tabela__'
fi
