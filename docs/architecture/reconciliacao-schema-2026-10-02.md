# Reconciliação de schema: Lovable Cloud × schema reconstruído

- **Data**: 2026-10-02
- **Método**: as 95 migrations reais (`supabase/lovable-migrations/`) e as
  `supabase/migrations/0001`–`0011` aplicadas em dois Postgres descartáveis
  (mesma imagem do stack, mesma base de `auth`/`storage`), seguidas de
  comparação por catálogo. Passo a passo reproduzível em
  `supabase/tools/reconciliacao-schema/`.
- **Replay do Lovable**: 94 de 95 aplicadas. A única falha
  (`20260419203505_…`) é uma duplicata do init (`create type app_role` de
  novo), descartada na própria plataforma.

## Resumo

| Objeto | Lovable (real) | Reconstruído | Situação |
|---|---|---|---|
| Tabelas | 71 | 71 | ✅ iguais |
| Colunas | 896 | 896 | ⚠️ 44 com tipo ou default diferente |
| Enums | 16 | 16 | ✅ iguais |
| Funções de negócio | 77 | 73 | ⚠️ 47 faltando (quase todas funções de trigger), 19 com corpo diferente, 14 como `invoker` em vez de `definer` |
| **Triggers** | **129** | **4** | ❌ **125 faltando** |
| Policies (linhas tabela × comando) | 221 | 110 | ❌ permissão por módulo ausente |
| Constraints | 200 | 316 | ⚠️ faltam 31 do Lovable (CHECKs de domínio e UNIQUEs). O reconstruído tem 147 a mais (FKs e checks inferidos) |
| Índices | 133 | 202 | ⚠️ faltam 60 do Lovable |
| View `crm_unlinked_records` | 1 | 1 | ⚠️ definição diferente |
| Buckets | 10 | 11 | ⚠️ `sponsor-documents` só no reconstruído. Limites de tamanho só no reconstruído |

O `types.ts` não enxerga triggers, policies, CHECKs, corpos de função nem
defaults. Por isso a reconstrução da ADR-0004 acertou a "forma" (tabelas,
colunas, enums) e errou o "comportamento".

## Achados críticos (quebram o app no self-hosted)

### C1. 125 triggers ausentes

| Categoria | Qtde | Efeito da ausência |
|---|---|---|
| Preenchem `organization_id` a partir do pai ou do usuário (`tg_set_organization_id`, `set_org_from_property`, `tg_set_contract_child_organization_id`, …) | 45 | O frontend **não envia** `organization_id` nesses inserts (37 chamadas encontradas, ex.: `PropertyMediaGallery.tsx:102`, `PublicMediaKit.tsx:286`, `PropertyDetail.tsx:816`). No reconstruído o valor fica nulo e a RLS (`with check is_org_member(organization_id)`) **rejeita o insert**, ou a linha é gravada e fica invisível |
| `updated_at` | 41 | `updated_at` nunca muda após o insert |
| Automação de negócio (contrato gera parcelas e entregas, sincroniza estágio da oportunidade, ciclo de vida do patrocinador, efeitos de tarefas de CRM, lead → oportunidade, oportunidade ganha) | 15 | Fluxos que no Lovable acontecem sozinhos não acontecem. O reconstruído tem só 1 equivalente (`contracts_activated_generate`) |
| Validação de organização do registro pai (`tg_validate_parent_organization`, `tg_validate_opportunity_org_access`) | 7 | **Isolamento**: sem eles, um filho pode apontar para um pai de outra organização |
| Log de interações do patrocinador, auditoria, numeração de proposta, funil padrão, menções, validações de perda e de lead | 17 | Timeline do patrocinador, auditoria e numeração automática param |

Casos verificados:

- **Lead do media kit público some**: `property_leads_public_insert` permite
  o insert anônimo (`is_property_published`), mas sem o trigger
  `set_org_from_property` a linha fica com `organization_id = null` e
  nenhuma policy de leitura a alcança. O visitante vê "enviado", a
  organização nunca vê o lead.
- **Upload de mídia da propriedade falha**: `property_media_tenant` exige
  `is_org_member(organization_id)` no `with check`, e o valor é nulo.

### C2. Permissão por módulo (escrita) ausente: regressão de autorização

No Lovable, 76 policies em **38 tabelas** usam `can_access_module(user, org,
módulo, escrita)`:

- **leitura**: qualquer membro ativo;
- **escrita**: `owner`/`admin`, ou o papel do módulo (`comercial` → crm,
  `operacional` → operacional, `financeiro` → financeiro).

No reconstruído essas tabelas usam só `is_org_member`. Ou seja, **qualquer
membro escreve em qualquer módulo**: um `operacional` pode editar parcelas,
um `financeiro` pode editar oportunidades. Tabelas afetadas incluem
`contracts`, `installments`, `opportunities`, `proposals`, `sponsors`,
`deliveries`, `assets`, `sports_properties` e as tabelas filhas.

Também ficam de fora as 15 policies com `has_role` (papel global `admin`).

### C3. UNIQUEs ausentes quebram upserts

| Upsert no código | `onConflict` | Constraint no reconstruído |
|---|---|---|
| `Pipeline.tsx:875` (salvar SLAs) | `organization_id,pipeline_funnel_id,stage` | ❌ ausente. **Verificado**: `there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| `ticket-benchmark-ai/index.ts:137` | `organization_id,segment` | ❌ ausente |

Também faltam `asset_allocations (asset_id, property_id)` e
`sponsor_brands (sponsor_id, name)`, entre outros.

### C4. Tipos de coluna incompatíveis com os dados reais

A importação de dados do Lovable para o reconstruído **perderia ou rejeitaria
dados** em 22 colunas com tipo diferente, por exemplo:

- `brandtrack_detections.position_x/position_y/width/height`: `numeric` no
  Lovable, `integer` no reconstruído (coordenadas fracionárias seriam
  arredondadas);
- `contracts.custom_due_dates`: `date[]` × `text[]`;
- `deliveries.delivered_at`, `installments.paid_at`, `proposals.valid_until`:
  `date` × `timestamptz` (fuso aplicado na conversão);
- `lead_scores.*`, `user_stage_probabilities.probability`: `integer` ×
  `numeric`.

### C5. Defaults e domínios de status diferentes

22 defaults divergem, e vários contrariam os CHECKs reais. Exemplos:
`ai_suggestions.status` `'pendente'` (Lovable: `'nova'`, CHECK aceita
nova/vista/feita/descartada), `brandtrack_media.status` `'pendente'`
(Lovable: `'queued'`), `assets.status` `'disponivel'` (Lovable: `'ativo'`),
`tier_sales.status` `'reservado'` (Lovable: `'reservada'`). Inserts que
contam com o default gravam valores que o resto do app não reconhece.

### C6. Funções com assinatura e segurança diferentes

- Ordem de parâmetros alfabética no reconstruído (herança do `types.ts`):
  `is_org_member(_org_id, _user_id)` × `is_org_member(_user_id, _org_id)`.
  Via PostgREST (parâmetros nomeados) funciona, mas qualquer chamada SQL
  posicional diverge.
- 14 funções de negócio estão como `security invoker` no reconstruído e
  `definer` no Lovable (`generate_contract_installments`,
  `generate_contract_deliveries`, `sync_opportunity_stage`,
  `mark_overdue_installments`, `merge_sponsors`, …): passam a depender da
  RLS do chamador e podem falhar ou se comportar diferente.
- Retornos diferentes: `json` × `jsonb`, e `user_sponsor_ids`: `uuid[]` ×
  `setof uuid` (o client recebe formato diferente).

## O que o reconstruído tem e o Lovable não

- 147 constraints e 129 índices a mais (FKs explícitas e índices em
  `organization_id`). Úteis, mas as FKs inferidas precisam ser validadas
  contra os dados reais antes da importação (linhas órfãs seriam
  rejeitadas).
- Bucket `sponsor-documents` e limites de tamanho por bucket.
- Policies de Storage e funções de bootstrap próprias do self-hosted
  (`0006`, `0007`).

## Recomendação

O schema reconstruído **não deve ser o destino da migração de dados**. As
diferenças de comportamento são grandes demais para corrigir uma a uma com
segurança: seriam ~125 triggers, ~47 funções, 76+ policies, 22 tipos e 22
defaults.

**Opção recomendada: adotar o schema real do Lovable como nova base**
(substitui a abordagem da ADR-0004, que precisa de uma nova ADR):

1. Consolidar as 94 migrations do Lovable numa migration-base nova (ou numa
   sequência), aplicável num banco limpo pelo `migrate.sh`.
2. Reaplicar por cima, como migrations numeradas, só o que é próprio do
   self-hosted e foi validado: buckets e policies de Storage (`0007`),
   bootstrap (`0006`), as correções já feitas no reconstruído (ex.: `0011`)
   e os índices úteis.
3. Rodar `supabase/tests/seguranca.sql` adaptado (as funções de RLS do
   Lovable recebem `_user_id`: `is_org_member(auth.uid(), org)`) e manter as
   regras do `CLAUDE.md` seção 6 e de `.claude/rules/supabase.md`, que
   precisarão ser atualizadas para refletir as assinaturas reais.

**Impacto**: as migrations `0001`–`0011` já foram aplicadas no ambiente
local (e possivelmente em homologação). A regra "nunca editar migration
aplicada" leva a uma de duas saídas, a decidir: (a) recriar os ambientes
não produtivos do zero com a nova base, já que não há dados de produção
no self-hosted, ou (b) uma migration de transição que leve o reconstruído
ao estado real. A opção (a) é muito mais simples e segura **enquanto não
houver dado real na VPS**.

Alternativa (não recomendada): manter o reconstruído e escrever migrations
corretivas para cada item acima.

## Situação (2026-10-02): reconciliado

Decisão do usuário: **manter a reconstrução** e corrigi-la com migrations novas
(ADR-0005). Implementado em `0012`–`0019`, aplicado no ambiente local e
validado por:

- replay comparativo (`supabase/tools/reconciliacao-schema/recon.sh`): tabelas,
  colunas, enums, triggers, view e índices iguais ao Lovable; as diferenças
  restantes são as deliberadas, listadas em `SCHEMA_NOTES.md`;
- `npm run supabase:test`: novos testes automatizados (c)–(g) de isolamento
  entre organizações, escrita por módulo, perfis, lead público e escopo por
  usuário, todos passando;
- `npm run supabase:migrate` idempotente e guarda de migration destrutiva do
  CI sem ocorrências;
- teste manual no app local: salvar SLAs do Pipeline (upsert antes quebrado)
  responde 201.

Achados adicionais durante a implementação, além dos C1–C6 acima:

- A reconstrução deixava funções `SECURITY DEFINER` executáveis por `anon`
  (ex.: `create_organization_with_owner`, que recebe `_owner_id` arbitrário, e
  `debug_table_policies`). Corrigido em `0012`/`0015`.
- `profiles` era legível por qualquer usuário logado, de qualquer organização,
  e conversas e sugestões de IA e logs de erro eram legíveis por todos os
  membros. Corrigido em `0017`.
- **Bugs no próprio Lovable**, reproduzidos aplicando as migrations reais num
  banco limpo: (1) cadastro sem convite falha com membro duplicado; (2) lead
  do media kit público falha para visitante anônimo e, se passasse, usaria o
  `owner_id` do formulário. Corrigidos em `0018`/`0019`. Se o banco de
  produção do Lovable seguir as migrations, **cadastros novos sem convite e
  leads do media kit não funcionam hoje em produção**. Vale confirmar
  manualmente.
- No Lovable, `sync_opportunity_stage`/`sync_opportunity_contact_to_sponsor`
  são `SECURITY DEFINER` executáveis por `anon` sem checagem de organização, e
  a policy "Usuários criam suas propriedades" permite inserir propriedade com
  `organization_id` arbitrário. Não portados.
