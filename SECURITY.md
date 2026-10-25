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
  Funções de IA de produto (`ai-assistant`, `score-leads`, `generate-proposal-wizard`,
  entre outras) passam pela camada `_shared/ai/` (ADR-0010): credencial por
  organização (OpenAI, Gemini ou Anthropic), guardas de orçamento e registro em
  `ai_usage_events`. Chaves de fornecedor ficam cifradas em `ai_credentials`;
  a Edge Function `admin-ai` grava e testa credenciais (superadmin). Nunca
  exponha `AI_KEYS_MASTER_KEY`, `AI_DEFAULT_API_KEY` nem chaves de cliente no
  client (`VITE_*`) ou em logs.

  O despachante `main` **não** verifica JWT (nada lê `VERIFY_JWT`, e o runtime
  sobe sem `--verify-jwt`): cada função valida o usuário por conta própria com
  `auth.getUser()` — direto, ou pelo `autenticar()` de
  `supabase/functions/_shared/ai/funcao.ts` nas funções de IA. Verificar no
  despachante não substituiria isso — a anon key é um JWT válido e está no
  bundle do portal, então "ter um JWT" não significa "estar logado". Sem usuário, de propósito, só três
  funções e um caminho do próprio despachante:
  `billing-webhook` (autentica pela assinatura do Stripe), `saude`
  (healthcheck, não lê nada), `report-error` (aceita relato de erro anônimo)
  e `GET /functions/v1/metricas` (não é diretório de função; o `main` responde
  contadores Prometheus se `EDGE_METRICS_TOKEN` estiver definido, e 404 se
  não estiver). O log transacional do despachante grava nomes de campo, nunca
  valores, senha ou `Authorization` (`docs/infrastructure/monitoring.md`).
  Função nova começa com `getUser()`; ficar fora dessa lista exige o motivo
  registrado aqui.

- **Busca de URL externa** (`fetch-social-stats`). Única função que faz
  requisição para uma URL vinda do usuário. Ela roda dentro da rede Docker do
  Supabase, então aceitar "qualquer http(s)" seria SSRF contra `kong`, `rest`,
  `meta`, `db`. Exige usuário logado e só busca `https://`, na porta padrão,
  em host do domínio da rede declarada ou subdomínio dele (lista em
  `supabase/functions/fetch-social-stats/busca.ts`); redirect é seguido à mão
  e revalidado a cada salto, com no máximo 2,5 MB e 10 s por link, e o erro
  volta como frase fixa, sem a mensagem do runtime. Função nova que busque
  URL externa segue o mesmo modelo: lista de hosts, nunca "qualquer URL".
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
- **Superadmin da plataforma** (ADR-0008, área `/admin`). Papel em
  `platform_admins`, lido por `is_platform_admin()`; só `service_role` e as
  funções de concessão escrevem ali, e `authenticated` não as executa — a
  concessão é operada à mão (`docs/runbooks/superadmin.md`), nunca pela API nem
  por migration. O superadmin lê a cobrança de todas as organizações e
  contagens de uso, pelas policies `*_platform_admin_read` e pelas funções
  `admin_*` (que recusam quem não é superadmin), mas **não** lê dados de
  domínio dos clientes. Toda ação administrativa vai para
  `platform_admin_audit_log`, imutável pela API. Ao estender essa área, mantenha
  as duas coisas: leitura mínima e registro de quem fez.
- **IA por organização** (ADR-0010, `/admin/ia`, `admin-ai`). Tabelas
  `ai_credentials`, `ai_org_settings`, `ai_usage_events`, `ai_model_prices`:
  `authenticated` não lê cifra nem escreve credenciais; owner/admin lê só
  consumo agregado (`ia_consumo_organizacao`); superadmin lê metadados via
  `admin_ia_*` e escreve via `admin-ai`. Prompts e anexos saem para o
  fornecedor da credencial em uso — tratar como subprocessador (IA-37).
  Operação: `docs/runbooks/ia.md`.
- **Media Kit público** (`/p/:slug`, `portal/src/pages/PublicMediaKit.tsx`). Única
  rota que aceita leitura anônima (`anon`) de propriedades publicadas e
  insert público de leads. Qualquer dado exposto ali é público por definição
  — nunca adicione um campo a essa página ou às policies `*_public_read` sem
  confirmar que ele deveria mesmo ser visível sem login.

## O que nunca deve vazar

- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_KEYS_MASTER_KEY` e chaves de API de fornecedores (`AI_DEFAULT_*`, chaves
  cadastradas em `ai_credentials`)
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
