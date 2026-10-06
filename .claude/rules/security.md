# Segurança

## Princípio

Nunca confiar no frontend para autorização. O frontend controla UX
(esconder um botão, desabilitar uma ação); a autorização real vive na RLS do
Postgres e nas Edge Functions.

## Checklist de autorização

Antes de implementar ou alterar qualquer operação que leia ou escreva dado de
domínio, responda explicitamente:

1. O usuário está autenticado?
2. O usuário está autorizado para este tipo de operação (papel compatível)?
3. O recurso pertence à organização (ou ao patrocinador, no caso do portal) à
   qual o usuário tem acesso?
4. A operação (SELECT/INSERT/UPDATE/DELETE) é permitida para o papel do
   usuário nessa organização?

Não confiar em `organization_id`, `user_id` ou papel enviados pelo frontend no
corpo da requisição. Em Edge Functions, derive `user.id` do JWT validado, e
consulte `organization_members`/`sponsor_portal_access` para confirmar
associação e papel — nunca aceite esses dados "prontos" vindos do client.

## Secrets

Nunca ler, imprimir ou modificar secrets reais sem necessidade explícita para
a tarefa. Não acessar `.env`, `.env.*`, certificados, chaves SSH ou arquivos
de credenciais fora do necessário.

Nunca inserir secrets em código, logs, commits, PRs ou mensagens de erro.

`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` e `RESEND_API_KEY` só podem
existir em Edge Functions / ambiente server-side. Nunca com prefixo `VITE_`
(tudo que tem esse prefixo é público no bundle) e nunca no `useEffect` de um
componente React.

A anon/publishable key (`VITE_PUBLIC_SUPABASE_ANON_KEY`) pode ser pública —
ela só é segura porque toda tabela de domínio tem RLS. Se uma tabela nova não
tiver RLS, essa chave deixa de ser segura para ela.

## Input

Toda entrada externa é não confiável: parâmetros de rota, query strings, body
de requisição, uploads e headers relevantes devem ser validados (zod no
frontend, validação equivalente nas Edge Functions) antes de uso.

## Logs

Nunca registrar: senha, token, cookie, header de autorização, service role,
CPF/CNPJ completo ou qualquer dado pessoal sensível do patrocinador/contato.
O `logBackendDbError`/`errorReporter` existentes devem ser usados para
telemetria de erro — confira que não estão vazando payload sensível ao
estender esse fluxo.

## Superfícies sensíveis do BrandPlay

- **RLS por organização** (`is_org_member`/`has_org_role`) — ver
  `.claude/rules/supabase.md` e `CLAUDE.md` seção 6.
- **Portal do patrocinador** (`sponsor_portal_access`) — acesso cross-tenant
  deliberado e restrito; qualquer policy nova para uma tabela acessível pelo
  portal precisa ser tão específica quanto as existentes (escopada por
  `sponsor_id`, nunca por organização inteira).
- **Media Kit público** (`/p/:slug`, `portal/src/pages/PublicMediaKit.tsx`) — única
  superfície que aceita leitura anônima (`anon`) e insert público (formulário
  de lead). Qualquer alteração nessa página ou nas policies `*_public_read`
  precisa considerar que é acessível sem login, por qualquer visitante da
  internet — nunca exponha ali um campo que não esteja explicitamente
  destinado a ser público.
- **Edge Functions de IA** (`ai-assistant`, `score-leads`,
  `generate-proposal-ai`, etc.) — em migração para `ANTHROPIC_API_KEY` (ver
  ADR-0003). Todas processam dado de organização; confirme que continuam
  escopando por `organization_id` derivado do usuário autenticado, não do
  prompt ou de parâmetro solto no body.

## Dependências

Antes de adicionar uma dependência nova: verificar se já existe solução
equivalente instalada, avaliar manutenção do pacote, avaliar riscos de
supply-chain e evitar pacotes desnecessários.
