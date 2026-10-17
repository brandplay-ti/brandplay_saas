-- Revoga o superadmin da plataforma de uma conta. ADR-0008,
-- docs/runbooks/superadmin.md.
--
-- Local:
--
--   npm run supabase:superadmin:revogar -- -v email=pessoa@empresa.com -v comentario="Saiu da equipe"
--
-- Homologação e produção: o mesmo arquivo pelo psql do Caminho B de
-- docs/runbooks/primeira-carga.md, ou, no SQL Editor do Studio:
--
--   select public.platform_admin_revoke('pessoa@empresa.com', 'motivo');
--
-- A linha de `platform_admins` fica, com `revoked_at`: é o histórico. O efeito é
-- imediato no banco; a sessão aberta perde o acesso na próxima consulta.

\set ON_ERROR_STOP on

-- Sem os parâmetros, para com erro (e código de saída diferente de zero).
\if :{?email}
\else
  do $$ begin raise exception 'informe -v email=<e-mail da conta> -v comentario=<motivo>'; end $$;
\endif

\if :{?comentario}
\else
  do $$ begin raise exception 'informe -v comentario=<motivo da revogação>'; end $$;
\endif

select public.platform_admin_revoke(:'email', :'comentario') as superadmin_user_id;
