# Security Policy

## Reportando uma vulnerabilidade

Se você encontrar uma vulnerabilidade de segurança no BrandPlay, reporte
diretamente para a equipe responsável pelo projeto, sem abrir uma issue
pública. Descreva o cenário, os passos para reproduzir e o impacto potencial
(quais dados de quais organizações/patrocinadores poderiam ser expostos).

## Superfícies sensíveis do BrandPlay

- **RLS por organização.** Toda tabela de domínio é protegida por Row Level
  Security baseada em `is_org_member(organization_id)` /
  `has_org_role(organization_id, roles)` (`supabase/migrations/0004_functions.sql`
  e `0005_rls_policies.sql`). Um usuário só acessa organizações das quais é
  membro ativo — nunca "a organização atual", que não existe como conceito de
  banco (ver ADR-0002).
- **Edge Functions** (`supabase/functions/`). Recebem o JWT do usuário, devem
  derivar `user.id` dele e escopar toda consulta por organização. Nunca devem
  confiar em `organization_id`/`user_id` vindos do corpo da requisição.
  Funções de IA (`ai-assistant`, `score-leads`, `generate-proposal-ai`, entre
  outras) chamam a Anthropic API diretamente (ADR-0003) —
  `ANTHROPIC_API_KEY` só existe nesse ambiente server-side.
- **Portal do patrocinador.** Usuários com `sponsor_portal_access` ativo
  acessam contratos, entregas, parcelas, propostas e documentos de **um**
  patrocinador específico, sem serem membros da organização dona dele. É um
  escopo de acesso intencionalmente cross-tenant, mas restrito por
  `sponsor_id` — qualquer policy nova nessa superfície precisa manter esse
  escopo estreito.
- **Cobrança** (ADR-0007). Estado de assinatura e faturas é escrito só pelo
  servidor: `billing-webhook` (autenticado pela assinatura do Stripe — sem
  `STRIPE_WEBHOOK_SECRET` recusa tudo) e `manage-billing` (JWT + owner/admin
  ativo na organização, conferido em `organization_members`). As tabelas
  `billing_*` não aceitam escrita de `authenticated`, então ninguém se dá um
  plano ou estende o próprio teste pela API. Limites de plano são gatilhos no
  banco, não verificação de tela.
- **Media Kit público** (`/p/:slug`, `portal/src/pages/PublicMediaKit.tsx`). Única
  rota que aceita leitura anônima (`anon`) de propriedades publicadas e
  insert público de leads. Qualquer dado exposto ali é público por definição
  — nunca adicione um campo a essa página ou às policies `*_public_read` sem
  confirmar que ele deveria mesmo ser visível sem login.

## O que nunca deve vazar

- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`
- JWT secret, senha do Postgres, qualquer credencial de infraestrutura
- Tokens de sessão, cookies, headers de autorização em logs

Nenhuma dessas credenciais deve aparecer em código versionado, variável com
prefixo `VITE_` (tudo com esse prefixo é público no bundle do frontend), log,
mensagem de commit ou Pull Request.

## Princípios gerais

Nunca commitar secrets de produção, credenciais de banco, chaves de API ou
arquivos `.env` reais.

Operações privilegiadas permanecem server-side (Edge Functions), nunca no
frontend.

Dado de organização exige autorização explícita e/ou RLS — nunca um ou outro
isoladamente como única barreira quando o outro é viável.

Webhooks externos (quando existirem) devem validar autenticidade e payload,
ser idempotentes e persistir os IDs de evento já processados.

Isolamento de organização é um invariante de segurança, não uma conveniência
de filtro de UI.

Dado de negócio de produção não deve ser removido fisicamente por operações
normais de usuário — preferir desativação lógica (ver `.claude/rules/supabase.md`).
