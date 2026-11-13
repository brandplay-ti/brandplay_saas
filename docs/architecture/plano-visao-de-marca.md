# Plano: Visão de Marca (tipo de cliente)

- **Data**: 2026-11-03
- **Status**: **decisões fechadas em 2026-11-03** (seção 9) e **fases 1 a 3
  implementadas** na branch `feature/relatorio-landing-page`, sem commit:
  migrations `0043_tipo_de_cliente.sql` e
  `0044_relatorio_de_entregas_por_contrato.sql`, ADR-0013, regras em
  `docs/business/tipo-de-cliente.md`. A fase 4 (planos por tipo) não entra
  (D9). Achados da implementação na seção 12.
- **Escopo**: um segundo tipo de cliente, a **Marca**, ao lado da
  **Agência** (o cliente para o qual o produto foi feito até agora). Na visão
  de Marca não existem a captação de clientes e o funil de vendas; o resto é
  igual. O tipo é escolhido no cadastro e na contratação, e o superadmin pode
  mudá-lo em `/admin/clientes`.
- **Fora do escopo**: mudar o tenant (continua sendo a organização,
  ADR-0002), criar planos diferentes por tipo (decisão D9) e reescrever as
  telas para o ponto de vista de quem compra patrocínio além do vocabulário
  (seção 4.3).

## 1. Resumo e recomendação

1. **O tipo é um atributo da organização**: `organizations.client_type`
   (`'agencia' | 'marca'`, padrão `'agencia'`). Não é claim do JWT nem estado
   de frontend. Quem muda depois do cadastro é só o superadmin, por uma função
   `admin_*` com auditoria (ADR-0008). Um gatilho barra a mudança pelo
   `organizations_admin_update` (owner/admin) da 0005.
2. **Ocultar só na tela não basta.** O formulário público do media kit
   (`/p/:slug`) continuaria criando oportunidades por gatilho
   (`handle_lead_to_opportunity`). As notificações de oportunidade parada
   continuariam saindo, e as funções de IA do funil continuariam respondendo
   pela API. O bloqueio precisa estar no banco. Não é para proteger um dado
   de outro tenant: a organização é dona dele. É para a feature não existir de
   fato.
3. **Não dá para só desligar o módulo `crm`.** Hoje o `crm` cobre muito mais
   que o funil. Ele dá leitura e escrita de `sponsors` e das tabelas
   `sponsor_*`, `sponsorship_tiers`, `tier_sales`, `sponsor_portal_access`,
   `sponsor_invites`, e entra em `contracts`, `sports_properties`, `assets`,
   `deliveries` e `property_events` (0017, 0036). Com o `crm` em "sem acesso",
   a marca perderia patrocinadores, o portal do patrocinador e a escrita de
   cotas.
4. **Recomendação: um módulo novo `vendas` ("Funil e captação") na matriz de
   0036, com um teto por tipo dentro de `can_access_module`.** As tabelas do
   funil (seção 3.2) passam do `crm` para o `vendas`. Para a organização
   `marca`, `can_access_module(..., 'vendas', ...)` devolve `false` para
   qualquer papel, inclusive owner e sessão de suporte. Esse ponto único já
   alcança as policies, as Edge Functions de IA (todas passam por
   `exigirModulo`, `_shared/ai/funcao.ts`) e o menu (`can` em
   `useOrganization`, `gruposVisiveis` em `navegacao.ts`).
5. **Na migração, nada muda para as agências.** A linha `vendas` de cada papel
   nasce com o mesmo acesso que o papel tem hoje no `crm`. Ganho extra para a
   agência: o administrador passa a separar quem vê o funil de quem cuida da
   carteira de patrocinadores.
6. **Trocar o tipo não apaga dado.** Agência → marca: o funil fica invisível e
   o media kit sai do ar, mas tudo continua no banco. Marca → agência: tudo
   volta como estava.
7. **A dúvida maior não é técnica: o que é "patrocinador" quando o cliente é
   a própria marca** (seção 4.1, D3). Recomendação: o patrocinador continua
   sendo a marca (ou as marcas do grupo) e o projeto continua sendo o que
   se patrocina. O modelo de dados fica igual; só muda o rótulo.

## 2. Glossário e conflito de nomes

"Marca" já tem três usos no produto:

| Uso | Onde | Significa |
|---|---|---|
| Kit de marca da organização | `organization_brand_kits`, `organization_brand_assets` (0034), `_shared/marca.ts` | cores, fonte e logo do cliente |
| Marca patrocinadora | `opportunities.brand`, `contracts.brand`, `sponsor_brands` | nome da marca do patrocinador |
| BrandTrack | `brandtrack_brands`, "Marcas esperadas", "Análise por patrocinador" | logo detectado em foto |

Proposta (D1):

- **No banco**: `organizations.client_type`, valores `agencia` e `marca`.
  Evita `brand`, que já está em quatro tabelas.
- **Na tela**: "Tipo de cliente: Agência ou Marca".
- **Quem é "agência"?** O rótulo do cadastro hoje é "Empresa / Projeto"
  (`Auth.tsx`). Clubes, federações e organizadores de evento vendem
  patrocínio do mesmo jeito que uma agência. Sugestão: "Agência ou detentor de
  direitos" no cadastro e "Agência" no resto (D1).

## 3. Inventário dos componentes impactados

Legenda: **Some**: não existe para a marca. **Fica**: igual. **Ajusta**:
continua, mas uma parte depende do funil ou muda de rótulo.

### 3.1 Portal (telas, menu, componentes)

| Componente | Arquivo | Para a marca | Observação |
|---|---|---|---|
| Menu "CRM" → Pipeline, Propostas, Lead Scoring IA | `portal/src/lib/navegacao.ts` (`NAV_GROUPS`) | **Some** | passam a `modules: ["vendas"]` |
| Menu "CRM" → Patrocinadores | `navegacao.ts` | **Fica** (rótulo D3) | continua no `crm` |
| Rotas `/dashboard/pipeline`, `/propostas`, `/lead-scoring` | `portal/src/App.tsx` | **Some** | hoje nenhuma rota é barrada por módulo; acrescentar guarda de rota (seção 5.6) |
| Barra lateral e busca global | `components/AppSidebar.tsx`, `components/CommandMenu.tsx` | Ajusta sozinho | os dois usam `gruposVisiveis`; a busca consulta só `sponsors`, `sports_properties` e `contracts` |
| Pipeline (kanban, métricas, probabilidades) | `pages/dashboard/Pipeline.tsx`, `components/pipeline/*` | **Some** | inclui `StageProbabilitiesDialog` (`user_stage_probabilities`) |
| Propostas, assistente e IA de proposta | `pages/dashboard/Proposals.tsx`, `components/proposals/*` | **Some** | |
| Lead Scoring | `pages/dashboard/LeadScoring.tsx` | **Some** | |
| Dashboard: KPI "Pipeline aberto", cartões "Propostas", "Oportunidades", "Propostas recentes", funil por estágio | `pages/dashboard/Dashboard.tsx` (l. 162-169, 234-245, 270, 280-281, 329, 403) | **Ajusta** | esconder os blocos; consultas não rodam |
| Dashboard: "Recebido (3m)", "Previsto" | `Dashboard.tsx` l. 268-269 | **Ajusta** (D6) | para a marca, parcela é pagamento feito, não recebido |
| Dashboard: `ChurnRiskWidget`, `NextActionsWidget`, `NextStepsAI` | `components/dashboard/*`, `components/sponsors/NextActionsWidget.tsx` | **Ajusta** (D8) | risco de churn é "o patrocinador não renovar", visão de quem vende |
| Patrocinadores (lista) | `pages/dashboard/Sponsors.tsx` l. 104 | **Ajusta** | contagem de oportunidades por patrocinador some |
| Detalhe do patrocinador | `pages/dashboard/SponsorDetail.tsx` | **Ajusta** | somem negociações, propostas, `MeetingPrepAI` e o botão de renovação (`create_renewal_opportunity`, l. 138); ficam contratos, entregas, documentos, contatos, `SponsorPortalAccess`, `ROIWidget`, `ExecutiveSummaryAI` (D8) |
| Contratos | `pages/dashboard/Contracts.tsx` l. 211, 281-283, 371, 1637 | **Ajusta** | o seletor "Oportunidade" some; o contrato nasce direto, sem proposta |
| Entregas | `pages/dashboard/Deliveries.tsx` l. 222, 322, 787, 869 | **Ajusta** | filtro e campo "Oportunidade" somem |
| Projeto: abas "Leads" e "Propostas", publicação do media kit | `pages/dashboard/PropertyDetail.tsx` l. 1283-1292, 1460-1486, 2488, 2552 | **Some** | o resto do projeto fica |
| Checklist do projeto | `components/property/PropertyChecklist.tsx` l. 143, 455 | **Ajusta** | vínculo com oportunidade some |
| Calendário | `pages/dashboard/Calendar.tsx` l. 85-94 | **Ajusta** | `opportunity_activities` some; `crm_tasks` fica com o vínculo de patrocinador |
| Relatórios: aba Pipeline, funil e perdas no Analytics, `RevenueForecastWidget`, `QuotaHeatmapWidget` | `pages/dashboard/Reports.tsx`, `components/reports/AnalyticsTab.tsx` | **Ajusta** | `ROIWidget` e `TicketBenchmarkWidget` ficam (D8) |
| Relatório de sell-out de cotas | `components/reports/SelloutReportGenerator.tsx` | D7 | "sell-out" mede cota vendida, visão de quem vende |
| Relatório de entregas (PDF) | `components/pipeline/OpportunityDrawer.tsx` l. 768 | **Ajusta: precisa sair do funil** | hoje só nasce da oportunidade (seção 5.7) |
| Relatórios de resultado (landing page) | `pages/dashboard/RelatoriosDeResultado.tsx`, `RelatorioEditor.tsx`, `/r/:slug` | **Fica** | parte do projeto, não do funil |
| Notificações | `pages/dashboard/Notifications.tsx`, `components/notifications/NotificationsBell.tsx` | **Ajusta** | `opportunity_stale`, `opportunity_lost`, `opportunity_mention` e `proposal_expiring` deixam de existir |
| Logs de falhas | `pages/admin/AdminFailureLogs.tsx` (era `pages/dashboard/FailureLogs.tsx`) | Fica | área do superadmin desde a 0045 (BP-3); não aparece para a marca |
| Media kit público e formulário de lead | `pages/PublicMediaKit.tsx` l. 275-287 | **Some** | barrado no banco (seção 5.5) |
| Equipe → Permissões | `pages/dashboard/Team.tsx`, `components/team/*`, `lib/permissoes.ts` | **Ajusta** | coluna "Funil e captação" nova; para a marca, escondida |
| Cadastro | `pages/Auth.tsx` l. 36-41, 119 | **Ajusta** | escolha do tipo |
| Criar organização | `pages/onboarding/OrganizationSetup.tsx` l. 93 | **Ajusta** | escolha do tipo |
| Plano e cobrança | `pages/dashboard/Plan.tsx` | D10 | confirmação do tipo na contratação |
| Admin: clientes | `pages/admin/AdminClients.tsx`, `AdminClientDetail.tsx` | **Ajusta** | coluna e filtro "Tipo"; troca no cartão "Cadastro" |
| BrandTrack, Projetos, Ativos, Entregas, App de Campo, Financeiro, Configurações | — | **Fica** | |
| Portal do patrocinador | `pages/portal/*` | D5 | `PortalDeliveries` usa `contracts.opportunity_id` só como filtro; funciona sem |

### 3.2 Banco (tabelas, funções, gatilhos)

Tabelas que passam para o módulo `vendas`. Leitura e escrita hoje vêm do
`crm` (0017, 0036):

| Tabela | Padrão atual | Observação |
|---|---|---|
| `opportunities` | 7 (`crm`) | |
| `opportunity_activities`, `opportunity_audit_logs`, `opportunity_comments`, `opportunity_comment_attachments`, `opportunity_contacts` | 7 (`crm`) | herdam da oportunidade |
| `proposals`, `proposal_items`, `proposal_versions` | 7 (`crm`) | `proposals_sponsor_portal_read` (0005, seção 9) fica de fora: D5 |
| `lead_scores` | 7 (`crm`) | |
| `property_leads` | 7 (`crm`) + `property_leads_public_insert` (`anon`) | seção 5.5 |
| `pipeline_funnels`, `pipeline_stage_slas` | 4 (admin) | só leitura muda |
| `user_stage_probabilities` | 3 (por usuário) | entra no teto, não na matriz |
| `sponsor_proposal_profiles` | 7 (`crm`) | preferências de proposta do patrocinador (D4) |

Continuam no `crm`: `sponsors` e as demais `sponsor_*`, `sponsorship_tiers`,
`tier_assets`, `tier_sales`, `crm_tasks` (D4), `sponsor_portal_access`,
`sponsor_invites`.

Funções e gatilhos:

| Peça | Onde | Para a marca |
|---|---|---|
| `handle_lead_to_opportunity` (`trg_zz_lead_to_opportunity`), `validate_property_lead` | 0016, 0019 | não dispara: o insert anônimo é recusado antes (5.5) |
| `is_property_published` (as irmãs `is_asset_publicly_visible` e `is_sponsor_publicly_visible` chamam ela) | 0004 | passa a exigir organização `agencia` |
| `create_renewal_opportunity` | 0010, 0015 | recusa organização `marca` (D7) |
| `copy_opportunity_tier_to_proposal`, `copy_opportunity_tier_to_contract`, `copy_proposal_items_to_contract` | 0010, 0011 | sem chamada possível (partem de oportunidade ou proposta); recusam `marca` por defesa |
| `sync_opportunity_stage`, `tg_contract_sync_opportunity_stage`, `tg_delivery_sync_opportunity_stage`, `tg_proposal_sync_opportunity_stage` | 0016, 0021 | inertes sem `opportunity_id`; não mudam |
| `handle_opportunity_won`, `handle_opportunity_stage_change`, `notify_commercial_team_opportunity_lost`, `notify_opportunity_comment_mentions`, `tg_opportunity_*`, `tg_set_default_pipeline_funnel` | 0016 | inertes sem oportunidade nova |
| `tg_contract_sync_sponsor_lifecycle` (ciclo `prospect` … `cliente_ativo`) | 0016 | continua; o ciclo de vida "prospect → cliente" perde sentido para a marca (D3) |
| `get_delivery_report_data(_opportunity_id, _contract_id)` | 0015, 0030 | **exige oportunidade**: precisa de variante por contrato (5.7) |
| `trigger_contract_activated` → `generate_contract_installments`, `generate_contract_deliveries` | 0010 | fica, sem mudança |
| `semear_permissoes_da_organizacao`, `tg_proteger_permissoes`, `can_access_module` | 0036 (+ `scope` na 0042, PR #47) | módulo `vendas` e teto por tipo (5.3) |
| `handle_new_user` | 0022 | grava o tipo vindo do cadastro (5.1) |
| `create_organization_with_owner` | 0006 | ganha `_client_type` (5.1) |
| `admin_clientes`, `admin_cliente_detalhe` | 0028 | devolvem `client_type` |

### 3.3 Edge Functions

Todas as de IA validam o módulo por `exigirModulo` (`_shared/ai/funcao.ts`),
que chama `can_access_module`. Com o teto da seção 5.3, basta trocar o módulo
passado de `crm` para `vendas` nas funções do funil:

| Função | Módulo hoje | Para a marca | Mudança |
|---|---|---|---|
| `score-leads` | `crm` (escrita) | **Some** | `vendas` |
| `generate-proposal-ai`, `generate-proposal-wizard`, `generate-proposal-pdf` | `crm` | **Some** | `vendas` |
| `revenue-forecast` | lê `opportunities`, `user_stage_probabilities`, `installments` | **Some** a parte de funil (D6) | `vendas`; previsão de parcelas, se ficar, vai para o `financeiro` |
| `suggest-next-steps` | seis contextos | **Ajusta** | contextos `opportunity`/`proposal` em `vendas`; `sponsor`, `contract`, `delivery`, `painel` ficam, sem ler oportunidade; prompt "coach comercial" precisa de versão para a marca (D8) |
| `prepare-meeting-ai` | `crm`, lê oportunidades e propostas | D8 | preparação de reunião com o patrocinador é visão de quem vende |
| `ai-assistant` | ferramentas `search_opportunities`, `create_opportunity_activity` | **Ajusta** | não oferecer essas ferramentas à marca |
| `sponsor-executive-summary`, `task-insights` | leem `opportunities` | **Ajusta** | pular a parte de oportunidade quando não houver acesso |
| `check-notifications` | `opportunity_stale`, `proposal_expiring` | **Ajusta** | pular as categorias do funil para a marca |
| `detect-churn-risk` | `crm` | D8 | |
| `generate-delivery-report` | exige `opportunity_id` | **Ajusta** | aceitar `contract_id` sozinho (5.7) |
| `calculate-roi`, `ticket-benchmark-ai`, `brandtrack-*`, `generate-sellout-report`, `report-view`, `social-posts` | — | Fica (D7 para sell-out) | |
| `create-organization` | — | **Ajusta** | aceita `client_type` validado por zod (5.1) |
| `manage-billing` | — | D10 | se a contratação confirmar o tipo |

## 4. Regras de negócio impactadas

### 4.1 O que é "patrocinador" para a marca

Hoje a organização vende: ela tem projetos (ou as representa), monta
cotas, capta patrocinadores (as marcas) e fecha contratos com eles. Quando o
cliente é a marca, o sentido se inverte: a organização **compra** patrocínio.
Os projetos que ela patrocina são de terceiros (clube, federação,
organizador), e o patrocinador de todo contrato é ela mesma.

| | a. Patrocinador = a própria marca (recomendado) | b. Patrocinador = o detentor de direitos |
|---|---|---|
| Como | Um cadastro em `sponsors` por marca do grupo ("Marca X", "Marca X Zero"); contrato = marca × projeto | `sponsors` passa a guardar o clube; o projeto fica abaixo dele |
| Esquema | Igual | Igual, com significado trocado |
| BrandTrack | Funciona: detecta o logo do patrocinador (`sponsor_brandtrack_profiles`) | **Quebra**: o "patrocinador" seria o clube, cujo logo não interessa |
| Portal do patrocinador | Vira acesso de leitura para outra área da marca (D5) | Vira portal para o clube, um uso novo |
| Relatórios, ROI, entregas | Iguais | Rótulos invertidos em toda parte |
| Tela | Renomear "Patrocinadores" para "Marcas" na visão de Marca (D3) | Renomear para "Detentores" e reescrever a ajuda |

Lacuna em qualquer das duas: `sports_properties` não tem campo de
**detentor de direitos** nem de contato do clube. Para a agência isso não
fazia falta (o projeto é dela ou do cliente dela). Para a marca, é o
contato principal do contrato (D3a).

### 4.2 O que some e o que fica

| Área | Agência | Marca | Decisão |
|---|---|---|---|
| Funil, oportunidades, propostas, lead scoring | sim | não | pedido do usuário |
| Media kit público (`/p/:slug`) e formulário de lead | sim | não | D2: captação pública |
| Patrocinadores e perfis `sponsor_*` | sim | sim, como "marcas do grupo" | D3 |
| Contratos, parcelas, cláusulas | sim | sim, criados direto | |
| Cotas (`sponsorship_tiers`) e vendas de cota (`tier_sales`) | sim | D7 | a marca compra uma cota; não vende |
| Renovação (`create_renewal_opportunity`) | cria oportunidade | não existe | D7 |
| Entregas, aprovação, App de Campo, evidências | sim | sim | o maior valor para a marca é conferir a contrapartida |
| BrandTrack | sim | sim | |
| Relatórios de resultado (`/r/:slug`) | sim | sim | |
| Relatório de entregas (PDF) | pela oportunidade | pelo contrato | 5.7 |
| Portal do patrocinador | sim | D5 | |
| IA | todas | as que não são do funil | D8 |
| Tarefas de CRM (`crm_tasks`) | sim | sim, sem vínculo com oportunidade | D4 |

### 4.3 Vocabulário e ponto de vista

O pedido diz que, tirando o funil, "o resto é igual". O dado é igual. Mas
algumas telas falam de quem vende e, para a marca, ficam com o sentido
errado:

- **Financeiro**: parcela de contrato é recebível para a agência e
  pagamento para a marca. "Recebido", "Previsto" e "Atrasado"
  (`Dashboard.tsx` l. 268-269, `Finance.tsx` l. 81, 265-336,
  `check-notifications`) viram "Pago", "A pagar" e "Vencido" (D6).
- **Risco de churn** (`detect-churn-risk`, `contract_churn_risk`): mede a
  chance de o patrocinador não renovar. Para a marca, o equivalente seria
  "contrato com entrega atrasada ou ROI baixo" (D8).
- **IA**: os prompts de `suggest-next-steps` ("coach comercial sênior") e de
  `prepare-meeting-ai` assumem quem vende.

Recomendação: a fase 3 troca só os rótulos e esconde o que não faz sentido
(seção 8). Telas novas do ponto de vista de quem compra ficam para depois, com
pedido de cliente.

## 5. Regras técnicas impactadas

### 5.1 Modelo de dados e cadastro

```sql
alter table public.organizations
  add column client_type text not null default 'agencia',
  add constraint organizations_client_type_check
    check (client_type in ('agencia', 'marca'));
```

- `text` + `check`, como `organization_role_grants.module` (0036) e
  `scope` (0042). Um enum novo exigiria `alter type ... add value` para um
  terceiro tipo. `check` se troca numa migration comum.
- **Proteção**: `organizations_admin_update` (0005) deixa owner/admin
  atualizarem a linha inteira. Um gatilho `before update` recusa a mudança de
  `client_type` quando ela não vem da função administrativa. Mesmo padrão do
  sinal de transação `brandplay.lead_insert` da 0019:
  `admin_alterar_tipo_de_cliente` faz `set_config('brandplay.tipo_cliente',
  'on', true)`, e o gatilho só aceita a mudança com esse sinal.
- **Cadastro** (`Auth.tsx` → `handle_new_user`, 0022): o formulário envia
  `client_type` em `user_metadata`, ao lado de `company`. O gatilho aceita só
  `agencia` ou `marca` e cai em `agencia` com outro valor. Isso não é
  confiar no cliente para autorização: a pessoa está declarando o tipo da
  própria organização nova. Usuário convidado (equipe ou patrocinador) não
  cria organização, então o campo é ignorado.
- **Criar organização** (`OrganizationSetup.tsx` → `create-organization` →
  `create_organization_with_owner`): `BodySchema` ganha `client_type:
  z.enum(['agencia','marca'])`, e a RPC ganha `_client_type` com padrão
  `'agencia'`. Ela é chamada só pela service role, então mudar a assinatura
  não quebra outros chamadores. Mesmo assim, conferir com `grep` antes.
- **Organizações existentes**: todas ficam `agencia` (o padrão). Nada muda
  para elas.
- **Portal**: `useOrganization` lê `client_type` junto com `name` e
  `logo_path` (l. 56) e o expõe no contexto (`clientType`). `types.ts` é
  regenerado.

### 5.2 Superadmin

- `admin_alterar_tipo_de_cliente(_org_id, _tipo, _comentario)`: começa com
  `platform_admin_require()`, exige comentário e grava em
  `platform_admin_audit_log` com `action = 'tipo_de_cliente_alterado'` e
  `before`/`after`. Mesmo formato de `admin_liberar_acesso` (0029).
  `revoke all ... from public, anon, authenticated`; `grant execute ... to
  authenticated` (a função barra quem não é superadmin).
- `admin_clientes` e `admin_cliente_detalhe` (0028) devolvem `client_type`.
  Na tela, coluna e filtro em `AdminClients.tsx`, e troca com motivo no
  cartão "Cadastro" de `AdminClientDetail.tsx`, com aviso do que some
  (seção 6).
- Continua valendo a ADR-0008: o superadmin lê cadastro e cobrança, não dado
  de domínio. Para o aviso de impacto, use contagens (quantas oportunidades
  abertas, quantos projetos publicados), no padrão das contagens que
  `admin_cliente_detalhe` já devolve.

### 5.3 Matriz de permissões e teto por tipo

1. `organization_role_grants_module_check` (0036) aceita `vendas`.
2. Backfill: para cada organização e papel, uma linha `vendas` com o mesmo
   `access` (e `scope`, se a 0042 já estiver aplicada) da linha `crm`.
   `semear_permissoes_da_organizacao` ganha as linhas `vendas` com os mesmos
   valores padrão do `crm`. `tg_proteger_permissoes` passa a travar
   `owner`/`vendas` em `write`, como os outros módulos.
3. Teto por tipo, numa função que tanto `can_access_module` quanto o portal
   consultam:

   ```sql
   -- true quando o módulo existe para o tipo da organização
   modulo_disponivel(_org_id uuid, _module text) returns boolean
     -- false só para (_module = 'vendas' and client_type = 'marca')

   can_access_module(...) = <consulta atual da 0036>
                            and public.modulo_disponivel(_org_id, _module)
   ```

   O teto fica **acima** da matriz. O owner da marca também não vê o funil.
   O administrador da marca pode até mexer na matriz, mas isso não tem efeito.
4. As policies das tabelas da seção 3.2 trocam `'crm'` por `'vendas'`, nas
   de leitura (`*_tenant_read`) **e** nas de escrita e exclusão
   (`*_module_*`, `*_admin_delete`). Ponto importante: as de exclusão usam
   `has_org_role(owner, admin)` sem passar por `can_access_module`, e por
   isso precisam do `modulo_disponivel` explícito. Senão o owner da marca
   ainda conseguiria apagar oportunidades às cegas pela API.
5. Portal: `NavModule` ganha `vendas`. Em `MODULOS_DE_PERMISSAO`
   (`lib/permissoes.ts`), "Patrocinadores e CRM" fica só com patrocinadores,
   e entra "Funil e captação" (pipeline, propostas, leads). O `can()` de
   `useOrganization` lê `organization_role_grants` direto e não passa por
   `can_access_module`: ele precisa aplicar o mesmo teto com `clientType`.
   `podeVerModuloPadrao` dá ao `comercial` o `vendas`, como faz com o `crm`.
6. `_shared/ai/funcao.ts`: `MODULOS` ganha `vendas`.

Por que não esconder o funil só pela matriz (gravar `none` na linha `vendas`
da marca)? Porque a troca marca → agência teria de inventar valores para
restaurar, e o administrador da marca poderia religar o funil. O teto não muda
dado nenhum e se desfaz sozinho.

### 5.4 RLS: o que é UX e o que é barrado

| O quê | Onde barra | Por quê |
|---|---|---|
| Menu, rotas, cartões, abas | só tela | experiência; o dado já vem vazio da RLS |
| Ler e escrever oportunidade, proposta, lead score, funil | RLS (`can_access_module` + teto) | a feature não existe pela API |
| Insert anônimo de lead | RLS `property_leads_public_insert` (via `is_property_published`) | superfície pública |
| Media kit público | `*_public_read` (via `is_property_published` e irmãs) | superfície pública |
| Funções de IA do funil | `exigirModulo(..., 'vendas')` | gasto de IA e dado do funil |
| RPCs `SECURITY DEFINER` que partem de oportunidade (`create_renewal_opportunity`, `copy_*`) | checagem explícita do tipo | a RLS não vale dentro delas |
| Notificações de funil | `check-notifications` pula as categorias | o gatilho `notify_commercial_team_opportunity_lost` fica inerte sem oportunidade |

O isolamento entre organizações não muda: nada aqui lê dado de outra
organização. A policy restritiva `billing_access_restrictive` continua igual
em todas as tabelas, e não há tabela nova com `organization_id`.

### 5.5 Media kit público e formulário de lead

- `is_property_published(id)` passa a exigir `is_published = true` **e**
  organização `agencia`. Um ponto só tira do ar o media kit da marca, as
  leituras `anon` que dependem dele (inclusive `contracts_public_read`, 0005
  l. 416) e o insert de lead. As irmãs (`is_asset_publicly_visible`,
  `is_sponsor_publicly_visible`, 0004) já chamam `is_property_published`,
  então herdam o filtro sem mudança.
- `PropertyDetail.tsx`: o bloco de publicação e a aba "Leads" somem para a
  marca.
- Recomendação (D2): **não** zerar `is_published` nem `public_slug` na
  troca. O slug fica reservado, e o media kit volta se a organização voltar a
  ser agência.
- A ADR-0011 separa o relatório `/r/:slug` do media kit: ele não depende de
  `is_property_published` e continua no ar.

### 5.6 Rotas

Hoje `ProtectedRoute` não olha módulo. Quem digita `/dashboard/pipeline`
sem acesso ao `crm` vê a tela vazia. Para a marca, a recomendação é um
componente de guarda (em `components/`, usando `can`) nas três rotas, que
redireciona ao Dashboard. Ele vale também para o agente sem `vendas`. Fica
como experiência; a RLS já devolve vazio.

### 5.7 Relatório de entregas sem oportunidade

`generate-delivery-report` e `get_delivery_report_data(_opportunity_id,
_contract_id)` (0030) exigem a oportunidade. O botão existe só no
`OpportunityDrawer`. Para a marca, contrato nasce sem oportunidade, e o
relatório de prestação de contas (o mais útil para ela) desaparece junto com o
funil. É preciso:

- uma variante `get_delivery_report_data_por_contrato(_contract_id)` (ou
  `_opportunity_id` opcional), que leia pelo contrato;
- o botão no detalhe do contrato, para os dois tipos.

Isso também melhora a agência, que hoje só gera o relatório pelo funil.

### 5.8 Cobrança e planos

- `billing_plans` tem só `max_properties` e `max_users`. Pela
  `docs/business/cobranca.md`, nenhum módulo é bloqueado por plano. Nada aqui
  muda isso: o funil some por **tipo**, não por plano.
- Para a marca, "projetos" são os que ela patrocina, não os que
  ela vende. O limite continua fazendo sentido como métrica de uso.
- Planos diferentes por tipo (D9): se o comercial quiser preço próprio para
  marcas, o caminho é uma coluna `billing_plans.client_types text[]`. O
  catálogo (`manage-billing`, `/admin/planos`) passa a filtrar pelo tipo, sem
  mudar os gatilhos de limite. Recomendação: mesmo catálogo na primeira
  entrega.
- Contratação (D10): o pedido diz que o cliente indica o tipo "no cadastro e
  na contratação". Ver a decisão.

### 5.9 Portal do patrocinador

Com a opção (a) da seção 4.1, o patrocinador da marca é ela mesma. O portal
(`sponsor_portal_access`, policies `*_sponsor_portal_read` da 0005)
continua funcionando. Ele passa a servir para dar acesso de leitura a quem
não é membro: outra diretoria, a agência de mídia da marca, um parceiro. Dúvida
(D5): o portal lê `proposals` (`proposals_sponsor_portal_read`). Para a marca
não há proposta, e a policy só não devolve linha. Não precisa mudar nada no
banco.

### 5.10 Plano de equipes (ADR-0012, PRs #46 e #47)

- **Fase 0 (aceite de convite)**: independente.
- **Fase 1 (equipes e vínculos, 0042)**: a coluna `scope` já existe em
  `organization_role_grants`. A linha `vendas` nasce com o `scope` do `crm`
  (seção 5.3). O check da 0042 (`module <> 'team'`) já aceita o módulo novo.
- **Fase 2 (escopo nas policies)**: reescreve as mesmas policies que a fase
  2 deste plano reescreve (`opportunities`, `proposals` e filhas). A ordem
  importa. Recomendação: o módulo `vendas` entra **antes** da fase 2 de
  equipes, para que `no_escopo(organization_id, 'vendas', ...)` já nasça com
  o módulo certo. Senão as mesmas ~15 policies são reescritas duas vezes.
- O plano de equipes (seção 8.3) já prevê módulos novos na matriz
  (`propriedades`, `relatorios`, ...). `vendas` é o primeiro deles e confirma
  o caminho.
- Numeração: 0041 e 0042 estão nas branches de equipes. As migrations deste
  plano começam na próxima livre quando forem escritas (hoje, 0043), e a ADR
  na 0013.

## 6. Troca de tipo e o que acontece com os dados

| | Agência → Marca | Marca → Agência |
|---|---|---|
| Oportunidades, propostas, leads, lead scores | ficam no banco, invisíveis (RLS) | voltam como estavam |
| Funis e SLAs | ficam | voltam |
| Media kit publicado | sai do ar (5.5); `is_published` e slug intactos | volta ao ar sozinho, se ainda publicado |
| Formulário de lead | recusa envio | volta a aceitar |
| Contratos com `opportunity_id` | continuam, o vínculo fica guardado | iguais |
| Matriz de permissões | intacta; o teto esconde `vendas` | intacta |
| Patrocinadores | continuam; rótulo "Marcas" (D3) | rótulo "Patrocinadores" |
| Notificações já enviadas do funil | ficam no histórico; o link abre tela vazia | iguais |
| Conversas com a IA que citaram oportunidades | ficam em `ai_conversations` | iguais |

Pontos de atenção:

- **Oportunidades abertas na troca para marca.** Elas ficam paradas sem
  ninguém ver. O aviso do superadmin (5.2) mostra a contagem antes de
  confirmar. Arquivar ou marcar como perdidas seria regra de negócio nova:
  D11.
- **Conversas de IA e notificações antigas** podem mostrar o nome de uma
  oportunidade que a pessoa já não vê. O dado é da própria organização, então
  não há vazamento. Fica só a inconsistência visual.
- Toda troca fica em `platform_admin_audit_log` com o motivo. Avisar o owner
  por e-mail (`_shared/email.ts`) é D12.

## 7. Opções avaliadas

| | A. Só tela | B. Desligar o `crm` para a marca | **C. Módulo `vendas` + teto por tipo (recomendado)** | D. Recurso por organização à parte (`org_tem_recurso`) |
|---|---|---|---|---|
| Como | `clientType` esconde menu, rotas e blocos | Linhas `crm` da marca em `none` | Funil sai do `crm` para `vendas`; `can_access_module` aplica o teto | Função nova checada nas policies do funil, nas funções e na tela; matriz intacta |
| Banco | Nada | Nada | Check, backfill, `modulo_disponivel`, ~15 policies | Mesmas ~15 policies, com um predicado a mais |
| Media kit e lead | **Continuam vivos** | Continuam (não dependem do `crm`) | Barrados | Barrados |
| Patrocinadores, cotas, portal | Ficam | **Somem** | Ficam | Ficam |
| Edge Functions | Respondem pela API | Barradas junto com o que deveria ficar | Barradas pela troca do módulo | Precisam de checagem nova em cada uma |
| Ganho para a agência | — | — | Separar quem vê o funil de quem cuida da carteira | — |
| Desfazer | trivial | precisa restaurar a matriz | trivial | trivial |
| Risco | Feature "escondida" que ainda roda | Quebra a marca | Médio (policies) | Médio, e dois mecanismos para explicar |

**C** é a recomendada porque usa o mecanismo que já existe (matriz + `can_access_module`).
Ela tem um único ponto de decisão no banco, já alcançado pelas Edge Functions
de IA, e o custo nas policies é o mesmo de D. Se aparecerem mais tipos ou
recursos por plano, o teto vira tabela (`client_type_modules`) sem mudar as
policies.

## 8. Fases

| Fase | Entrega | Banco | Risco |
|---|---|---|---|
| **0** | Fechar as decisões da seção 9; ADR-0013; regras em `docs/business/tipo-de-cliente.md` | — | — |
| **1** | Tipo gravado, sem efeito na tela: coluna, proteção, cadastro, `create-organization`, admin com auditoria, `clientType` no `useOrganization` | `client_type`, gatilho de proteção, `admin_alterar_tipo_de_cliente`, `create_organization_with_owner(_client_type)`, `handle_new_user`, `admin_clientes`/`_detalhe` | Baixo: coluna nova com padrão |
| **2** | Módulo `vendas` e teto: funil some para a marca no banco e na tela; media kit e lead barrados; guarda de rota | check e backfill da matriz, `modulo_disponivel`, `can_access_module`, ~15 policies, `is_property_published`, RPCs `copy_*`/renovação | **Alto**: muda policies; deve entrar antes da fase 2 de equipes |
| **3** | Telas compartilhadas: Dashboard, Contratos, Entregas, Patrocinador, Projeto, Calendário, Relatórios, Notificações, IA (prompts e ferramentas); relatório de entregas por contrato; rótulos (D3, D6) | `get_delivery_report_data` por contrato | Médio |
| **4** | Cobrança por tipo, se D9 pedir; confirmação na contratação (D10) | `billing_plans.client_types` | Baixo |

Fases 1 e 2 podem ir juntas para produção, mas a 1 sozinha já é segura:
organização marca criada só com a fase 1 vê tudo, como uma agência, até a
fase 2.

## 9. Decisões

Fechadas em 2026-11-03. O usuário respondeu D2/D11 (troca), D3/D7
(patrocinador, cotas, renovação), D9/D10 (cobrança e contratação) e a opção
de RLS (módulo `vendas` + teto), todas na recomendação. As demais seguem a
recomendação da tabela.

| # | Pergunta | Decisão |
|---|---|---|
| D1 | Nomes: `client_type` (`agencia`/`marca`) no banco; "Agência" e "Marca" na tela; "Agência ou detentor de direitos" no cadastro? | Sim |
| D2 | O media kit público e o formulário de lead somem para a marca? | Sim. São captação. Barrar no banco e manter `is_published`/slug para a volta |
| D3 | O que é "patrocinador" para a marca? (4.1) | (a): o patrocinador é a marca ou as marcas do grupo; renomear o menu para "Marcas"; ciclo de vida `prospect … cliente_ativo` escondido |
| D3a | Precisa de campo de detentor de direitos e contato no projeto? | Sim, mas na fase 3, como campos simples em `sports_properties`; não criar entidade nova sem pedido |
| D4 | `crm_tasks` e `sponsor_proposal_profiles` ficam com a marca? | `crm_tasks` fica (tarefa do patrocinador, sem vínculo de oportunidade); `sponsor_proposal_profiles` vai para `vendas` |
| D5 | Portal do patrocinador para a marca | Fica como está: leitura para quem não é membro (outra área, agência de mídia) |
| D6 | Financeiro da marca é "a pagar"? Trocar rótulos (Recebido → Pago, Previsto → A pagar, inadimplência → vencido)? | Sim, só rótulos, na fase 3; `revenue-forecast` some para a marca |
| D7 | Cotas, vendas de cota, sell-out e renovação para a marca | Cotas ficam (a marca registra a cota que comprou); `QuotaHeatmapWidget` e sell-out somem; renovação some (não cria oportunidade) e vira alerta de vencimento já existente nos contratos |
| D8 | Quais IAs ficam para a marca? | Ficam ROI, benchmark de ticket, BrandTrack, resumo executivo, insights de tarefa, assistente sem as ferramentas de oportunidade e próximos passos sem os contextos do funil. Somem lead scoring, proposta, previsão de receita e preparação de reunião. Churn: esconder até existir a versão "risco do contrato para a marca" |
| D9 | Planos e limites mudam por tipo? | Não na primeira entrega: mesmo catálogo e mesmos limites. Se o comercial pedir, `billing_plans.client_types` (5.8) |
| D10 | "Indicar o tipo na contratação": o que significa, se o tipo já veio do cadastro? | O tipo é escolhido no cadastro (obrigatório) e **mostrado** no checkout para conferência. O owner pode corrigir **só enquanto não houver assinatura** (teste grátis); depois, só o superadmin. Alternativa mais simples: só no cadastro, e o superadmin corrige |
| D11 | Oportunidades abertas na troca agência → marca | Não mexer: ficam como estão e voltam se o tipo voltar; o superadmin vê a contagem antes |
| D12 | Avisar o owner por e-mail quando o superadmin troca o tipo? | Sim, com o texto do que muda; sem o motivo interno |
| D13 | Papel `comercial` na marca | Manter o papel (enum `org_role`); na marca ele cuida de patrocinadores e contratos. Renomear na tela ("Patrocínio") só se o cliente pedir |
| D14 | Uma organização pode ser os dois (agência que também é marca)? | Não. Um tipo por organização; quem precisar dos dois usa duas organizações, o que o modelo de tenant já permite (ADR-0002) |

## 10. Testes

Em `supabase/tests/` (novo `tipo_de_cliente.sql`, no estilo de
`seguranca.sql`), com uma organização agência e uma marca:

- membro da marca (owner, admin, comercial e sessão de suporte) não lê,
  não insere, não altera e não exclui oportunidade, proposta, item e versão de
  proposta, lead score, lead, funil, SLA e probabilidade de estágio;
- na agência, o comportamento é o de hoje: `seguranca.sql`, `cobranca.sql`,
  `relatorios.sql` e `equipes.sql` passam sem mudança;
- na agência, o papel com `vendas = none` e `crm = write` lê e edita
  patrocinadores e não vê o funil;
- marca lê e escreve patrocinadores, cotas, contratos, parcelas e entregas;
- `anon` não lê o media kit nem envia lead para projeto publicado de
  marca; volta a ler depois da troca para agência;
- owner/admin não mudam `client_type` por `update` direto; só
  `admin_alterar_tipo_de_cliente`, por superadmin, com comentário, gravando em
  `platform_admin_audit_log`;
- `handle_new_user` com `client_type` inválido grava `agencia`;
- `create_renewal_opportunity` e `copy_*` recusam organização marca;
- `get_delivery_report_data` por contrato funciona sem oportunidade;
- teste `(m)` de `cobranca.sql` continua passando (nenhuma tabela nova com
  `organization_id`).

Funções (`deno test` em `_shared/`): `exigirModulo` com `vendas`.
Unitário (Vitest): `gruposVisiveis` e `can` com o teto por tipo,
`podeVerModuloPadrao` com `vendas`. E2E: cadastro como marca → menu sem
Pipeline, Propostas e Lead Scoring → `/dashboard/pipeline` redireciona.

## 11. Riscos

- **Policies de ~15 tabelas mudam.** Um erro esconde o funil de uma agência ou
  deixa aberto o de uma marca. Mitigação: backfill `vendas = crm`, testes
  antes do merge, homologação com uma agência real.
- **Exclusão por `has_org_role`** não passa por `can_access_module` (5.3,
  item 4). É o ponto mais fácil de esquecer.
- **Caminhos fora da RLS** (RPCs `SECURITY DEFINER`, Edge Functions com
  service role, `check-notifications`, agregados) precisam de checagem
  própria. Mesma lição da seção 7.6 do plano de equipes.
- **Conflito com a fase 2 de equipes**, que reescreve as mesmas policies
  (5.10). Combinar a ordem antes de abrir os PRs.
- **Frontend com dois cálculos de acesso**: o `can()` lê a matriz direto. Se
  o teto não for aplicado também ali, o menu mostra o que o banco nega.
  Mitigação: um helper em `lib/permissoes.ts`, com teste unitário.
- **Sentido invertido** no financeiro, no churn e nos prompts (4.3). Se a
  fase 3 atrasar, a marca vê "Recebido" onde pagou. Não é risco de
  segurança, mas confunde o cliente. Lançar a marca para clientes só com a
  fase 3 pronta.
- **Nome "Marca"** colide com o kit de marca, o BrandTrack e
  `opportunities.brand` (seção 2). Usar `client_type` no código evita a
  confusão no banco; na tela, revisar os textos de ajuda.

## 12. Achados da implementação (2026-11-03)

- `sports_properties_public_read` (0005) lia `is_published` direto, sem
  passar por `is_property_published`. Sem a correção na 0043, a página
  pública do projeto de uma marca continuaria legível por `anon`.
- `check-notifications` já usa o client do usuário: com a RLS, as categorias
  do funil não geram nada para a marca, e a função não mudou.
- `Calendar.tsx` lê `opportunity_activities` e o embed de oportunidade em
  `crm_tasks` pelo client do usuário. Para a marca, a RLS devolve vazio, e a
  tela não mudou.
- `Reports.tsx` já tinha uma variável `marca` (kit de marca, 0034): o
  conflito de nomes da seção 2 apareceu no código. A do tipo se chama
  `clienteMarca`.
- `team_audit_log_action_check` precisou ser recriado (ação
  `client_type_changed`). A 0043 parte da lista da 0042 (equipes), que vem
  antes na ordem.
- Rotas `/dashboard/pipeline`, `/propostas` e `/lead-scoring` passam por
  `ModuleRoute` (`vendas`). Agência com papel sem `vendas` também volta ao
  Dashboard, em vez de ver a tela vazia.
- Ficaram de fora (seguir quando houver pedido): prompts de IA do ponto de
  vista de quem compra (D8), rótulo "Patrocinador" dentro das telas de
  detalhe e formulários da marca, campos de detentor de direitos na
  projeto (D3a).
