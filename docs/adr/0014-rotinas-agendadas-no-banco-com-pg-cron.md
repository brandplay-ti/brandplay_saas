# ADR-0014: Rotinas agendadas no banco com `pg_cron`

Status: Accepted

## Contexto

A demanda BP-5 pede que os logs de falha (`backend_error_logs` e
`error_reports`) fiquem no sistema por até 3 meses e depois sejam apagados.
Até aqui o projeto não tinha nenhuma rotina agendada: as Edge Functions só
rodam quando alguém as chama, e o workflow `Deploy (VPS)` é manual e não
escreve no banco (ADR-0006).

Opções avaliadas:

1. **`pg_cron` no próprio Postgres.** A extensão vem na imagem
   `supabase/postgres` (a mesma em local, homologação e produção) e é
   carregada pela configuração padrão dela. O job é criado por migration e
   fica versionado.
2. **Edge Function chamada por um agendador externo** (cron da VPS, Dockploy
   ou GitHub Actions). Exige um token novo para a chamada, um agendador fora
   do repositório em cada ambiente e um caminho de rede até a função, só para
   rodar um `delete`.
3. **Apagar na escrita** (`log-db-error`/`report-error` limpam o antigo a cada
   registro novo). Sem falha nova, nada sai, e o custo cai na requisição do
   usuário.

## Decisão

Rotinas de manutenção do banco rodam no `pg_cron`, criadas por migration:

- a regra fica numa função SQL (`public.limpar_logs_de_falha()` na 0047),
  sem `EXECUTE` para `anon`, `authenticated` e `service_role`, chamável à mão
  por quem opera o banco;
- o job chama só essa função, com nome fixo (`cron.schedule` com o mesmo nome
  atualiza o job em vez de duplicar);
- horários em UTC, que é o fuso do `pg_cron`.

É o mesmo mecanismo previsto para a retenção da auditoria
(`docs/architecture/plano-auditoria.md`).

## Consequências

- O `pg_cron` precisa estar em `shared_preload_libraries`. A imagem já o
  carrega; a 0047 confere isso antes de tudo e, se faltar, para com uma
  mensagem que aponta para a configuração do banco no Dockploy, sem aplicar
  nada.
- O histórico das execuções fica em `cron.job_run_details` (uma linha por
  rodada). Consulta em `docs/infrastructure/monitoring.md`.
- O job e a função entram no `pg_dump`, então um restore traz a rotina junto.
- Mudar prazo ou horário é uma migration nova, nunca um `cron.schedule` no
  Studio.
