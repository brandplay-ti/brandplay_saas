# Reconciliação de schema: Lovable × reconstruído

Compara o schema produzido pelas migrations reais do Lovable
(`supabase/lovable-migrations/`) com o produzido por `supabase/migrations/`,
em dois Postgres descartáveis. Não toca no banco do stack local.

Resultado de 2026-10-02: `docs/architecture/reconciliacao-schema-2026-10-02.md`.

## Como rodar (Git Bash, na raiz do repositório)

Pré-requisitos: Docker, o stack local de pé (`npm run supabase:up`, fonte da
estrutura de `auth`/`storage`) e Python 3.

```bash
IMG=supabase/postgres:17.6.1.136   # mesma imagem do docker-compose
OUT=$(mktemp -d)

# 1. dois bancos descartáveis
for n in lovable repo; do
  docker rm -f recon-$n >/dev/null 2>&1
  docker run -d --name recon-$n -e POSTGRES_PASSWORD=recon-local-only $IMG
done
# aguarde ~30 s (pg_isready)

# 2. base de auth/storage igual à do stack (só estrutura, sem dados)
docker exec brandplay-supabase-db-1 pg_dump -U supabase_admin -d postgres \
  --schema-only -n auth -n storage --no-owner --no-privileges > $OUT/base.sql
for n in lovable repo; do
  docker exec recon-$n psql -U supabase_admin -d postgres -q \
    -c "drop schema if exists auth cascade; drop schema if exists storage cascade;"
  docker exec -i recon-$n psql -U supabase_admin -d postgres -q < $OUT/base.sql
done
# os ~14 erros dessa etapa são objetos que dependem de `public`; as próprias
# migrations os recriam.

# 3. aplicar as migrations (cada arquivo numa transação)
for f in supabase/migrations/0*.sql; do
  docker exec -i recon-repo psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -1 < $f || echo "FALHOU $f"
done
for f in supabase/lovable-migrations/2026*.sql; do
  docker exec -i recon-lovable psql -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 -1 < $f || echo "FALHOU $f"
done
# esperado: só 20260419203505_… falha (duplicata do init, descartada no Lovable)

# 4. catálogo e comparação
for n in lovable repo; do
  docker exec -i recon-$n psql -U supabase_admin -d postgres -q \
    < supabase/tools/reconciliacao-schema/catalog.sql > $OUT/cat_$n.txt
done
python supabase/tools/reconciliacao-schema/compare.py $OUT/cat_lovable.txt $OUT/cat_repo.txt
# seção específica: ... compare.py A B trigger | function | column | constraint | index | policy | bucket

# 5. limpeza
docker rm -f recon-lovable recon-repo
```

`L+` = só no Lovable, `R+` = só no repositório, `~` = existe nos dois com
definição diferente.
