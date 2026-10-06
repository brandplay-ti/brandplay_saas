-- Define a senha dos papeis internos do Supabase no ambiente local.
-- Executado apenas na primeira inicializacao do volume do Postgres.
--
-- A lista de papeis varia entre versoes da imagem supabase/postgres
-- (supabase_functions_admin, por exemplo, nao existe em todas). Por isso o
-- comando e gerado a partir de pg_roles e aplicado com \gexec: papel ausente
-- simplesmente nao entra na lista, em vez de abortar o script e deixar
-- servicos como storage e rest sem senha valida.
--
-- Nao use um bloco DO aqui: o psql nao interpola :'pgpass' dentro de strings
-- com dollar-quoting.
\set pgpass `echo "$POSTGRES_PASSWORD"`

select format('alter user %I with password %L', rolname, :'pgpass')
from pg_roles
where rolname in (
  'authenticator',
  'pgbouncer',
  'supabase_auth_admin',
  'supabase_functions_admin',
  'supabase_storage_admin'
)
order by rolname
\gexec
