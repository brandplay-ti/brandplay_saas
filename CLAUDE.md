# CLAUDE.md

## 1. Objetivo

Este documento define as regras de domínio, arquitetura, segurança, banco,
testes, Git e CI/CD que devem ser seguidas pelo Claude Code neste projeto.

O BrandPlay é um SaaS de gestão de patrocínio esportivo: organizações
comerciais (`organizations`) cadastram propriedades esportivas
(`sports_properties`), captam patrocinadores (`sponsors`), conduzem
oportunidades num pipeline comercial (`opportunities`), fecham contratos
(`contracts`) com parcelas (`installments`) e cotas de patrocínio
(`sponsorship_tiers`/`tier_sales`), executam entregas (`deliveries`) e emitem
propostas (`proposals`). Um patrocinador pode acompanhar tudo isso por um
portal próprio, sem ser membro da organização.

O projeto nasceu no Lovable Cloud (schema só existente remotamente, IA atrás
de um gateway proprietário, domínio `.lovable.app`) e está migrando para
arquitetura própria: Supabase self-hosted em Docker + VPS própria, seguindo o
mesmo padrão de infraestrutura já validado no projeto de referência
`central-check`. O histórico dessa saída está na ADR-0001.

Antes de realizar alterações:

1. Entenda a arquitetura existente.
2. Procure código semelhante antes de criar novas abstrações.
3. Não introduza dependências sem justificar a necessidade.
4. Não altere contratos existentes (tipos, RPCs, Edge Functions, policies) sem
   avaliar impacto.
5. Execute as validações disponíveis após as alterações.
6. Nunca considere uma tarefa concluída sem evidências de validação.

Nunca invente regras de negócio ambíguas silenciosamente. Em caso de dúvida,
pergunte ou registre explicitamente a suposição adotada — como já foi feito em
`supabase/migrations/SCHEMA_NOTES.md` para o schema reconstruído.

---

## 2. Fontes de verdade

Em caso de conflito, vale a ordem abaixo:

1. Requisitos atuais do usuário
2. `docs/business/` (quando existir — regras de domínio explícitas)
3. `docs/adr/`
4. `docs/security/` (quando existir) e `SECURITY.md`
5. `docs/architecture/` (quando existir)

Na ausência de um `docs/business/`, a fonte de verdade do **modelo de dados**
atual é `supabase/migrations/SCHEMA_NOTES.md` — ele documenta, tabela por
tabela, todas as suposições e divergências assumidas ao reconstruir o schema a
partir de `portal/src/integrations/supabase/types.ts` (ver ADR-0004). Leia-o antes de
mexer em RLS, migrations ou em qualquer tabela cujo comportamento pareça
ambíguo.

Este arquivo complementa `SECURITY.md` e os arquivos em `.claude/rules/`.

---

## 2.1 Estrutura do repositório

Monorepo no padrão do central-check (ADR-0006,
`docs/infrastructure/padrao-de-projeto.md`):

```
.claude/            regras e skills do Claude Code
.github/workflows/  ci.yml (portal + migrations) e deploy.yml (manual, VPS)
docs/               adr/, architecture/, infrastructure/, runbooks/
docker/             compose único do Supabase (local/hml/produção) + files/volumes
portal/             aplicação React (workspace npm) — Dockerfile, nixpacks.toml
  src/
    pages/          rotas (dashboard, portal do patrocinador, onboarding, public)
    components/     componentes de UI (ui/ = shadcn, demais = por feature)
    hooks/          hooks de domínio e integração (useAuth, useOrganization, ...)
    lib/            utilitários e helpers puros
    integrations/supabase/  client e types.ts gerados
  e2e/              testes Playwright
  scripts/          guardas de build (checar-build, checar-node)
supabase/
  migrations/       schema versionado (fonte única de verdade do banco)
  lovable-migrations/  migrations originais do Lovable — referência, não aplicadas
  functions/        Edge Functions (Deno), assadas na imagem do edge-runtime
  seed/             usuário de exemplo — SÓ local
  tests/            testes de segurança/RLS
  tools/            migrate, chaves, bundle, checar-supabase, migração do Lovable
```

O npm roda em workspaces: os comandos do portal (`dev`, `build`, `lint`,
`type-check`, `test`, `test:e2e`) são chamados da **raiz** e delegados para
`portal/`. Os comandos de infraestrutura (`supabase:*`) vivem na raiz.

---

## 3. Stack

### Frontend

- React 18 + TypeScript + Vite
- react-router-dom v6
- Tailwind CSS + shadcn/ui (Radix) — **não** criar componentes de UI do zero
  quando já existe um equivalente em `portal/src/components/ui/`
- react-hook-form + zod para formulários e validação
- @tanstack/react-query — já instalado, mas subutilizado: a maior parte das
  telas hoje busca dados via `useEffect` + `useState` direto contra o
  Supabase. Isso é dívida técnica conhecida (ver `.claude/rules/frontend.md`);
  código **novo** deve preferir react-query.
- Produto e domínio 100% em português do Brasil (PT-BR). Não há i18n — não
  introduza `i18next` ou equivalente sem pedido explícito.
- ESLint + TypeScript estrito

### Backend / BaaS

- Supabase self-hosted (ADR-0001): PostgreSQL, Auth, Storage, Edge Functions
  (Deno), Row Level Security
- Multi-tenant por `organization_id` + RLS baseada em `is_org_member(org_id)` /
  `has_org_role(org_id, roles)` (ver seção 6 e ADR-0002)

### Integrações

- Anthropic API (`ANTHROPIC_API_KEY`) para as funcionalidades de IA — em
  migração do gateway proprietário do Lovable (ADR-0003). Enquanto a migração
  não terminar, pode haver Edge Functions ainda referenciando o gateway antigo;
  não assuma que todas já foram convertidas sem checar o arquivo.
- Resend (e-mail transacional) — chave apenas em Edge Functions.

### Infraestrutura

- GitHub + GitHub Actions (`.github/workflows/`, ver `docs/infrastructure/cicd.md`)
- VPS própria com **Dockploy** atrás de Traefik (ADR-0006): por ambiente, um
  serviço Compose do Supabase e uma aplicação do portal, no mesmo projeto
  (`docs/architecture/deployment.md`). Homologação publica da branch `hml`,
  produção da `main`; `dev` é a branch de integração.
- Docker e Docker Compose: `docker/supabase/docker-compose.yml` é o **mesmo**
  em local, homologação e produção; só as variáveis mudam.

**A configuração de containers nos ambientes hospedados é feita direto no
Dockploy** — variáveis, segredos, domínios, TLS, volumes. Nenhum arquivo deste
repositório descreve produção: editar o compose local não muda produção, e
mudança no Dockploy não passa por PR. Nunca deduza a configuração de produção
a partir do `.env` local, e nunca acesse a VPS sem autorização explícita.

Enquanto uma ferramenta de validação não existir no projeto (CI, testes E2E de
um fluxo específico etc.), não afirme que a validação correspondente foi
executada. Proponha a criação, se fizer sentido para a tarefa.

### Comandos

```bash
npm run dev                    # servidor de desenvolvimento (Vite)
npm run build                  # build de produção
npm run lint                   # ESLint
npm run type-check             # tsc --noEmit
npm test                       # Vitest (unitário)
npm run test:e2e               # Playwright

npm run supabase:chaves        # gera os segredos do stack local (cole em docker/supabase/.env)
npm run supabase:up            # sobe o Supabase local (Docker)
npm run supabase:migrate       # aplica migrations pendentes
npm run supabase:migrate:status
npm run supabase:seed          # usuário de exemplo (só local)
npm run supabase:test          # testes de segurança/RLS (supabase/tests/seguranca.sql)
npm run supabase:down / :reset
npm run supabase:bundle        # migrations achatadas para o SQL Editor do Studio
npm run supabase:checar -- <url> <anon_key> [--portal <url>]   # diagnóstico de um ambiente
```

Portas locais (bloco próprio, convive com o central-check): portal 8080, API
8010, Studio 54325, Postgres 54324, Redis 6380, Mailpit 8026.

### Convenções de teste

- Testes unitários ficam ao lado do código (`*.test.ts`/`*.test.tsx`) e não
  acessam rede: faça mock de `@/integrations/supabase/client`.
- Testes E2E usam o Supabase local (`docker/supabase`), nunca dados de
  produção.

---

## 4. Princípios

Priorize, nesta ordem:

1. Segurança (isolamento de organização em primeiro lugar)
2. Simplicidade
3. Manutenibilidade
4. Testabilidade
5. Performance
6. Baixo acoplamento

Não implemente uma abstração apenas porque parece arquiteturalmente elegante.
Prefira soluções consistentes com o código existente (mesmo quando esse código
tem dívida técnica conhecida — corrija a dívida na tarefa que já está mexendo
ali, não de forma oportunista em tarefas não relacionadas).

---

## 5. Processo obrigatório para alterações

Antes de editar código:

1. Leia a documentação relevante (`docs/adr/`, `SECURITY.md`,
   `supabase/migrations/SCHEMA_NOTES.md`).
2. Inspecione os arquivos relacionados (hook, página, Edge Function, migration).
3. Identifique dependências e impactos de domínio, segurança, banco e RLS.
4. Verifique testes existentes.
5. Verifique regras do Supabase (RLS, policies, roles) relacionadas à
   funcionalidade — toda tabela de organização tem uma estratégia de RLS
   definida em `0005_rls_policies.sql`; entenda o padrão aplicado antes de
   estender.
6. Verifique se existem migrations relacionadas.
7. Faça a menor alteração necessária.

Depois de editar:

1. Execute lint (`npm run lint`).
2. Execute typecheck (`npm run type-check`).
3. Execute testes unitários (`npm test`).
4. Execute build (`npm run build`).
5. Execute testes E2E quando aplicável (`npm run test:e2e`).
6. Valide migrations (`npm run supabase:migrate:status`) quando o banco mudou.
7. Revise o diff.
8. Verifique se nenhum segredo foi introduzido.
9. Atualize a documentação (ADR, `SCHEMA_NOTES.md`, `SECURITY.md`) quando o
   comportamento ou a arquitetura mudar.
10. Informe exatamente o que foi validado.

Nunca diga que algo foi validado se o comando correspondente não foi
executado.

---

## 6. Isolamento de organização (regra crítica)

O tenant do BrandPlay é a **organização** (`organizations`), não o usuário e
não uma "conta" abstrata separada.

Diferença deliberada em relação ao padrão mais comum de "1 tenant ativo por
sessão" (usado, por exemplo, no projeto de referência `central-check` via
`account_atual()`): aqui um usuário pode pertencer a **várias** organizações
ao mesmo tempo (`organization_members`, papel via enum `org_role`:
`owner`/`admin`/`comercial`/`operacional`/`financeiro`). A "organização ativa"
mostrada na UI é **estado de frontend** (`localStorage`, ver
`portal/src/hooks/useOrganization.tsx`), nunca um claim do JWT. Ver ADR-0002 para o
raciocínio completo.

Consequência direta para RLS e Edge Functions:

- As policies **nunca** verificam "é a organização atual" — isso não existe
  no banco. Elas verificam **"o usuário é membro ativo desta organização"**,
  via `is_org_member(organization_id)`, ou **"o usuário tem um dos papéis
  exigidos nesta organização"**, via `has_org_role(organization_id, roles)`
  (ambas definidas em `supabase/migrations/0004_functions.sql`, usam
  `auth.uid()` internamente).
- O filtro "qual organização estou vendo agora" é responsabilidade do
  **frontend** (`.eq('organization_id', activeOrgId)`) — RLS garante que o
  usuário só pode ver organizações das quais é membro, não qual delas está
  "ativa" no momento.
- Nunca implemente validação de negócio entre organizações diferentes (nunca
  consulte outra organização para checar unicidade, existência ou
  disponibilidade de recursos).
- Nunca crie foreign keys entre organizações distintas.
- Toda tabela de domínio precisa de `organization_id` (direto ou herdado de um
  registro pai) e de uma policy de RLS correspondente — ver
  `.claude/rules/supabase.md` para os padrões já estabelecidos em
  `0005_rls_policies.sql`.
- Uma linha com `organization_id = null` fica **inacessível** sob as policies
  atuais (proposital — nenhuma linha "órfã" deve vazar). Isso significa que um
  bug de aplicação que esqueça de popular `organization_id` esconde a linha em
  vez de dar erro visível: ao criar um insert novo, sempre confirme que
  `organization_id` é preenchido a partir do contexto do usuário, nunca vindo
  cru do formulário.

O isolamento de organização é um invariante de segurança, não apenas uma regra
de modelagem ou de UX.

### Portal do patrocinador (acesso cross-tenant limitado, por design)

O portal do patrocinador é uma exceção deliberada ao modelo acima: um usuário
com acesso via `sponsor_portal_access` (`app_role = 'patrocinador'`) enxerga
contratos, entregas, parcelas, propostas e documentos de um patrocinador
específico **sem** ser `organization_member` da organização dona daquele
patrocinador. Isso é implementado por policies próprias
(`has_sponsor_portal_access`, seção 9 de `0005_rls_policies.sql`) e não deve
ser confundido com o modelo de tenant — é um escopo de acesso adicional e mais
restrito (por patrocinador, não por organização inteira), nunca um atalho
genérico para "ver dados de qualquer organização".

---

## 7. Segurança

Nunca:

- autorizar no frontend — verificações de UI são experiência do usuário, nunca
  fronteira de segurança;
- desabilitar RLS para fazer uma funcionalidade funcionar;
- aceitar `organization_id`, `user_id` ou papel vindos do corpo da requisição
  sem validar contra o JWT/sessão autenticada;
- commitar secrets ou colocar tokens no código;
- expor `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` ou
  qualquer credencial privilegiada no client (nunca com prefixo `VITE_`);
- logar dado sensível (senha, token, header de autorização, service role,
  documento pessoal);
- expor dados de outra organização ou de outro usuário.

Toda Edge Function que recebe uma requisição autenticada deve, nesta ordem:

1. validar o token (JWT) recebido;
2. derivar `user.id` do próprio token — nunca de um campo do body;
3. escopar a operação pela(s) organização(ões) da qual esse usuário é membro
   (consultando `organization_members`, não confiando em um `organization_id`
   enviado pelo client);
4. checar se o papel do usuário naquela organização permite a operação.

Ver `SECURITY.md` e `.claude/rules/security.md` para o checklist completo e as
superfícies sensíveis do produto (media kit público, portal do patrocinador).

---

## 8. Supabase

### Migrations

- Nunca editar uma migration já aplicada. Toda alteração de schema é uma nova
  migration numerada (`000N_descricao.sql`) em `supabase/migrations/`.
- Migrations devem ser versionadas, reproduzíveis, ter nome descritivo e
  evitar operações destrutivas sem confirmação explícita.
- Nunca considere uma alteração manual no banco (inclusive via Studio) como
  alteração definitiva da aplicação.

### RLS

- Toda tabela que contém dado de organização precisa de RLS habilitada e de
  policy explícita de SELECT/INSERT/UPDATE/DELETE — sem exceção.
- Ao criar uma tabela nova, siga um dos padrões já estabelecidos em
  `0005_rls_policies.sql` (ver `.claude/rules/supabase.md` para o detalhe de
  cada um): tenant por linha própria, tenant herdado de um registro pai,
  escopo por usuário, ou catálogo público.
- Nunca desabilite RLS para viabilizar uma feature.

### Auth

- A `service_role` nunca é exposta ao browser.
- Variáveis `VITE_*` são públicas por definição — nunca coloque segredo nelas.

---

## 9. Git

Commits seguem o padrão convencional, em português:

```
<tipo>(<escopo>): <descrição>
```

Tipos permitidos: `feature`, `fix`, `refactor`, `chore`, `test`, `docs`,
`perf`, `build`, `ci`, `security`.

Exemplos:

```
feature(contratos): adiciona geracao de parcelas automaticas
fix(portal): corrige acesso do patrocinador a documentos revogados
chore(migrations): adiciona indice em contracts.organization_id
```

Não criar commits automaticamente sem solicitação explícita. Não executar sem
confirmação explícita: `git push --force`, `git reset --hard`, `git clean
-fd`. Nunca reescrever histórico compartilhado.

---

## 10. CI/CD

```
feature/* → PR → dev → PR → hml (homologação) → PR → main (produção)
```

- **CI** (`.github/workflows/ci.yml`): portal (lint não bloqueante por dívida
  herdada, type-check, test, build) e migrations (guarda destrutiva, banco
  limpo, idempotência, seed, testes de RLS).
- **CD**: o Dockploy publica cada ambiente a partir da branch dele. O
  workflow `Deploy (VPS)` é manual e **não escreve no banco** — só lista
  migrations pendentes, dispara o webhook do portal e faz health check.
- **Migrations são aplicadas à mão**, homologação primeiro, com backup antes,
  e antes de publicar portal que dependa delas
  (`docs/runbooks/primeira-carga.md`).
- Ambiente novo: `docs/runbooks/provisionar-ambiente.md`.

Não considere o deploy concluído porque o workflow foi iniciado: confira o
resultado e o health check. Deploy em produção nunca é feito a partir de uma
máquina local como parte do fluxo normal. Ver `.claude/rules/cicd.md`.

---

## 10.1 Produção

Produção é um ambiente protegido. Segredos (`JWT_SECRET`, `SERVICE_ROLE_KEY`,
`POSTGRES_PASSWORD`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, SMTP) vivem no
Dockploy; nunca proponha commitá-los nem copiá-los para o ambiente local.
Nunca execute alterações destrutivas diretamente em produção, e nunca use
dados reais de produção (ou exportações do Lovable em `.migracao-lovable/`)
em testes locais.

---

## 11. Definition of Done

Uma tarefa somente está concluída quando:

- [ ] implementação realizada;
- [ ] código revisado;
- [ ] lint executado;
- [ ] typecheck executado;
- [ ] testes executados;
- [ ] build executado;
- [ ] migrations criadas quando necessárias (nunca editando uma já aplicada);
- [ ] RLS e isolamento de organização avaliados;
- [ ] segurança avaliada (checklist de `.claude/rules/security.md`);
- [ ] diff revisado;
- [ ] documentação (ADR, `SCHEMA_NOTES.md`, `SECURITY.md`) atualizada quando
      necessário.

Ao finalizar uma tarefa, informe:

### Alterações

Resumo das alterações realizadas.

### Validações

Lista dos comandos executados e respectivos resultados.

### Riscos

Possíveis riscos ou pontos que precisam de revisão manual.

### Próximos passos

Somente quando existirem.
