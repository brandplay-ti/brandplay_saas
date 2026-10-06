# ADR-0002: Modelo de tenant (organização + RLS, multi-org por usuário)

Status: Accepted

## Contexto

O BrandPlay é multi-tenant: cada organização comercial que usa o produto
(`organizations`) precisa ter seus dados de pipeline, contratos, propostas e
patrocinadores isolados dos de qualquer outra organização.

Ao planejar esse isolamento, avaliamos como referência externa o modelo usado
pelo projeto `central-check` (não uma ADR deste repositório): lá, um usuário
opera dentro de exatamente **um** tenant ativo por sessão, resolvido por uma
função `account_atual()` no banco — o "tenant atual" é um conceito que existe
tanto na aplicação quanto, indiretamente, no contexto de autorização.

Esse modelo não se encaixa no BrandPlay pelo seguinte motivo de produto: aqui
é comum e esperado que uma mesma pessoa participe de **várias organizações**
ao mesmo tempo — por exemplo, um profissional de marketing esportivo que presta
serviço de gestão comercial para mais de um clube ou propriedade, cada um
como uma organização separada no sistema. Forçar "1 tenant ativo por sessão"
exigiria logout/login (ou um claim de JWT reemitido) toda vez que o usuário
quisesse trocar de organização, o que não é a experiência desejada.

## Decisão

O tenant do BrandPlay é a **organização** (`organizations`). Um usuário pode
pertencer a várias organizações simultaneamente, através de
`organization_members` (papel via enum `org_role`:
`owner`/`admin`/`comercial`/`operacional`/`financeiro`).

A "organização ativa" — qual organização o usuário está vendo agora na tela —
é **estado de frontend**, guardado em `localStorage`
(`src/hooks/useOrganization.tsx`, chave `active_organization_id`) e trocável
sem novo login (`switchOrganization`). Ela **não é** e nunca deve se tornar um
claim do JWT.

Consequência direta para a camada de autorização: como não existe "org ativa"
no banco, as policies de RLS não podem checar isso. Em vez disso, elas checam
uma pergunta mais ampla e mais segura — **"o usuário é membro ativo desta
organização (seja lá qual for)?"** — através de duas funções
(`supabase/migrations/0004_functions.sql`):

```sql
is_org_member(target_org_id uuid) -- true se auth.uid() é membro ativo de target_org_id
has_org_role(target_org_id uuid, allowed_roles text[]) -- idem, checando papel
```

O filtro "qual organização eu quero ver agora" continua sendo aplicado pelo
frontend (`.eq('organization_id', activeOrgId)` nas queries) — RLS garante
apenas que o usuário nunca consegue ler/escrever numa organização da qual não
é membro, não qual delas está com o seletor de organização apontando para
ela no momento.

Essa é uma divergência **deliberada** do padrão "1 tenant ativo" usado no
`central-check`: lá faz sentido porque o produto assume 1 conta ativa por
sessão; aqui não, porque multi-organização por usuário é um requisito real do
domínio de patrocínio esportivo.

## Consequências

Positivas:

- Usuário troca de organização instantaneamente na UI, sem novo login.
- RLS não depende de o frontend "avisar" corretamente qual organização está
  ativa — a segurança vale para todas as organizações do usuário, sempre.
- Um bug de frontend que mostre a organização errada na tela é um bug de UX,
  não uma falha de isolamento (a policy nunca liberaria dado de uma
  organização da qual o usuário não é membro, independentemente do que o
  `localStorage` diz).

Negativas / pontos de atenção:

- Toda query precisa lembrar de filtrar explicitamente por
  `activeOrgId` no client — RLS não faz esse filtro por você, ela só impede o
  vazamento entre organizações. Esquecer o filtro no frontend não é uma falha
  de segurança, mas gera uma tela que mistura dados de organizações diferentes
  às quais o usuário pertence.
- Linhas com `organization_id = null` ficam inacessíveis sob essas policies
  (nenhum "membro de organização nenhuma" existe) — um bug de aplicação que
  esqueça de popular `organization_id` no insert esconde a linha
  silenciosamente em vez de falhar visivelmente. Ver
  `supabase/migrations/SCHEMA_NOTES.md`.
- O portal do patrocinador (`sponsor_portal_access`) é uma exceção
  intencional a este modelo: dá acesso cross-tenant restrito por
  `sponsor_id`, não por organização — não deve ser confundido com o
  mecanismo de tenant em si.

## Relacionadas

- ADR-0001 (sair do Lovable Cloud)
- `CLAUDE.md` seção 6 (Isolamento de organização)
- `.claude/rules/supabase.md`
- `supabase/migrations/0004_functions.sql`, `0005_rls_policies.sql`
