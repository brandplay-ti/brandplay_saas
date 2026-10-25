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

## Log transacional das Edge Functions

Toda rota que passa pelo despachante (`supabase/functions/main`) emite duas
linhas JSON no stdout, com o mesmo `request_id`:

| Evento | Quando | Campos |
| --- | --- | --- |
| `request.inicio` | antes de chamar a função | `request_id`, `funcao`, `metodo`, `campos` (nomes), `consulta` (nomes) |
| `request.fim` | depois da resposta | os mesmos, mais `status`, `duracao_ms`, `campos_saida` |
| `request.contexto` | a função chama `logContexto` depois de validar o JWT | `request_id`, `user_id`, `organization_id`, `code` |

O corpo, a query e os headers sensíveis não entram. `password`, `token`,
`authorization`, documento e o valor de qualquer campo ficam de fora: o log
mostra que a request trouxe `password`, nunca o segredo. PDF e outro binário
não são lidos; só JSON pequeno (até 64 KB) contribui com nomes de campo.

A resposta leva o header `x-request-id`. A função recebe o mesmo header e deve
repassá-lo em `logContexto`.

### Rotas novas

Rota nova segue este padrão. O ciclo `inicio`/`fim` já é automático: não
escreva outro logger de request, e não use `console.log` com corpo, JWT ou
chave. Quando a função autenticar, chame `logContexto` de
`supabase/functions/_shared/observabilidade.ts` uma vez, com o `user.id` saído
do JWT e a organização que a própria função resolveu. `code` é um identificador
curto de negócio (`plano_criado`, `acesso_negado`), sem frase e sem dado de
cliente.

Auditoria de negócio (quem alterou um contrato, quem concedeu um papel)
continua nas tabelas `*_audit_log`. O log transacional não as substitui.

## Prometheus e Grafana

Os contadores vivem no processo do despachante. `GET /functions/v1/metricas`
devolve texto Prometheus. Sem `EDGE_METRICS_TOKEN` no serviço `functions` a
rota responde 404. Com o token, o scrape envia `Authorization: Bearer <token>`.
O valor fica só no Dockploy (e no `.env` local); não entra no repositório.

Métricas:

- `brandplay_edge_requests_total{funcao,status}`
- `brandplay_edge_request_duration_ms_bucket{funcao,le}` (e `_sum` / `_count`)

O Prometheus e o Grafana já rodam em outra VPS. Este repositório não sobe os
dois. Exemplo de scrape, contra a API pública (o Kong não exige `apikey` nesta
rota; o token acima é a trava):

```yaml
scrape_configs:
  - job_name: brandplay-edge
    scheme: https
    metrics_path: /functions/v1/metricas
    authorization:
      credentials: <EDGE_METRICS_TOKEN>
    static_configs:
      - targets: ["api.<dominio>"]
```

Taxa de erro no Grafana, janela de 5 minutos:

```promql
sum by (funcao) (rate(brandplay_edge_requests_total{status=~"5.."}[5m]))
/
sum by (funcao) (rate(brandplay_edge_requests_total[5m]))
```

Os logs JSON saem no stdout do container `functions`. O coletor da outra VPS
(Promtail ou equivalente) lê esse stdout; um painel no Grafana filtra
`evento="request.fim"` e `status >= 500`. Reiniciar o container zera os
contadores em memória. O histórico fica no Prometheus.
