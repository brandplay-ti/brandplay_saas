# Runbook — Deploy

1. CI verde no PR de promoção (`dev` → `hml`, ou `hml` → `main`).
2. Revise as migrations novas (`git diff --stat origin/main -- supabase/migrations`).
3. Se houver migration: backup (`docs/runbooks/backup.md`) e aplique —
   **homologação primeiro** (`docs/runbooks/primeira-carga.md`, Caminho B).
4. Faça o merge. O Dockploy publica o ambiente da branch (watch + autodeploy);
   ou dispare **Deploy (VPS)** no GitHub Actions.
5. Health check (homologação: `teste.brandplay.com.br` e
   `teste.db.brandplay.com.br`): `curl -fsS https://brandplay.com.br` e
   `curl -fsS https://db.brandplay.com.br/functions/v1/saude`.
   SEO (`docs/architecture/deployment.md`, "SEO"): em produção,
   `curl -fsS https://brandplay.com.br/robots.txt` termina em
   `Sitemap: https://brandplay.com.br/sitemap.xml`; em homologação, o de
   `teste.brandplay.com.br` bloqueia tudo (`Disallow: /`) e não há sitemap.
6. Valide autenticação e isolamento entre organizações
   (`npm run supabase:checar -- https://db.brandplay.com.br <ANON_KEY> --portal https://brandplay.com.br`).
7. Valide os fluxos críticos: cadastro/onboarding, pipeline, contratos, IA,
   e-mails.
8. Monitore erros e recursos nas horas seguintes.

Se o deploy incluir o marco de IA (migrations `0031`+, área `/admin/ia`):
siga a **Checklist antes do deploy (IA)** em
[`docs/runbooks/ia.md`](ia.md) e registre abaixo.

Mudanças feitas direto no Dockploy (variáveis, domínios, limites) não passam
por PR: registre aqui o que mudou, quando e por quê.

## Notas de deploy

| Data | Ambiente | O que mudou | Quem |
| ---- | -------- | ----------- | ---- |
|      |          |             |      |

Pipeline, runner, ordem e rollback: `docs/infrastructure/cicd.md`.
Ambiente novo: `docs/runbooks/provisionar-ambiente.md`.
