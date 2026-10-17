# Plano de ação: alinhar o brandplay-saas ao padrão SaaS do central-check

- **Data**: 2026-10-15
- **Status**: implementado em 2026-10-16 na branch `fix/telas-e-remocao-lovable`
  (fases A a G). Decisão registrada na ADR-0008; operação em
  `docs/runbooks/superadmin.md` e `docs/runbooks/email.md`. Pendente da seção 4:
  o fluxo self-service com Stripe ponta a ponta, que depende de chaves de teste.
- **Repositório alvo**: `brandplay-saas` (decisão do usuário). O `brandplay-app` fica como legado.
- **Base**: branch `fix/telas-e-remocao-lovable`, **depois** do commit do trabalho de cobrança em aberto.
- **Referência**: `central-check/v2`: migrations 0006, 0026, 0027, 0058; `portal/src/pages/admin`; funções `admin-planos` e `liberar-acesso`; ADR-0005 (e-mail).

## 1. Auditoria

| Requisito | Situação no brandplay-saas |
|---|---|
| Banco multitenant | ✅ Por organização, com RLS e testes. Diferença deliberada: um usuário pode estar em várias organizações (ADR-0002) |
| Conta admin da plataforma | ❌ Não existe superadmin, área administrativa, relatório de clientes nem financeiro da plataforma |
| Contratação self-service | ✅ Cadastro, organização, 14 dias de teste, `Plan.tsx`, `PublicPricing` e checkout via `manage-billing`. A validar ponta a ponta com chaves de teste do Stripe |
| Isolamento entre contas com plano | ✅ RLS por organização. `billing_*` legível só por owner/admin da própria organização. Testes em `seguranca.sql` e `cobranca.sql` |
| Stripe | ✅ ADR-0007, `manage-billing` e `billing-webhook`. Ainda não está em `dev` |
| Resend | ⚠️ Chamado direto (`fetch`) em 3 funções, sem a camada `EmailService` do padrão (ADR-0005 do central-check). E-mails de auth saem por SMTP do GoTrue |

## 2. Decisões de desenho

1. **Superadmin em tabela própria** (`platform_admins`), não numa coluna de `profiles`. A policy `profiles_own_write` deixa o usuário editar o próprio perfil, então uma coluna ali permitiria autoconcessão. Escrita só por `service_role`.
2. **Concessão fora das migrations.** No central-check, a migration `0054` cria o superusuário com senha escrita e roda também em produção; isso não será copiado. Concessão por script SQL operado à mão (`supabase/tools/conceder-superadmin.sql`, com e-mail como parâmetro). Superadmin com senha só no seed local.
3. **Menor privilégio.** O superadmin lê `organizations`, `billing_*` e **contagens** de uso, via funções `SECURITY DEFINER` que checam `is_platform_admin()`. **Não** ganha leitura dos dados de domínio dos clientes (patrocinadores, contratos, propostas). Impersonação fica fora do escopo.
4. **O Stripe continua fonte da verdade financeira.** O superadmin lê a projeção (`billing_subscriptions`, `billing_invoices`) e nunca a edita. Apuração como no central-check 0027: realizado = faturas pagas no mês de pagamento; MRR = `ativa` + `inadimplente`; `trialing` e `incompleta` fora.
5. **Toda ação administrativa é auditada** (`platform_admin_audit_log`): quem, quando, organização, ação, antes e depois, comentário.

## 3. Fases

| Fase | Entrega | Arquivos |
|---|---|---|
| A. Fundamento | Tabela `platform_admins`, função `is_platform_admin()`, log de auditoria, RLS (leitura do próprio vínculo; escrita só `service_role`), script de concessão, superadmin no seed local | `0027_superadmin_da_plataforma.sql`, `tools/conceder-superadmin.sql`, `seed/00-seed.sql` |
| B. Leitura administrativa | Policies `<billing_*>_platform_admin_read`; funções `admin_clientes()`, `admin_cliente_detalhe(org)`, `admin_faturamento_realizado(meses)`, `admin_faturamento_projetado()` | `0028_leitura_administrativa.sql` |
| C. Gestão de planos | Edge Function `admin-plans` (JWT → `is_platform_admin` → valida → grava `billing_plans` → cria produto/preço no Stripe; preço novo arquiva o anterior, porque preço no Stripe é imutável), com auditoria | `functions/admin-plans/`, compose e `.env.example` |
| D. Liberação de acesso | `admin_liberar_acesso(org, horas, comentario)` em `billing_access_grants` (origem `superadmin`, comentário obrigatório) e `admin_estender_teste(org, dias, comentario)` | `0029_liberacao_pelo_superadmin.sql` |
| E. Área `/admin` | Layout e guarda de UX (a segurança fica no banco), Visão geral (KPIs), Clientes (lista com filtros de status e plano), Cliente (detalhe, faturas, liberar acesso, estender teste), Planos (CRUD), Faturamento (realizado e projetado). Item de menu só para superadmin. react-query em todo código novo | `portal/src/pages/admin/*`, `portal/src/hooks/usePlatformAdmin.ts` |
| F. E-mail | `functions/_shared/email.ts`: `EmailService` com adaptador Resend, remetente e `APP_URL` por configuração, falha registrada sem quebrar a operação. Migrar as 3 funções. Runbook: SMTP do GoTrue via Resend nos ambientes hospedados | `_shared/email.ts`, 3 funções, `docs/runbooks` |
| G. Testes e documentação | SQL: superadmin lê toda a cobrança; owner comum não lê a de outra organização; funções admin recusam não-superadmin; autoconcessão impossível; liberação auditada. Unitários dos hooks e formatadores. ADR-0008 (superadmin da plataforma), `SECURITY.md`, `.claude/rules/supabase.md`, `docs/business/cobranca.md` | `tests/superadmin.sql`, docs |

## 4. Validação prevista

- `npm run lint`, `type-check`, `test` e `build`.
- Ciclo limpo num projeto Compose **isolado** (nunca no stack local do usuário): reset, up, migrate (2x), seed, test.
- Navegação logada como superadmin e como owner comum, listando requisições com status >= 400.
- Fluxo self-service ponta a ponta (cadastro → teste → checkout) **com chaves de teste do Stripe fornecidas pelo usuário**. Sem elas, só a parte sem Stripe.

## 5. Fora do escopo (registrar como pendência)

- Impersonação de cliente pelo superadmin.
- Pix avulso de fatura (ADR-0007, item 7).
- Identidade visual da sessão anterior (logo, cores, nome), que está só no `brandplay-app` (PR #2): portar para o `brandplay-saas` numa tarefa própria.

## 6. Como ficou

| Fase | Entregue |
|---|---|
| A | `0027_superadmin_da_plataforma.sql` (`platform_admins`, `is_platform_admin()`, `platform_admin_audit_log`, `platform_admin_grant/revoke`), `supabase/tools/conceder-superadmin.sql` e `revogar-superadmin.sql`, scripts `npm run supabase:superadmin[:revogar]`, superadmin no seed local |
| B | `0028_leitura_administrativa.sql`: policies `*_platform_admin_read` e `admin_clientes()`, `admin_cliente_detalhe()`, `admin_faturamento_realizado()`, `admin_faturamento_projetado()` |
| C | Edge Function `admin-plans` (create, update, sync); `ensurePlanPrice` passou para `_shared/billing.ts` e é usado também pelo checkout; o plano do teste não sai de venda |
| D | `0029_liberacao_pelo_superadmin.sql`: origem `superadmin` em `billing_access_grants`, `admin_liberar_acesso()`, `admin_revogar_liberacao()` (acréscimo: encerrar uma liberação dada por engano), `admin_estender_teste()` |
| E | `portal/src/pages/admin/*`, `portal/src/components/admin/*`, `usePlatformAdmin.ts`, `lib/platformAdmin.ts`; item de menu para superadmin; login sem organização vai para `/admin` |
| F | `_shared/email.ts` (`sendEmail`, adaptador Resend, remetente e `APP_URL` do ambiente); `manage-portal-access`, `manage-team-access` e `check-notifications` migradas. De quebra: templates escapam HTML, convites de equipe usam `APP_URL` em vez do `Origin` da requisição, o resumo de notificações deixou de se chamar "Scout" |
| G | `supabase/tests/superadmin.sql`, testes unitários de `lib/platformAdmin` e do hook, E2E `e2e/superadmin.spec.ts`, ADR-0008, `SECURITY.md`, regras, `docs/business/cobranca.md`, runbooks |
