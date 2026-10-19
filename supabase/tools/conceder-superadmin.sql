-- Concede (ou reativa) o superadmin da plataforma para uma conta existente.
-- ADR-0008, docs/runbooks/superadmin.md.
--
-- Local:
--
--   npm run supabase:superadmin -- -v email=pessoa@empresa.com -v comentario="Equipe de operação"
--
-- Homologação e produção: o mesmo arquivo pelo psql do Caminho B de
-- docs/runbooks/primeira-carga.md, ou, no SQL Editor do Studio, só a chamada:
--
--   select public.platform_admin_grant('pessoa@empresa.com', 'motivo');
--
-- A pessoa precisa ter se cadastrado pelo portal antes: a concessão não cria
-- usuário nem senha. Fica registrada em `platform_admin_audit_log`.
--
-- Para revogar: supabase/tools/revogar-superadmin.sql.

\set ON_ERROR_STOP on

-- Sem os parâmetros, para com erro (e código de saída diferente de zero).
\if :{?email}
\else
  do $$ begin raise exception 'informe -v email=<e-mail da conta> -v comentario=<motivo>'; end $$;
\endif

\if :{?comentario}
\else
  do $$ begin raise exception 'informe -v comentario=<motivo da concessão>'; end $$;
\endif

select public.platform_admin_grant(:'email', :'comentario') as superadmin_user_id;
