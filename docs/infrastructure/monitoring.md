# Monitoramento

Monitore: saúde dos containers (todos os serviços do compose têm
healthcheck), CPU, RAM e disco da VPS, saúde do banco, execução dos backups,
taxa de erro do portal e das Edge Functions, falhas de autenticação relevantes
e os logs de erro da aplicação (`backend_error_logs`, funções `log-db-error` e
`report-error`).

Checagem rápida de um ambiente, só leitura:

```bash
npm run supabase:checar -- https://api.<dominio> <ANON_KEY> --portal https://<dominio>
curl -fsS https://api.<dominio>/functions/v1/saude
```
