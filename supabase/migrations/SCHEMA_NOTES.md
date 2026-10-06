# SCHEMA_NOTES — reconstrução do schema BrandPlay a partir de types.ts

> Desde a ADR-0006 o frontend vive no workspace `portal/`: os caminhos
> `src/...` citados abaixo estão hoje em `portal/src/...`.

Este schema (`0001_extensions.sql` … `0005_rls_policies.sql`) foi **inferido**
a partir de `src/integrations/supabase/types.ts` (~4446 linhas, lido por
completo), porque não há `supabase/migrations/` no repositório nem acesso ao
projeto remoto (Lovable Cloud) para rodar `supabase db pull`. O risco de
divergência em relação ao banco remoto real foi aceito conscientemente pelo
usuário. Este documento lista **todas** as suposições, riscos e pontos de
incerteza conhecidos, para que sejam revisados/corrigidos antes de considerar
este schema "fonte da verdade".

## Números

- **71 tabelas** reconstruídas em `0003_tables.sql` (o pedido original
  estimava "~65"; a contagem real no types.ts é 71).
- **16 enums** reconstruídos em `0002_enums.sql`, com valores **confirmados**
  (não é suposição — types.ts é gerado por introspecção do banco real, então
  os literais dos enums são texto fonte confiável).
- **1 view** (`crm_unlinked_records`) existe no banco remoto (bloco `Views`
  do types.ts) e **NÃO foi recriada** — não há como inferir a query SQL por
  trás de uma view apenas a partir do formato de suas colunas de saída
  (`created_at`, `entity_id`, `entity_type`, `label`, `organization_id`).
  Seria necessário reescrever essa lógica de negócio do zero; deixado como
  gap explícito.
- **~30 funções de negócio** (RPCs) aparecem no bloco `Functions` do
  types.ts (ex.: `generate_contract_installments`,
  `generate_contract_deliveries`, `merge_sponsors`, `sync_opportunity_stage`,
  `create_organization_with_owner`, `score_leads`, etc.). **Nenhuma delas foi
  reconstruída** — o Passo 4 da tarefa pedia apenas as funções de suporte a
  RLS (`is_org_member`, `has_org_role` e outras que as policies precisassem).
  Essas ~30 funções são lógica de negócio (a maioria provavelmente chamada
  pelas Edge Functions em `supabase/functions/`) e precisam ser reescritas
  separadamente antes do self-host funcionar por completo. Suas assinaturas
  já estão documentadas no types.ts original, o que ajuda a reimplementá-las.

## Divergência deliberada: funções de RLS com assinatura diferente do remoto

O types.ts original lista:
```
is_org_member: { Args: { _org_id: string; _user_id: string }; Returns: boolean }
has_org_role: { Args: { _org_id; _roles: org_role[]; _user_id }; Returns: boolean }
```
ou seja, no banco remoto essas funções recebem `_user_id` explicitamente
(uso típico: chamadas a partir de Edge Functions com service role, ou RPCs
client-side passando `auth.uid()` manualmente).

Neste schema reconstruído, criamos (em `0004_functions.sql`) versões com
assinatura **simplificada e mais segura para uso direto em policies de RLS**
— exatamente como pedido no Passo 3 da tarefa:
```
is_org_member(target_org_id uuid) -- usa auth.uid() internamente
has_org_role(target_org_id uuid, allowed_roles text[]) -- usa auth.uid() internamente
```
Isso é uma escolha deliberada (instruída explicitamente na tarefa), mas
diverge da assinatura do banco remoto. Se algum código client-side chamar
`supabase.rpc('is_org_member', { _org_id, _user_id })` esperando a assinatura
antiga, ele vai quebrar contra este schema. Não encontrei esse padrão de uso
no frontend (grep não indicou chamadas diretas a essas RPCs a partir de
`src/`), mas vale confirmar antes de ir para produção.

## organization_id: nullable e sem FK formal no remoto (mudança deliberada)

A quase totalidade das ~71 tabelas tem uma coluna `organization_id` que:

1. É **nullable** no types.ts (`string | null`) mesmo em tabelas onde,
   logicamente, toda linha deveria pertencer a uma organização. Mantivemos
   essa nullability no schema reconstruído (não forcei `not null`) porque
   não há garantia de que a aplicação sempre preenche o campo, e forçar
   `not null` sem certeza quebraria inserts existentes. **Risco**: sob as
   policies de RLS deste schema, qualquer linha com `organization_id = null`
   fica **inacessível** (nem membro, nem admin, ninguém vê) — isso é
   proposital (nenhuma linha "órfã" deve vazar), mas significa que um bug de
   aplicação que esqueça de popular `organization_id` vai silenciosamente
   esconder a linha em vez de dar erro. Recomendação: considerar `not null`
   depois de confirmar com dados reais que o campo é sempre populado.
2. **Não tinha uma foreign key formal** no banco remoto na maioria dos casos
   — no bloco `Relationships` do types.ts, apenas 5 tabelas mostravam FK
   explícita de `organization_id` para `organizations` (`organization_invites`,
   `organization_members`, `pipeline_funnels`, `pipeline_stage_slas`,
   `team_audit_log`). Em todas as outras ~50+ tabelas, `organization_id`
   aparentava ser uma coluna "solta" (sem integridade referencial formal).
   **Decisão tomada aqui**: adicionamos a FK `organization_id -> organizations(id)
   on delete cascade` em **todas** as tabelas que têm a coluna, como melhoria
   de integridade referencial. Isso é uma divergência intencional em relação
   ao remoto — se o objetivo for reproduzir o remoto 100% fielmente (bugs
   inclusos), essas FKs precisariam ser removidas.

## Enums usados como default: suposições de valor

Várias colunas têm `?` no tipo `Insert` (indicando que o banco tem um
`default`), mas o types.ts não revela qual é o valor literal do default. Os
seguintes defaults são **suposições** (marcadas também com comentário inline
no SQL de `0003_tables.sql`):

- `ai_conversations.title` → `'Nova conversa'`
- `ai_suggestions.priority` → `'media'`, `ai_suggestions.status` → `'pendente'`
- `assets.status` → `'disponivel'`
- `brandtrack_detections.exposure_type` → `'logo'`, `review_status` → `'pendente'`
- `brandtrack_event_brands.sponsor_status` → `'esperado'`
- `brandtrack_media.status` → `'pendente'`
- `contracts` (nenhum campo texto solto com default suposto — usa enums)
- `crm_tasks.task_type` → `'geral'`, `priority` → `'media'`, `status` → `'pendente'`
- `delivery_attachments.kind` → `'foto'`
- `error_reports.severity` → `'error'`, `source` → `'frontend'`
- `lead_scores.classification` → `'morno'`
- `notifications.priority` → `'media'`
- `opportunity_activities.activity_type` → `'tarefa'`, `status` → `'pendente'`
- `opportunity_comments.kind` → `'comentario'`
- `opportunity_contacts.contact_type` → `'decisor'`
- `organization_invites.status` → `'pendente'`, `role` → `'comercial'`
- `property_checklist_items.status` → `'pendente'`
- `property_events.event_type` → `'evento'`, `status` → `'agendado'`
- `property_leads.status` → `'novo'`
- `property_media.media_type` → `'foto'`
- `sponsor_documents.category` → `'outro'`
- `sponsor_invites.status` → `'pendente'`
- `sponsorship_tiers.level` → `'ouro'`
- `sports_properties.status` → `'ativo'`
- `sponsors.priority` (enum `sponsor_priority`) → `'C'` (poderia ser `'B'`; não há
  como confirmar sem o dado real)
- `tier_sales.status` → `'reservado'`

**Confirmados por evidência real** (não são suposições — encontrados no
código das Edge Functions em `supabase/functions/`):
- `organization_members.status` → `'ativo'` (e `'revogado'` ao remover),
  visto em `supabase/functions/manage-team-access/index.ts`.
- `organization_invites.expires_at` → `now() + interval '14 days'`, confirmado
  em `manage-team-access/index.ts` (`newExpiresAt = Date.now() + 14*24*60*60*1000`
  usado no *reenvio*; assumimos que a criação inicial usa o mesmo intervalo).
- `sponsor_invites.expires_at` → mesmo padrão de 14 dias, confirmado em
  `supabase/functions/manage-portal-access/index.ts`.
- `sponsor_portal_access.status` → `'ativo'`, confirmado no mesmo arquivo.
- `organizations.currency/locale/timezone` → defaults `'BRL'`/`'pt-BR'`/
  `'America/Sao_Paulo'` são suposição (não encontrados explicitamente no
  código), mas fortemente sugeridos pelo contexto 100% em português/Brasil de
  todo o app (enums em português, moeda BRL implícita em toda a UI).

## Tipos de dados: escolhas ambíguas

- **Campos de tempo de vídeo** em `brandtrack_detections`
  (`start_time`, `end_time`, `duration`) foram modelados como
  `numeric(10,3)` (segundos com precisão de milissegundo) em vez de
  `integer`, por serem timestamps de vídeo que plausivelmente precisam de
  precisão fracionária. `width`, `height`, `position_x`, `position_y` foram
  modelados como `integer` (pixels).
- `opportunity_comments.mentions` foi modelado como `uuid[]` (assumindo que
  são ids de membros mencionados via `@`). Poderia alternativamente ser
  `text[]` se o app armazenar nomes/e-mails livres em vez de ids.
- `contracts.custom_due_dates` mantido como `text[]` (formato original
  "string[]" no types.ts) em vez de `date[]`, por incerteza sobre o formato
  exato armazenado (poderia ser "DD/MM" em vez de data ISO completa).
- `proposals.valid_until` modelado como `timestamptz` (não segue o padrão de
  nome `*_date` das outras colunas de data, e o types.ts não deixa claro se é
  hora completa ou só data).
- Campos de tamanho de arquivo (`file_size`, `size_bytes`) foram modelados
  como `bigint` (não `integer`) para suportar arquivos grandes sem risco de
  overflow.
- `assets.exclusivity_terms`, `sponsors.locations`, `sports_properties.locations`,
  `sponsors.tags`, `sponsor_crm_profiles.tags`, `backend_error_logs.attempted_row_keys`,
  `sponsor_brandtrack_profiles.brand_colors`/`detection_aliases`,
  `brandtrack_event_brands.aliases` — todos mantidos como `text[]` (arrays de
  texto livre), consistente com o `string[]` do types.ts.

## organization_id: herdado vs. direto — tabelas onde a decisão não é óbvia

- `ai_messages` é a **única** tabela sem `organization_id` próprio que
  referencia uma tabela com `organization_id` (`ai_conversations`) — tratada
  com o padrão de herança (Padrão 2).
- `notifications` **tem** `organization_id` direto, mas foi tratada como
  **escopo por usuário** (Padrão 3: `user_id = auth.uid()`) em vez de
  tenant-by-row, porque uma notificação é pessoal — um admin da organização
  não deveria enxergar notificações de outro usuário só por serem da mesma
  org. Essa é uma decisão de design tomada aqui, não uma regra explícita da
  tarefa original; revisar se o comportamento esperado é outro.
- `user_dashboard_preferences` e `user_stage_probabilities` têm
  `organization_id` **e** `user_id` — tratadas com uma policy combinada
  (usuário E membro da organização), já que são preferências pessoais
  escopadas por organização.
- `user_roles` (papel de plataforma `app_role`: admin/comercial/patrocinador)
  não tem `organization_id` — é global ao usuário, não por organização.
  Modelado como Padrão 3 somente leitura (usuário só lê o próprio papel;
  nenhuma policy de escrita para `authenticated`, presumindo que a atribuição
  de `app_role` é feita por rotina administrativa/service role).

## RLS: papéis administrativos (owner/admin) restritos além do pedido literal

O Passo 3 pediu explicitamente restringir a escrita a owner/admin em:
`organizations` (update), `organization_invites` (insert/delete),
`contract_clause_templates` (write). Implementado exatamente assim, e
**estendido** pela mesma lógica ("ações administrativas") também para:
`organization_members` (insert/update/delete), `pipeline_funnels` e
`pipeline_stage_slas` (insert/update/delete), e `team_audit_log` (leitura e
inserção restritas a owner/admin, sem update/delete para ninguém via client).
Essas extensões não foram pedidas literalmente — revisar se o nível de
permissão está correto para o produto (por exemplo, se um usuário
`comercial` deveria poder criar um funil de pipeline).

## Bônus não pedido explicitamente: acesso público (Media Kit) e portal do patrocinador

Ao ler o código-fonte do frontend (não apenas o types.ts) encontrei duas
superfícies de acesso que não usam o modelo de `organization_members`:

1. **`src/pages/PublicMediaKit.tsx`** — página pública (sem login) que lê
   `sports_properties` (por `public_slug` + `is_published`), `property_media`,
   `sponsorship_tiers`, `tier_sales`, `tier_assets`, `asset_allocations`,
   `assets`, `asset_photos`, `contracts` (`sponsor_id, status`) e `sponsors`
   (`id, name, logo_path`), e faz **insert público** em `property_leads`
   (formulário "Quero ser patrocinador"). Isso só funciona se o RLS liberar
   leitura para o role `anon` nessas tabelas, com escopo limitado a
   propriedades publicadas. Adicionei essas policies em `0005_rls_policies.sql`
   (Seção 8) e as funções de apoio `is_property_published`,
   `is_asset_publicly_visible`, `is_tier_publicly_visible`,
   `is_sponsor_publicly_visible` em `0004_functions.sql`. **Atenção**: a
   policy `contracts_public_read` expõe `sponsor_id` e `status` de contratos
   ativos/vencendo de propriedades publicadas para qualquer visitante anônimo
   — isso reproduz o comportamento observado no código-fonte atual, mas é uma
   decisão de produto que vale confirmar com o time (pode ser um vazamento de
   informação comercial não intencional no app original).
2. **Portal do patrocinador** (`app_role = 'patrocinador'`, tabela
   `sponsor_portal_access`, páginas em `src/pages/portal/`) — usuários
   convidados para o portal de um patrocinador específico devem enxergar
   contratos/entregas/parcelas/propostas/documentos daquele patrocinador
   mesmo sem serem `organization_members`. Adicionei a função
   `has_sponsor_portal_access` e policies adicionais de `SELECT` (Seção 9)
   para `contracts`, `deliveries`, `delivery_attachments`, `installments`,
   `proposals`, `proposal_items`, `property_checklist_items`,
   `sponsor_documents`. Este é um mapeamento aproximado — não há como
   confirmar 100% quais telas exatas o portal usa sem revisar todo
   `src/pages/portal/` e `src/pages/field/` em detalhe (não foi feito por
   completo dentro do escopo desta tarefa). Revisar e ampliar/restringir
   conforme necessário.

## Buckets de Storage (confirmados por grep no código-fonte, não pura suposição)

Nenhuma migration de Storage foi criada (não fazia parte do Passo 4), mas os
nomes de bucket abaixo foram **confirmados via `grep` em `src/`**
(`supabase.storage.from("...")`), não inventados:

| Bucket | Uso observado | Público? (inferido pelo uso de getPublicUrl vs. createSignedUrl) |
|---|---|---|
| `asset-photos` | `asset_photos.storage_path`, `sports_properties.public_cover_path` | Público (getPublicUrl) |
| `property-media` | `property_media.storage_path` | Público (getPublicUrl) |
| `sponsor-logos` | `sponsors.logo_path`, `sponsor_brands.logo_path` | Público (getPublicUrl) |
| `org-logos` | `organizations.logo_path` | Público (getPublicUrl) |
| `delivery-evidence` | `delivery_attachments.storage_path`, `property_checklist_items.evidence_path` | Privado (createSignedUrl) |
| `contracts` | `contracts.file_path` | Privado (createSignedUrl) |
| `brandtrack-media` | `brandtrack_media.storage_path`, `brandtrack_detections.evidence_path` | Privado (createSignedUrl) |
| `opportunity-comments` | `opportunity_comment_attachments.storage_path` | Privado (createSignedUrl) |
| `sponsor-documents` | `sponsor_documents.file_path` | Privado (createSignedUrl) |
| `proposals` | `proposals.pdf_path` | Privado (createSignedUrl, visto em `src/pages/dashboard/Proposals.tsx`) |
| `sponsor-interactions` | `sponsor_interactions.attachment_url` | Não confirmado público/privado (visto em `src/components/sponsors/SponsorTimeline.tsx`) |

**Atualização**: os 11 buckets e suas policies de RLS foram criados em
`0007_storage_buckets.sql` (gap fechado depois deste documento ter sido
escrito). Validado com upload/leitura reais contra o stack self-hosted —
ver o cabeçalho daquela migration para o raciocínio de path por bucket e um
bug real encontrado só em teste ao vivo (referência desqualificada a `name`
dentro de subquery correlacionada, resolvida silenciosamente para a coluna
`name` da tabela errada em 4 dos 11 buckets).

## View e funções de negócio não recriadas (gap conhecido)

- View `crm_unlinked_records` — não recriada (ver acima).
- Trigger/função de criação automática de `profiles` ao registrar um novo
  usuário (`auth.users` → `public.profiles`) — padrão comum em projetos
  Supabase, mas não há evidência direta no types.ts de como isso é feito
  (poderia ser um trigger `on auth.users insert` ou feito manualmente pela
  Edge Function de signup). **Não foi criado nenhum trigger aqui** — sem ele,
  `profiles` não será populada automaticamente no signup. Isso é um gap que
  precisa ser resolvido antes de ir para produção self-hosted.
- Todas as ~30 funções de negócio do bloco `Functions` do types.ts (RPCs como
  `generate_contract_installments`, `merge_sponsors`, `score_leads` [edge
  function], etc.) — não reconstruídas, fora do escopo do Passo 4.

## Tabelas/campos onde a confiança é mais baixa

- `sponsors.priority` default `'C'` — chute com 33% de confiança entre A/B/C.
- `sports_properties.status` e `assets.status` são campos de texto livre (não
  enum) — os valores possíveis usados pela UI não foram integralmente
  mapeados (não há um enum Postgres correspondente no types.ts original para
  esses dois campos, ao contrário de `contract_status`/`delivery_status`/etc.
  que são enums). Ficam como `text` sem `check constraint`, então qualquer
  string é aceita — considerar adicionar um `check` ou converter para enum
  depois de levantar os valores reais usados na UI (`src/pages/dashboard/Properties.tsx`,
  `src/pages/dashboard/Assets.tsx`).
- `ai_suggestions.priority`, `crm_tasks.priority`, `notifications.priority` —
  mesma situação (texto livre, valores prováveis "baixa"/"media"/"alta" não
  confirmados).

## Funções de negócio reconstruídas (0008-0010)

As ~30 funções de negócio listadas como gap no final deste documento (seção
anterior) foram reconstruídas em três migrations novas:
`0008_business_functions.sql`, `0009_sponsor_lifecycle_functions.sql` e
`0010_journey_automation_functions.sql`. Nenhuma tinha o corpo SQL disponível
em lugar nenhum do repositório — `types.ts` só revela nome, parâmetros e tipo
de retorno. `create_organization_with_owner` (já existia em
`0006_bootstrap_functions.sql`), `is_asset_publicly_visible` e
`is_property_published` (já existiam em `0004_functions.sql`) **não** foram
recriadas.

Legenda de confiança: **alta** (comportamento confirmado por call site real
em `src/`/`supabase/functions/` ou especificado literalmente em
`.lovable/plan/`), **média** (inferência razoável a partir do schema/UI, sem
call site direto confirmando o efeito completo), **baixa** (inferência quase
pura de nome/assinatura, sem nenhuma pista adicional).

| Função | Confiança | Evidência principal |
|---|---|---|
| `is_org_member(uuid, uuid)` (sobrecarga) | alta | Assinatura documentada em `types.ts`; lógica idêntica à versão `auth.uid()` de 0004 |
| `has_org_role(uuid, org_role[], uuid)` (sobrecarga) | alta | Idem |
| `get_user_org` | média | Ambíguo por natureza no modelo multi-org (CLAUDE.md §6); heurística "membership mais antiga" documentada |
| `has_role` | alta | Call site: `supabase/functions/manage-portal-access/index.ts` |
| `has_sponsor_access` | alta (schema) | Nenhum call site; espelha `has_sponsor_portal_access` de 0004 |
| `user_sponsor_ids` | alta (schema) | Nenhum call site; schema puro |
| `log_sponsor_interaction` | alta | Insert tipado em `sponsor_interactions`, colunas confirmadas em 0003 |
| `debug_table_policies` | alta | Introspecção de `pg_policies`, baixo risco por natureza |
| `get_sponsor_invite_by_token` | alta | Call site: `src/pages/portal/PortalLogin.tsx` |
| `accept_sponsor_invite_by_token` | alta/média | Fluxo geral confirmado em PortalLogin.tsx; status `'aceito'` confirmado em `SponsorPortalAccess.tsx`/`PortalAccess.tsx`; atribuição do app_role `patrocinador` é suposição (documentada, inofensiva via ON CONFLICT DO NOTHING) |
| `get_organization_invite_by_token` | média | **Gap parcial**: nenhum call site - `src/pages/Auth.tsx` ignora o parâmetro `invite` da URL gerado por `manage-team-access/index.ts`. Implementada por analogia a `get_sponsor_invite_by_token` |
| `can_access_contract_file` | alta | Reaproveita a regra de `contracts_bucket_org` de 0007, estendida ao portal |
| `mark_overdue_installments` | média | Call site: `src/pages/dashboard/Finance.tsx`; decisão de não filtrar por `_owner` documentada no corpo da função |
| `get_delivery_report_data` | alta (shape) / média (regras de filtro) | Shape do JSON confirmado literalmente pelo consumidor `supabase/functions/generate-delivery-report/index.ts` |
| `can_access_module` | alta | Matriz copiada literalmente de `src/hooks/useOrganization.tsx` (`can`); parâmetro `_write` aceito mas ignorado (documentado) |
| `archive_sponsor` | alta | Especificada literalmente no plano CRM Fase 1 item 6 |
| `unarchive_sponsor` | média-alta | Lifecycle default (`'prospect'`) quando `_lifecycle` omitido é suposição |
| `merge_sponsors` | média | Lista de tabelas com `sponsor_id` obtida via grep real (26 tabelas + `assets.exclusive_sponsor_id`); tratamento de conflito de UNIQUE em tabelas 1:1 (delete do lado perdedor) é a única exceção documentada a "nunca exclusão física" |
| `get_portal_sponsor_overview` | média | Shape do JSON inferido (sem consumidor que revele formato exato); campos alinhados às policies `_sponsor_portal_read` de 0005 |
| `crm_unlinked_records` (view) | média-alta | Colunas de saída confirmadas em `types.ts`; conteúdo (deliveries/installments sem sponsor_id) especificado no plano |
| `copy_opportunity_tier_to_proposal` | alta | Call site + especificação literal do plano |
| `copy_proposal_items_to_contract` | alta | Call site + especificação literal do plano |
| `generate_contract_deliveries` | alta | Especificação literal do plano (due_date proporcional) |
| `generate_contract_installments` | média | **Nenhum call site gera installments hoje** - algoritmo reconstruído a partir da semântica de UI confirmada em `PaymentScheduleFields.tsx`/`Contracts.tsx` |
| `trigger_contract_activated` (trigger, não pedido por nome) | média-alta (deliveries) / média (installments) | Confirmado por `src/pages/dashboard/Contracts.tsx` `markAsSigned()`, que conta `deliveries` logo após `status='ativo'` sem nenhuma chamada de RPC entre as duas operações - só um trigger de banco explica esse comportamento |
| `sync_opportunity_stage` | média | **Gap de produto confirmado**: nenhum call site; frontend muda `stage` via update direto e nunca escreve `opportunity_audit_logs`, apesar de já lê-la esperando `event_type='stage_changed'` |
| `sync_opportunity_contact_to_sponsor` | média-baixa | Nenhum call site; inferência de nome/schema (opportunity_contacts → sponsor_contacts) |
| `create_renewal_opportunity` | alta | Call site: `src/pages/dashboard/SponsorDetail.tsx` |

### Gaps que permanecem (não inventados silenciosamente)

- **Aceite de convite de equipe** (`organization_invites`): não existe
  `accept_organization_invite_by_token` na lista das 29 funções, e
  `src/pages/Auth.tsx` não lê o parâmetro `invite` da URL que
  `manage-team-access/index.ts` já gera. `get_organization_invite_by_token`
  foi reconstruída (leitura pura), mas o mecanismo de aceite em si não existe
  em lugar nenhum — precisa ser decidido/implementado como tarefa própria.
- **Bug pré-existente no frontend** (não corrigido, fora do escopo — não se
  toca em `src/`): em `OpportunityDrawer.tsx`, `convertToContract()` reusa a
  RPC `copy_opportunity_tier_to_proposal` passando o id do **contrato**
  recém-criado como `_proposal_id` quando a oportunidade tem `tier_id` mas
  não tem proposta prévia. Com a função reconstruída aqui, essa chamada
  sempre falha (o contrato não existe em `public.proposals`), erro
  silenciosamente apenas logado via `console.error`, nunca bloqueia a UI.
- `generate_contract_installments` e o disparo automático de parcelas via
  `trigger_contract_activated` são as peças de menor confiança deste pacote
  — nenhuma evidência direta de código confirma o algoritmo exato de
  distribuição de datas/valores nem que a geração deva ocorrer no mesmo
  evento das entregas. Revisar com o time de produto antes de depender disso
  em produção.

---

## Reconciliação com o schema real do Lovable (0012–0019, 2026-10-02)

O export do Lovable trouxe as 95 migrations reais do banco de origem
(`supabase/lovable-migrations/`). A comparação completa está em
`docs/architecture/reconciliacao-schema-2026-10-02.md` e a decisão de manter a
reconstrução, corrigindo-a com migrations novas, na **ADR-0005**. Depois de
`0012`–`0019`, tabelas, colunas (tipo e default), enums, triggers, view e
índices batem com o Lovable. As únicas diferenças restantes são deliberadas e
estão registradas no cabeçalho de cada migration.

Efeito sobre as seções anteriores deste documento:

- **Tipos de dados e defaults de enum/status**: substituídos pelos reais em
  `0013` (68 colunas). As suposições de "Tipos de dados: escolhas ambíguas" e
  "Enums usados como default" deixam de valer.
- **Funções de RLS com assinatura diferente do remoto**: as versões de 1
  argumento (`auth.uid()` interno) continuam. As sobrecargas com usuário
  explícito agora seguem a ordem real, com `_user_id` primeiro (`0012`).
- **View e funções de negócio não recriadas**: `crm_unlinked_records` usa a
  definição real (`0015`). As funções de negócio usam corpo, assinatura e
  modo de segurança reais, exceto `copy_opportunity_tier_to_proposal` e
  `copy_proposal_items_to_contract`, mantidas da reconstrução (`invoker` +
  RLS; no Lovable eram `SECURITY DEFINER` sem checagem de organização e
  restritas a `service_role`, então a chamada do frontend falhava).
- **Trigger de criação de `profiles`**: `handle_new_user` real (profile, papel
  global `comercial`, aceite de convite de organização pendente ou criação da
  organização pessoal), com a correção de `0018`.
- **"Aceite de convite de equipe" (gap acima)**: o aceite existe no Lovable,
  dentro de `handle_new_user`, para o e-mail convidado que se cadastra. Não há
  aceite para quem já tem conta.
- **`generate_contract_installments` / `trigger_contract_activated`**: o
  trigger da reconstrução foi removido. Valem os triggers reais
  `trg_contracts_generate_installments`/`_deliveries` com as funções reais.
- **`organization_id` nulo**: 45 triggers reais preenchem `organization_id` a
  partir do pai ou do usuário. Atenção: quando vem do usuário, usam
  `get_user_org()` (a organização ativa mais antiga), não a selecionada na UI.

Diferenças deliberadas que permanecem:

- `sports_properties.owner_id` sem `ON DELETE CASCADE` (no Lovable, excluir o
  usuário apagaria as propriedades dele).
- 140 FKs e 129 índices que só existem aqui.
- Policies com o papel global `has_role(..., 'admin')` e de "dono da linha"
  sem organização não portadas (isolamento por organização).
- `sync_opportunity_stage` e `sync_opportunity_contact_to_sponsor` só para
  `service_role` (no Lovable, executáveis por `anon` sem checagem).
- `contract_clause_templates` com escrita só owner/admin (padrão 4).
- `trg_lead_to_opportunity` renomeado para `trg_zz_lead_to_opportunity`
  (`0019`), para rodar depois da validação do lead.

Bugs do Lovable reproduzidos no replay das migrations reais e corrigidos aqui:

- `0018`: cadastro sem convite abortava com membro duplicado em
  `organization_members`.
- `0019`: lead do media kit público falhava para visitante anônimo, a
  oportunidade herdava o `owner_id` enviado pelo formulário, e o vínculo
  lead → oportunidade se perdia pela ordem dos triggers.
