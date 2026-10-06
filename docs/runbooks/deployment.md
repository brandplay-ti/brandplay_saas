# Runbook — Deploy

1. CI verde no PR de promoção (`dev` → `hml`, ou `hml` → `main`).
2. Revise as migrations novas (`git diff --stat origin/main -- supabase/migrations`).
3. Se houver migration: backup (`docs/runbooks/backup.md`) e aplique —
   **homologação primeiro** (`docs/runbooks/primeira-carga.md`, Caminho B).
4. Faça o merge. O Dockploy publica o ambiente da branch (watch + autodeploy);
   ou dispare **Deploy (VPS)** no GitHub Actions.
5. Health check: `curl -fsS https://<portal>` e
   `curl -fsS https://api.<dominio>/functions/v1/saude`.
6. Valide autenticação e isolamento entre organizações
   (`npm run supabase:checar -- https://api.<dominio> <ANON_KEY> --portal https://<portal>`).
7. Valide os fluxos críticos: cadastro/onboarding, pipeline, contratos, IA,
   e-mails.
8. Monitore erros e recursos nas horas seguintes.

Mudanças feitas direto no Dockploy (variáveis, domínios, limites) não passam
por PR: registre aqui o que mudou, quando e por quê.

## Notas de deploy

| Data | Ambiente | O que mudou | Quem |
| ---- | -------- | ----------- | ---- |
|      |          |             |      |

Pipeline, runner, ordem e rollback: `docs/infrastructure/cicd.md`.
Ambiente novo: `docs/runbooks/provisionar-ambiente.md`.
