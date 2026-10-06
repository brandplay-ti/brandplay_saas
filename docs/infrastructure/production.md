# Produção

Produção usa HTTPS, acesso de rede restrito, segredos gerenciados, backup,
monitoramento e health checks.

Interfaces administrativas do Supabase (Studio, Postgres, pooler) não são
expostas diretamente à internet: o único serviço do stack com domínio é o
`kong`, e o Studio responde por ele atrás do basic auth do dashboard.

O isolamento entre organizações é garantido pela RLS, independente da
topologia de deploy.

## Topologia

Uma VPS com Dockploy hospeda, no mesmo projeto, o stack do Supabase e o portal
de cada ambiente (homologação e produção), atrás do Traefik. Detalhes em
`docs/architecture/deployment.md`.

## Configuração e segredos

Containers e serviços são configurados **no Dockploy**: variáveis de ambiente,
segredos, domínios, certificados, volumes e limites de recurso. O repositório
não guarda configuração de produção.

Isso inclui `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`,
`DASHBOARD_PASSWORD`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` e as credenciais
SMTP. Rotacionar qualquer um é uma operação no Dockploy seguida de restart dos
serviços afetados; `ANON_KEY` e `SERVICE_ROLE_KEY` são regeneradas junto com o
`JWT_SECRET` — e o portal é **reconstruído**, porque a `ANON_KEY` vai embutida
no bundle.

Para conferir se as chaves de um ambiente batem com o `JWT_SECRET` dele:

```bash
JWT_SECRET=<segredo-do-ambiente> npm run supabase:chave-de-papel
```

Como a configuração de produção não está no versionamento, mudanças lá não
passam por PR. Registre o que mudou e por quê nas notas de deploy
(`docs/runbooks/deployment.md`).
