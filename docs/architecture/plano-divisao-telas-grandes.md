# Plano: dividir as telas grandes do portal

- **Data**: 2026-10-21 (revisado contra `dev` em 2026-11-07)
- **Status**: proposta — **nenhuma das três telas foi dividida**. A revisão de
  2026-11-07 (seção 0) atualizou os números e registrou duas mudanças que
  afetam o desenho: os filtros do Pipeline passaram para `useFiltroSalvo` e o
  tipo de cliente (ADR-0013) esconde três abas da propriedade.
- **Origem**: auditoria de UX/UI do portal, fase de jornada do usuário.
- **Escopo**: `portal/src/pages/dashboard/PropertyDetail.tsx`,
  `portal/src/pages/dashboard/Pipeline.tsx` e
  `portal/src/components/pipeline/OpportunityDrawer.tsx`. Sem mudança de banco,
  RLS ou Edge Function.

## 0. Revisão de 2026-11-07

Cada item do plano conferido contra `dev` (HEAD `f006b4a`). Legenda:
**pendente** (trabalho não feito, que continua valendo), **mantida** (premissa
conferida e ainda válida), **ajustado** (vale, com mudança no texto),
**mudou de rumo** (a proposta original deixou de ser a melhor) e **novo**.
Nenhum item do plano está **feito**.

| Item | Situação | Evidência em `dev` |
|---|---|---|
| Dividir `OpportunityDrawer.tsx` (1º PR) | pendente | Continua com 1.800 linhas e um só componente (`OpportunityDrawer`, linhas 217–1800). As abas têm o mesmo tamanho do plano: Jornada 3 linhas, Detalhes 204, Atividades 132, Timeline 109, Ações 26. Não existe `components/pipeline/drawer/` |
| Dividir `PropertyDetail.tsx` | pendente | 3.222 linhas (eram 3.206), um componente de 2.958 linhas (264–3222), 46 `useState`, 13 abas, ~520 linhas de diálogos no fim (a partir da linha 2705). Não existe `components/property/detail/` nem `usePropertyDetail`. Galeria e checklist continuam componentes próprios (`components/property/PropertyMediaGallery.tsx`, `PropertyChecklist.tsx`) |
| Dividir `Pipeline.tsx` | pendente | 2.351 linhas (eram 2.393); o componente principal (285–1542) ainda tem ~1.258 linhas e o arquivo ainda carrega 16 subcomponentes locais (eram 15: entrou `PipelineEmptyState`). Nada foi movido para `components/pipeline/` |
| Filtros do Pipeline na URL | mudou de rumo | Os 14 filtros agora são `useFiltroSalvo("pipeline", ...)` (issue #51, commit `97a13aa`): guardados no `localStorage` por organização, não na URL. Isso resolve "sobreviver ao recarregar"; não resolve "compartilhar o link". Ver seção 3 e pergunta 1 da seção 7 |
| Reagrupar as abas da propriedade (13 para 6) | ajustado | As 13 abas continuam. Desde o ADR-0013, `proposals`, `public` e `leads` só aparecem com o módulo `vendas` (`PropertyDetail.tsx`, `temVendas`); a organização marca vê 10. O reagrupamento precisa dizer o que acontece com a marca: seção 2 e pergunta 2 da seção 7 |
| Aba ativa na URL (`?aba=`) | pendente | A aba ativa é `useState` e é lembrada em `localStorage` (`propertyTab:<id>`, linhas 273–278); nenhuma das três telas usa `useSearchParams`. No drawer a aba é `useState("jornada")` |
| Dados por aba com react-query | pendente | As três telas ainda não têm `useQuery`. O padrão de referência já existe no repositório: `hooks/useEquipesDeTrabalho.ts` (chave `["equipes-de-trabalho", orgId]`, `enabled: !!orgId`), `useRelatorios.ts`, `useBilling.ts` |
| Rede de proteção E2E antes de começar | ajustado | Hoje há quatro specs em `portal/e2e/` (`admin-ia`, `create-negotiation-permissions`, `recuperacao-senha`, `superadmin`), não só um. `create-negotiation-permissions` cobre criar uma negociação no Pipeline. Os três fluxos que o plano pede (criar cota na propriedade, mover etapa no kanban, registrar atividade no drawer) **continuam sem E2E** |
| Premissa "sem mudança de banco, RLS ou Edge Function" | mantida | Continua válida. As policies de domínio agora checam `vendas` em vez de `crm` (`0043`) e a fase 2 de equipes (ADR-0012, não iniciada) vai filtrar as consultas por escopo, mas as consultas só mudam de lugar e herdam o que a RLS devolver |
| `PipelineInsights` (painel "Atenção hoje", gargalos, perdas, desempenho) | ajustado | Não confundir com `components/pipeline/PipelineMetrics.tsx`, que já existe (funil e KPIs, usado na linha 1124 de `Pipeline.tsx`). `PipelineInsights` reúne `AttentionToday`, `StageConversionBottlenecks`, `LossesByReason`, `AssigneePerformanceDashboard` e `BoardRecommendations` |
| Outras telas grandes | novo | Fora do plano original: `Contracts.tsx` 1.798 linhas, `Deliveries.tsx` 1.519, `Proposals.tsx` 1.494 e `Assets.tsx` 1.179. Não entram aqui; ver seção 6 |

Os números da tabela do problema (seção 1) foram recontados em 2026-11-07.
Os `useState` de hoje contam chamadas (46, 33 e 24); os do plano original (47,
48 e 25) incluíam a linha de `import`. Os de "Consultas ao Supabase" do plano
original (14, 18 e 14) não registravam o critério e não são comparáveis com os
atuais, que contam chamadas `.from(`, `.rpc(` e `functions.invoke` no arquivo.

## 1. Problema

Três arquivos concentram fluxos críticos e cresceram sem divisão:

| Arquivo | Linhas | `useState` | Chamadas ao Supabase | Estrutura |
|---|---|---|---|---|
| `pages/dashboard/PropertyDetail.tsx` | 3.222 | 46 | 39 `.from(` | 1 componente, 13 abas (10 para a marca), ~520 linhas de diálogos no fim |
| `pages/dashboard/Pipeline.tsx` | 2.351 | 33 (+14 filtros em `useFiltroSalvo`) | 20 `.from(` e 1 `functions.invoke` | componente principal de ~1.258 linhas + 16 subcomponentes no mesmo arquivo |
| `components/pipeline/OpportunityDrawer.tsx` | 1.800 | 24 | 29 `.from(`, 3 `.rpc(` e 1 `functions.invoke` | 1 componente, 5 abas |

Efeitos para quem usa:

- **Propriedade**: 13 abas lado a lado (Visão geral, Cotas, Mapa de ativos,
  Agenda, Temporadas, Propostas, Contratos, Patrocinadores, Galeria,
  Checklist, Página pública, Leads, Sobre & Dados). No celular viram uma faixa
  com rolagem horizontal, e o que é do dia a dia (cotas, ativos) disputa
  espaço com o que é de configuração (página pública, temporadas).
- **Tudo carrega junto**: as consultas da propriedade rodam ao abrir a tela,
  mesmo que a pessoa só olhe uma aba.
- **Qualquer mudança é arriscada**: 46 estados no mesmo componente e diálogos
  que dependem de estado compartilhado. Uma alteração numa aba re-renderiza
  todas.

Efeitos para quem mantém: diff difícil de revisar, sem teste unitário possível
(nada é isolável) e conflito garantido entre PRs que mexem em abas diferentes.

## Princípios

1. **Um PR por tela, e dentro dele uma aba ou seção por commit.** Nada de
   reescrever tudo de uma vez.
2. **Mesmo comportamento primeiro, melhoria depois.** Cada extração é
   refatoração pura, conferida no navegador antes de seguir. Mudança de UX
   (reagrupar abas) só depois que o código estiver dividido.
3. **Dados por aba com react-query** (regra do projeto para código novo,
   `.claude/rules/architecture.md`): cada aba busca o que precisa só quando é
   aberta, com cache compartilhado. As escritas invalidam as chaves da
   propriedade. A chave leva a organização ativa, como em
   `useEquipesDeTrabalho`.
4. **Sem mudança de banco, RLS ou Edge Function.** As consultas continuam as
   mesmas, só mudam de lugar. O filtro por `organization_id` vem do
   `useOrganization`, como hoje.

## 2. Propriedade (`PropertyDetail.tsx`)

### Estrutura proposta

```
pages/dashboard/PropertyDetail.tsx        casca: cabeçalho, breadcrumbs, abas (~150 linhas)
components/property/detail/
  usePropertyDetail.ts                    propriedade + invalidação (react-query)
  PropertyOverviewTab.tsx                 dashboard + sobre
  PropertyTiersTab.tsx                    cotas, mapa de cotas, diálogo de cota
  PropertyAssetsTab.tsx                   ativos alocados, mapa, editor de alocação
  PropertyScheduleTab.tsx                 agenda + temporadas
  PropertyCommercialTab.tsx               propostas, contratos, patrocinadores
  PropertyPublicTab.tsx                   página pública + leads
  (galeria e checklist já são componentes próprios, em components/property/)
```

`components/property/` já existe (galeria e checklist); a pasta `detail/` é
nova.

### Reagrupamento das abas (depois da divisão)

De 13 para 6:

| Aba nova | Junta |
|---|---|
| Visão geral | Dashboard, Sobre |
| Cotas | Cotas |
| Ativos | Mapa de ativos, Galeria |
| Agenda | Agenda, Temporadas, Checklist |
| Comercial | Propostas, Contratos, Patrocinadores |
| Página pública | Página pública, Leads |

A aba ativa vai para a URL (`?aba=cotas`), para o link e o voltar do navegador
funcionarem. Hoje ela só fica no `localStorage` por propriedade; o valor salvo
passa a ser o padrão quando a URL não traz `aba`.

**Tipo de cliente (ADR-0013).** A organização marca não tem o módulo `vendas`
e hoje não vê Propostas, Página pública e Leads; a tela já cai em "Visão geral"
se a aba salva for uma dessas. No reagrupamento: "Página pública" não existe
para a marca, e "Comercial" fica só com Contratos e Patrocinadores. O código
continua condicionado a `useOrganization().can("vendas")`, agora dentro das
abas novas e não na lista de abas. O nome que a marca vê em "Comercial" é a
pergunta 2 da seção 7: a aba de patrocinadores hoje tem o mesmo nome para as
duas, e `docs/business/tipo-de-cliente.md` chama a lista de "Marcas" na tela.

### Ordem

1. Hook `usePropertyDetail` + casca. As abas ainda recebem props do pai.
2. Extrair as abas menores (comercial, página pública, agenda), uma por commit.
3. Extrair cotas e ativos, as maiores (~280 linhas cada), com os diálogos delas.
4. Passar cada aba para a própria consulta (react-query, sob demanda).
5. Reagrupar as abas e levar a aba ativa para a URL.

## 3. Pipeline (`Pipeline.tsx`)

O arquivo já tem subcomponentes; o problema é o componente principal.

```
pages/dashboard/Pipeline.tsx              casca: cabeçalho, filtros, troca de visão
components/pipeline/
  usePipelineData.ts                      oportunidades, funis, responsáveis (react-query)
  usePipelineFilters.ts                   os 14 filtros (useFiltroSalvo), ordenação, filtrado
  PipelineInsights.tsx                    "Atenção hoje", gargalos, perdas, desempenho
  PipelineBoard.tsx                       kanban (KanbanColumn, DraggableCard, OpportunityCard)
  PipelineTableView.tsx / PipelineCompactView.tsx
```

Os subcomponentes locais a mover são 16: `DateFilterButton`,
`PipelineViewToggle`, `PipelineSortSelect`, `AttentionToday`,
`StageConversionBottlenecks`, `LossesByReason`, `AssigneePerformanceDashboard`,
`BoardRecommendations`, `PriorityBadge`, `SortableTableHead`,
`PipelineTableView`, `PipelineCompactView`, `PipelineEmptyState`,
`KanbanColumn`, `DraggableCard` e `OpportunityCard`. `PipelineMetrics` já está
em `components/pipeline/` e não entra na divisão.

**Filtros: mudou de rumo.** O plano original propunha levar os filtros para a
URL. Desde o issue #51 (`97a13aa`, `.claude/rules/frontend.md`) a regra do
projeto para filtro de listagem é `useFiltroSalvo`: valor guardado no
`localStorage` por organização ativa, com descarte de valor salvo inválido. O
Pipeline já o usa nos 14 filtros; `viewMode` e `sortMode` (linhas 317–325)
seguem como `useState` com `localStorage` à mão, o que a mesma regra aceita
para preferência de visualização. Portanto:

- `usePipelineFilters` **envolve** os 14 `useFiltroSalvo`, a ordenação e a
  derivação da lista filtrada; não cria um segundo mecanismo de persistência.
- O ganho "sobrevive ao recarregar" já existe. O que a URL daria a mais é
  **compartilhar a visão por link**; só vale se alguém precisar (pergunta 1 da
  seção 7). Se vier, entra como camada por cima, sem trocar o
  `useFiltroSalvo`.

Ordem: mover os 16 subcomponentes para arquivos próprios (sem mudar nada) →
`usePipelineFilters` → `usePipelineData` → `PipelineInsights` sob demanda (só
calcula quando o painel está aberto; o estado `showInsights` já existe).

## 4. Detalhe da oportunidade (`OpportunityDrawer.tsx`)

Cinco abas: Jornada (3 linhas), Detalhes (204), Atividades (132), Timeline
(109) e Ações (26). Extrair Detalhes, Atividades e Timeline para
`components/pipeline/drawer/`, cada uma com a própria consulta, e manter o
drawer como casca. É a menor das três e um bom primeiro PR para validar o
padrão. A carga inicial do drawer hoje junta oportunidade, atividades, cotas,
log de auditoria da oportunidade e comentários numa só rodada; cada aba nova
passa a buscar só o que mostra.

## 5. Validação de cada PR

- `npm run type-check`, `npm test`, `npm run build`.
- **Teste E2E do fluxo** antes de começar, para servir de rede de proteção
  (hoje há quatro specs, nenhum deles nestes três fluxos): abrir propriedade e
  criar cota; mover oportunidade de etapa no kanban; registrar atividade no
  drawer. Os três estão na lista de fluxos críticos de `.claude/rules/testing.md`.
  O `create-negotiation-permissions.spec.ts` serve de modelo para o login
  (`E2E_USER_EMAIL` e `E2E_USER_PASSWORD`, com `test.skip` sem eles).
- Conferência no navegador de cada aba extraída, com dados (Supabase local com
  seed), nas duas visões: organização agência e organização marca (para a
  propriedade).

## 6. Riscos e o que fica de fora

- Diálogos que hoje leem estado de várias abas (ex.: editor de alocação usado
  pelo mapa de ativos e pela aba de cotas) precisam de dono claro: ficam com a
  aba que os abre e recebem callbacks.
- O reagrupamento muda onde as coisas estão: avisar o time e conferir com quem
  usa antes de publicar em produção.
- Conflito com PRs em andamento nas mesmas telas (por exemplo, trocar
  `PipelineEmptyState` pelo componente comum de estado vazio): fazer a
  extração em cima de `dev` atualizado e um subcomponente por commit reduz o
  retrabalho.
- **Fora deste plano**: outras telas já passam de mil linhas (`Contracts.tsx`
  1.798, `Deliveries.tsx` 1.519, `Proposals.tsx` 1.494, `Assets.tsx` 1.179).
  Não foram avaliadas. Se o padrão das três primeiras funcionar, vale um plano
  próprio para elas; não entram aqui.

## 7. Decisões em aberto (precisam do usuário)

| # | Pergunta | Proposta padrão |
|---|---|---|
| 1 | Alguém precisa **compartilhar** a visão filtrada do Pipeline por link? | Não por ora: `useFiltroSalvo` já cobre o recarregamento, e a URL volta a ser considerada se o pedido aparecer |
| 2 | Na organização marca, como fica a aba "Comercial" (só Contratos e Patrocinadores, sem "Página pública") e o rótulo "Patrocinadores" da aba? | Não decidir na divisão (refatoração pura); decidir junto com o reagrupamento, com quem desenhou a visão de marca (`plano-visao-de-marca.md`, seção 4.3) |
| 3 | Reagrupar as abas (13 para 6) junto com a divisão do código ou só depois? | Depois, como no plano original: a divisão é refatoração pura, o reagrupamento muda a navegação |

## Ordem sugerida entre as telas

1. `OpportunityDrawer`: o menor, valida o padrão.
2. `PropertyDetail`: o maior ganho de UX (13 abas para 6).
3. `Pipeline`: dividir o componente principal (filtros já persistem).

Cada uma num PR próprio, com E2E do fluxo antes.
