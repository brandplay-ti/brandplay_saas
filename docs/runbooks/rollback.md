# Runbook — Rollback

Rollback da aplicação e rollback do banco são operações separadas.

- **Portal:** no Dockploy, republique o deploy anterior do serviço do portal
  (ou reverta o merge na branch do ambiente).
- **Edge Functions / stack:** reverta o commit em `docker/` ou
  `supabase/functions/` na branch do ambiente; o watch redeploya o stack com a
  imagem anterior.
- **Migration aditiva:** normalmente basta reverter o portal.
- **Migration destrutiva:** restaurar o backup tirado antes dela
  (`docs/runbooks/restore.md`). Nunca reverta automaticamente sem avaliar a
  perda de dados.

Prefira migrations compatíveis com a versão anterior do código (expand/contract,
`docs/infrastructure/cicd.md`).
