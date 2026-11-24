-- Testes da retenção dos logs de falha (0047, BP-5, ADR-0014).
--
--   npm run supabase:test        (roda junto com os demais arquivos)
--
-- Tudo numa transação revertida no fim: a limpeza roda de verdade aqui dentro,
-- mas nada sai do banco. Cada verificação que falha levanta exceção; com
-- psql -v ON_ERROR_STOP=1 o script termina com erro.

\echo ''
\echo '=== Testes da retenção dos logs de falha (transação revertida no fim) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', '1f000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'retencao.a@teste.local', '{"full_name":"Retenção A"}');

-- Para cada tabela: uma linha passada do prazo e uma ainda dentro dele.
insert into public.backend_error_logs (id, user_id, table_name, action, error_message, created_at) values
  ('1f100000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-00000000000a', 'sponsors', 'insert', 'antiga',
   now() - interval '3 months' - interval '1 day'),
  ('1f100000-0000-4000-8000-000000000002', '1f000000-0000-4000-8000-00000000000a', 'sponsors', 'insert', 'recente',
   now() - interval '3 months' + interval '1 day');

insert into public.error_reports (id, user_id, message, created_at) values
  ('1f200000-0000-4000-8000-000000000001', '1f000000-0000-4000-8000-00000000000a', 'antiga',
   now() - interval '3 months' - interval '1 day'),
  ('1f200000-0000-4000-8000-000000000002', '1f000000-0000-4000-8000-00000000000a', 'recente',
   now() - interval '3 months' + interval '1 day');

-- (a) A limpeza tira o que passou de 3 meses e mantém o resto.
do $$
declare
  _r record;
begin
  for _r in select * from public.limpar_logs_de_falha() loop
    if _r.removidos < 1 then
      raise exception 'FALHA (a): nada removido de %', _r.tabela;
    end if;
  end loop;

  if exists (select 1 from public.backend_error_logs where id = '1f100000-0000-4000-8000-000000000001')
     or exists (select 1 from public.error_reports where id = '1f200000-0000-4000-8000-000000000001') then
    raise exception 'FALHA (a): log com mais de 3 meses continuou no banco';
  end if;
  if not exists (select 1 from public.backend_error_logs where id = '1f100000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.error_reports where id = '1f200000-0000-4000-8000-000000000002') then
    raise exception 'FALHA (a): log dentro dos 3 meses foi apagado';
  end if;
  raise notice 'OK (a): logs com mais de 3 meses saem, os recentes ficam';
end $$;

-- (b) O job diário está agendado e ativo.
do $$
begin
  if not exists (
    select 1 from cron.job
     where jobname = 'limpar-logs-de-falha'
       and schedule = '0 3 * * *'
       and command = 'select public.limpar_logs_de_falha()'
       and active
  ) then
    raise exception 'FALHA (b): job limpar-logs-de-falha ausente, inativo ou com outro horário';
  end if;
  raise notice 'OK (b): job diário limpar-logs-de-falha agendado';
end $$;

-- (c) Ninguém da API chama a limpeza.
do $$
declare
  _papel text;
begin
  foreach _papel in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(_papel, 'public.limpar_logs_de_falha()', 'execute') then
      raise exception 'FALHA (c): % pode executar limpar_logs_de_falha()', _papel;
    end if;
  end loop;
  raise notice 'OK (c): limpar_logs_de_falha() fora do alcance da API';
end $$;

rollback;

\echo '=== Fim dos testes da retenção dos logs de falha ==='
