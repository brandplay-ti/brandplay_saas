\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
-- tabelas e RLS
select 'table', c.relname, c.relrowsecurity::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by 2;
-- colunas
select 'column', table_name||'.'||column_name, data_type||coalesce('('||udt_name||')',''), is_nullable, coalesce(regexp_replace(column_default,'::[a-z_ ]+','','g'),'')
from information_schema.columns where table_schema='public' and table_name in (select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind in ('r','p')) order by 2;
-- enums
select 'enum', t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' group by t.typname order by 2;
-- funções (assinatura + hash do corpo normalizado)
select 'function', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', pg_get_function_result(p.oid), case when p.prosecdef then 'definer' else 'invoker' end,
       md5(regexp_replace(lower(p.prosrc), '\s+', ' ', 'g'))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 2;
-- triggers (inclui auth.users e storage.objects)
select 'trigger', n.nspname||'.'||c.relname||'.'||t.tgname, p.proname
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users') or (n.nspname='storage' and c.relname='objects')) order by 2;
-- views
select 'view', c.relname, md5(regexp_replace(lower(pg_get_viewdef(c.oid)), '\s+', ' ', 'g'))
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by 2;
-- policies: por tabela e comando (nomes diferem por design)
select 'policy', schemaname||'.'||tablename, cmd, string_agg(policyname, ' / ' order by policyname)
from pg_policies where schemaname in ('public','storage') group by 2,3 order by 2,3;
-- constraints (FK, unique, check)
select 'constraint', conrelid::regclass::text, contype, pg_get_constraintdef(oid)
from pg_constraint where connamespace='public'::regnamespace and contype in ('f','u','c','p') order by 2,3,4;
-- índices não ligados a constraint
select 'index', tablename, regexp_replace(indexdef, 'INDEX \S+ ON', 'INDEX ON')
from pg_indexes i where schemaname='public'
  and not exists (select 1 from pg_constraint c where c.conname=i.indexname) order by 2,3;
-- buckets de storage
select 'bucket', id, public::text, coalesce(file_size_limit::text,'')
from storage.buckets order by 2;
-- permissões de execução das funções (papéis da aplicação)
select 'grant', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
       coalesce((select string_agg(r, ',' order by r) from unnest(array['anon','authenticated','service_role']) r
                 where has_function_privilege(r, p.oid, 'EXECUTE')), '')
from pg_proc p where p.pronamespace='public'::regnamespace
  and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
order by 2;
