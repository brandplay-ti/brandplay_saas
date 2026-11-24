-- 0047_retencao_logs_de_falha.sql
--
-- Retenção dos logs de falha (BP-5, ADR-0014): o que passou de 3 meses sai.
--
--   backend_error_logs  falhas de banco registradas por `log-db-error`
--   error_reports       falhas de tela registradas por `report-error`
--
-- Decisões:
--
--   1. O prazo conta de `created_at`: sai a linha com mais de 3 meses
--      (`created_at < now() - interval '3 months'`). Uma linha com exatamente
--      3 meses ainda fica até a próxima rodada.
--   2. A limpeza roda no próprio banco, pelo `pg_cron`, todo dia às 03:00 UTC
--      (meia-noite em Brasília). É o primeiro job do projeto; o mesmo
--      mecanismo é o previsto para a retenção da auditoria
--      (`docs/architecture/plano-auditoria.md`).
--   3. `limpar_logs_de_falha()` é chamável à mão por quem opera o banco e
--      devolve quantas linhas saíram de cada tabela. Não é `SECURITY DEFINER`
--      e não fica executável por `anon`, `authenticated` nem `service_role`:
--      quem roda é o dono do job (o papel que aplicou esta migration).
--   4. Os índices em `created_at` já existem (0014), então o `delete` não
--      varre a tabela.
--
-- O `pg_cron` precisa estar em `shared_preload_libraries`. A imagem
-- `supabase/postgres` já o carrega; se um ambiente não carregar, a migration
-- para aqui com a mensagem abaixo, sem aplicar nada.

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or position('pg_cron' in current_setting('shared_preload_libraries')) = 0 then
    raise exception 'pg_cron indisponível neste Postgres'
      using hint = 'A 0047 exige pg_cron em shared_preload_libraries (padrão da imagem supabase/postgres). Confira a configuração do serviço do banco no Dockploy.';
  end if;
end $$;

create extension if not exists pg_cron;

create or replace function public.limpar_logs_de_falha()
returns table (tabela text, removidos bigint)
language plpgsql
set search_path = ''
as $$
declare
  _limite constant timestamptz := now() - interval '3 months';
  _n bigint;
begin
  delete from public.backend_error_logs where created_at < _limite;
  get diagnostics _n = row_count;
  tabela := 'backend_error_logs'; removidos := _n;
  return next;

  delete from public.error_reports where created_at < _limite;
  get diagnostics _n = row_count;
  tabela := 'error_reports'; removidos := _n;
  return next;
end;
$$;

comment on function public.limpar_logs_de_falha() is
  'Retenção dos logs de falha (0047, BP-5): apaga de backend_error_logs e error_reports o que tem mais de 3 meses. Rodada diária pelo job limpar-logs-de-falha do pg_cron.';

revoke all on function public.limpar_logs_de_falha() from public, anon, authenticated, service_role;

-- Com o mesmo nome, `cron.schedule` atualiza o job em vez de duplicar.
select cron.schedule(
  'limpar-logs-de-falha',
  '0 3 * * *',
  'select public.limpar_logs_de_falha()'
);

insert into migrations.schema_migrations (version)
values ('0047_retencao_logs_de_falha');
