-- 0045_logs_de_falhas_so_superadmin.sql
--
-- Logs de falha são telemetria da PLATAFORMA (BP-3): só o superadmin (0027,
-- ADR-0008) lê, numa tela da área /admin que junta todos os clientes.
--
-- Até aqui (0017) cada usuário lia os próprios registros e o owner/admin lia
-- os da organização. Esconder a tela não bastava: a API devolvia as linhas,
-- inclusive `matching_policies`, que traz o SQL das policies (`qual` e
-- `with_check`) — informação de diagnóstico, não de cliente.
--
--   backend_error_logs  falhas de banco registradas por `log-db-error`
--   error_reports       falhas de tela registradas por `report-error`
--
-- As duas são escritas só pelas Edge Functions (service role). Ficam fora da
-- policy restritiva de cobrança (0026) e do teste (m), como já estavam. O
-- superadmin continua sem ler dado de domínio: estas tabelas não são de
-- domínio, e a sessão de suporte (0035) não abre mais nada aqui, porque a
-- leitura deixou de depender de `has_org_role`.

drop policy if exists backend_error_logs_own_read on public.backend_error_logs;
drop policy if exists backend_error_logs_admin_read on public.backend_error_logs;
create policy backend_error_logs_platform_admin_read on public.backend_error_logs
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists error_reports_own_read on public.error_reports;
drop policy if exists error_reports_admin_read on public.error_reports;
create policy error_reports_platform_admin_read on public.error_reports
  for select to authenticated
  using (public.is_platform_admin());

-- Sem policy de escrita a RLS já recusa; o revoke deixa a intenção explícita,
-- como na cobrança (0024).
revoke insert, update, delete on public.backend_error_logs from anon, authenticated;
revoke insert, update, delete on public.error_reports from anon, authenticated;

insert into migrations.schema_migrations (version)
values ('0045_logs_de_falhas_so_superadmin');
