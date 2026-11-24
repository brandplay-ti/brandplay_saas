# Plano: versão mobile do portal

- **Data**: 2026-11-23
- **Status**: proposta. Nenhuma demanda iniciada.
- **Origem**: análise do portal para uso no celular, feita sobre `dev`
  (`ce13217`).
- **Escopo**: `portal/src/` (layouts, componentes de `components/`, páginas do
  painel, App de Campo e portal do patrocinador). Sem mudança de banco, RLS ou
  Edge Function. A área `/admin` fica de fora (seção 8).
- **Design**: canvas "BrandPlay Mobile", com 10 telas a 390×844 e as
  demandas anotadas ao lado de cada linha
  (<https://claude.ai/artifact/8xKHyEsHxz3MbQNhPhucRL>, privado até ser
  compartilhado).

O alvo é o **navegador do celular** (360–430px de largura), com o portal
instalável como PWA. Não é um app nativo: o mesmo código React atende desktop
e celular, e o ponto de corte é o que o projeto já usa, `md` = 768px
(`useIsMobile`, `hooks/use-mobile.tsx`).

## 1. Diagnóstico

O que o portal faz hoje numa tela de celular, conferido no código:

| Ponto | Situação em `dev` | Efeito no celular |
|---|---|---|
| Navegação do painel | `DashboardLayout` usa a `Sidebar` do shadcn, que abaixo de 768px já vira `Sheet` lateral (`ui/sidebar.tsx`, `openMobile`). São 8 grupos e até 22 itens (`lib/navegacao.ts`) | Funciona, mas todo destino fica a 2 toques (hambúrguer e item). Não há atalho para o que se usa todo dia |
| Cabeçalho | 64px com `SidebarTrigger`, logo, `CommandMenu`, `OrganizationSwitcher`, `NotificationsBell` e avatar na mesma linha | A 375px os seis elementos se espremem. A troca de organização disputa espaço com a busca |
| Assistente IA | `AIAssistantTrigger`: botão fixo de 56px em `bottom-6 right-6` | Cobre o último item das listas e as ações de rodapé dos formulários |
| Tabelas | `<Table>` em 23 arquivos. Entregas tem 9 colunas (`Deliveries.tsx`); Pipeline em lista tem colunas com `min-w-[180px]` | Rolagem horizontal escondida. Em Entregas a coluna de ações fica fora da tela |
| Diálogos | `<Dialog>` em 41 arquivos (63 usos). `DialogContent` é centrado, `max-w-lg`, sem altura máxima nem rolagem própria (`ui/dialog.tsx`) | Formulário longo passa da altura da tela e o botão de salvar some. O teclado virtual cobre os campos de baixo |
| Gaveta de baixo | `ui/drawer.tsx` (vaul 0.9) está instalado, mas **nenhuma tela usa** | Já existe o primitivo certo para o celular; falta o componente de composição |
| Pipeline (kanban) | Colunas `w-72` em `overflow-x-auto`, arraste com `PointerSensor` e `distance: 5` (`Pipeline.tsx`) | Uma coluna por tela e rolagem lateral. O arraste começa com 5px de movimento, então rolar a lista com o dedo pode arrastar o cartão |
| Abas de detalhe | `TabsList` com `flex-wrap`: 11 abas no patrocinador (`SponsorDetail.tsx`), 13 no projeto (`PropertyDetail.tsx`) | As abas ocupam 3–4 linhas antes do conteúdo |
| Calendário | Grade mensal `grid-cols-7` (`Calendar.tsx`) | Células de ~50px: os compromissos viram pontos ilegíveis |
| Grades de formulário | `grid-cols-2` sem prefixo em vários formulários | Dois campos de ~170px lado a lado, rótulos cortados |
| Fonte dos campos | `Input` usa `text-base md:text-sm`. `Textarea` e `Select` usam `text-sm` fixo | No iOS, campo com fonte menor que 16px dá zoom na página ao receber foco. Acontece hoje em toda `Textarea` e `Select` |
| Alvos de toque | `Button` `default`/`icon` = 40px, `sm` = 36px | Abaixo dos 44px recomendados. Ícones de ação em linha de tabela ficam ainda menores |
| App de Campo (`/campo`) | Já é mobile-first: barra inferior com 2 abas, câmera com `capture="environment"`, geolocalização e compressão (`lib/fieldUtils.ts`) | Bom ponto de partida e referência de padrão. O cabeçalho usa um emoji como logo |
| Portal do patrocinador | Abas no topo, em `overflow-x-auto` (`PortalLayout.tsx`) | Funciona, mas a navegação fica longe do polegar |
| PWA | Há `theme-color` e `apple-touch-icon`. Não há `manifest.webmanifest` nem service worker | Não dá para instalar na tela inicial com ícone e tela cheia |

## 2. Princípios

1. **Um código só.** Nada de rotas `/m/...` nem páginas duplicadas. A mesma
   página decide o layout pelo ponto de corte (`useIsMobile` ou classes `md:`).
2. **Compor sobre o shadcn.** Os componentes novos ficam em
   `components/common/` (ou `components/layout/`) e compõem `ui/drawer`,
   `ui/sheet`, `ui/table` e `ui/tabs`. Não se edita `components/ui/` para uma
   tela só (`.claude/rules/architecture.md`). A exceção são os ajustes globais
   de alvo de toque e fonte (MOB-08), que valem para todas as telas.
3. **Menu de fonte única.** A barra inferior e o menu Mais leem
   `NAV_GROUPS`/`gruposVisiveis` (`lib/navegacao.ts`), como a barra lateral e
   o `CommandMenu`. Esconder um atalho continua sendo só experiência: quem barra
   é a RLS.
4. **Celular não é desktop menor.** Cada tela escolhe o que vem primeiro no
   celular: atrasos e próximas ações no painel, uma etapa por vez no pipeline,
   o dia de hoje na agenda.
5. **Polegar primeiro.** Ações principais no rodapé, alvos de pelo menos 44px,
   gaveta de baixo em vez de diálogo centrado.
6. **Sem regressão no desktop.** Toda demanda mantém o desktop como está, com
   uma exceção: os componentes novos (ResponsiveDialog, ListaResponsiva) podem
   corrigir de passagem problemas que o desktop também tem, como diálogo sem
   rolagem.

## 3. Componentes

### Novos

| Componente | Onde | O que faz | Base |
|---|---|---|---|
| `MobileHeader` | `components/layout/` | Cabeçalho de 56px: organização ativa (abre a troca), busca, sino e avatar. Em telas internas, troca a organização por "voltar" e o título | `OrganizationSwitcher`, `CommandMenu`, `NotificationsBell` existentes |
| `BottomNav` | `components/layout/` | Barra inferior com 4 atalhos e o Mais, `aria-current` no ativo, `env(safe-area-inset-bottom)`. Os atalhos vêm de uma lista curta em `navegacao.ts` (`ATALHOS_MOBILE`), filtrada por `gruposVisiveis` | Padrão do `FieldLayout` |
| `MenuMobile` | `components/layout/` | Tela do Mais: organização ativa no topo, os grupos do menu como chips e a conta (nome, e-mail, Sair) no rodapé. A equipe da plataforma vê também o `ClientSelector` | `ui/sheet` (`side="bottom"`, altura total) |
| `ResponsiveDialog` | `components/common/` | Mesma API do `Dialog` (`open`, `onOpenChange`, título, descrição, corpo, rodapé). Desktop: `Dialog` com altura máxima e corpo rolável. Celular: `Drawer` de baixo com alça, cabeçalho e rodapé fixos | `ui/dialog`, `ui/drawer` |
| `ListaResponsiva` | `components/common/` | Recebe as linhas e uma descrição das colunas (qual é título, quais são metadados, qual é status, quais ações). Desktop: `Table` como hoje. Celular: um cartão por linha com título, 2–3 metadados, `StatusBadge` e menu de ações | `ui/table`, `common/StatusBadge` |
| `FiltrosMobile` | `components/common/` | Chips de filtro rápido (rolagem lateral) e botão "Filtros (n)" que abre `ResponsiveDialog` com os filtros avançados. Não guarda estado: recebe os valores e setters do `useFiltroSalvo` da página | `useFiltroSalvo` |
| `AbasRolaveis` | `components/common/` | `TabsList` em faixa única com rolagem lateral, sem `flex-wrap`, rolando a aba ativa para a vista | `ui/tabs` |
| `BarraDeAcoes` | `components/common/` | Rodapé fixo com 2–4 ações (contato, nova tarefa, aprovar). Só no celular | — |

### Adaptados

| Componente | Mudança |
|---|---|
| `DashboardLayout` | No celular, `MobileHeader` + `BottomNav` no lugar do cabeçalho atual. A `AppSidebar` continua só no desktop. `main` ganha `pb` para a barra inferior |
| `AIAssistantTrigger` / `AIAssistantDrawer` | No celular, o botão sobe para cima da barra inferior (`bottom-[88px]`) e some quando há gaveta aberta. A gaveta abre em tela cheia |
| `PageHeader` | No celular, título em 22px e ações principais em ícones ou no menu de ações. Hoje as ações só quebram linha |
| `OpportunityDrawer`, gavetas de `Contracts`, `Assets`, `Finance` | Já são `w-full` no celular. Ganham cabeçalho e rodapé fixos e abas em `AbasRolaveis` |
| `CurrencyInput`, `NumberInput`, `DateInput` | `inputMode` numérico onde faltar. O calendário do `DateInput` abre em gaveta no celular |
| `ui/textarea`, `ui/select` | `text-base md:text-sm`, como o `Input`, para o iOS não dar zoom |
| `ui/button` | No celular, `default` e `icon` com 44px (`h-11 md:h-10`) |
| `FieldLayout` | Logo do BrandPlay no lugar do emoji. Detalhe da entrega com botão de câmera fixo no rodapé e aviso de envio pendente |
| `PortalLayout` | No celular, as 3 abas viram barra inferior |

## 4. Telas

Cada tela tem uma prancheta no canvas.

| Tela | Rota | Solução no celular | Demandas |
|---|---|---|---|
| Início | `/dashboard` | KPIs em 2×2. Os widgets descem para uma coluna, com "Entregas atrasadas" e "Próximas ações" primeiro. "Personalizar" abre em gaveta | MOB-01, MOB-10 |
| Menu Mais | — | Organização ativa, grupos do menu e conta numa tela só | MOB-02 |
| Pipeline | `/dashboard/pipeline` | Chips de etapa com contagem e total. Lista dos cartões da etapa escolhida. "Mover" abre a gaveta de etapas (com motivo quando é Perdido). "Nova" fica fixa acima da barra inferior | MOB-11 |
| Entregas | `/dashboard/entregas` | Cartões no lugar da tabela de 9 colunas. Chips de status (Atrasadas, Em produção, A aprovar) e "Filtros (n)" para o resto | MOB-04, MOB-05, MOB-12 |
| Formulários | todos os `Dialog` de criação/edição | Gaveta de baixo, campos em uma coluna, rodapé fixo com Cancelar e a ação principal | MOB-03, MOB-15 |
| Detalhe | `/dashboard/patrocinadores/:id`, `/dashboard/propriedades/:id`, contratos | Abas em faixa rolável. Resumo em blocos de uma coluna. Barra fixa com Ligar, WhatsApp, E-mail e Tarefa | MOB-13 |
| Calendário | `/dashboard/calendario` | Visão Agenda como padrão: faixa da semana com marcação dos dias com compromisso e lista do dia. A visão Mês continua disponível | MOB-14 |
| App de Campo | `/campo/entregas/:id` | "Tirar foto" fixo, "Da galeria" e "Marcar entregue". Evidências em grade com o estado de envio de cada foto | MOB-16 |
| Portal do patrocinador | `/portal` | Barra inferior com Entregas, Contratos e Relatórios. Aprovar e Pedir ajuste no próprio cartão | MOB-17 |

As demais telas do painel (Propostas, Contratos, Financeiro, Patrocinadores,
Projetos, Ativos, Relatórios, BrandTrack, Equipe, Configurações, Plano) não
têm prancheta própria: herdam os componentes da fundação (MOB-03, MOB-04,
MOB-05, MOB-13, MOB-15) e entram na fase 3.

## 5. Demandas

Tamanho: **P** até 1 dia, **M** 2–3 dias, **G** uma semana ou mais.

No board do Plane, a feature-mãe é a **BP-30** ("Versão mobile do portal") e
cada demanda é uma filha dela. A label é Feature quando a demanda cria
componente e Update quando adapta tela existente. A prioridade segue a fase
(alta, média, baixa).

| Demanda | Item | Demanda | Item | Demanda | Item |
|---|---|---|---|---|---|
| MOB-01 | BP-33 | MOB-08 | BP-32 | MOB-14 | BP-42 |
| MOB-02 | BP-34 | MOB-10 | BP-40 | MOB-15 | BP-44 |
| MOB-03 | BP-37 | MOB-11 | BP-45 | MOB-16 | BP-47 |
| MOB-04 | BP-38 | MOB-12 | BP-41 | MOB-17 | BP-46 |
| MOB-05 | BP-39 | MOB-13 | BP-43 | MOB-18 | BP-48 |
| MOB-06 | BP-35 | MOB-19 | BP-31 | | |
| MOB-07 | BP-36 | | | | |

### Fase 1: fundação

**MOB-01. Casca mobile do painel** (M)
Criar `MobileHeader` e `BottomNav` e usá-los no `DashboardLayout` abaixo de
768px. Atalhos: Início, Pipeline, Entregas, Agenda e Mais. Para quem não tem
`vendas`, o atalho de Pipeline vira Contratos (`gruposVisiveis` decide).
- Aceite: a 375px o cabeçalho tem no máximo 4 controles e nenhum se sobrepõe;
  a barra inferior respeita a área segura do iPhone; trocar de organização
  continua no cabeçalho; no desktop nada muda.
- Testes: unitário de `ATALHOS_MOBILE` × `gruposVisiveis` (marca, agência,
  papel sem `vendas`), no padrão de `lib/navegacao.test.ts`.

**MOB-02. Menu Mais** (P)
`MenuMobile` com organização ativa, todos os grupos visíveis e a conta. Inclui
o atalho da plataforma e o `ClientSelector` para a equipe da plataforma (BP-4).
- Aceite: mostra os mesmos itens da barra lateral para o mesmo usuário; fecha
  ao navegar; Sair funciona.

**MOB-03. ResponsiveDialog** (M)
Componente novo e migração de **um** formulário piloto (Nova oportunidade, em
`Pipeline.tsx`). A migração dos demais fica com as demandas de cada tela.
- Aceite: no celular, rodapé visível com o teclado aberto e corpo rolável; no
  desktop, igual ao `Dialog` de hoje e com rolagem quando o conteúdo passa da
  altura; foco preso e Esc fecham nos dois.
- Testes: unitário dos dois modos com `matchMedia` simulado.

**MOB-04. ListaResponsiva** (M)
Componente novo e uso piloto em Entregas.
- Aceite: mesma informação e mesmas ações da tabela, sem rolagem horizontal a
  360px; o cartão inteiro abre o detalhe e as ações ficam no menu ⋮; a ordenação
  fica no `FiltrosMobile`.

**MOB-05. FiltrosMobile** (P)
Chips rápidos e gaveta de filtros avançados ligados ao `useFiltroSalvo` da
página.
- Aceite: o filtro escolhido no celular aparece igual no desktop para a mesma
  organização (mesma chave `brandplay:filtros:<org>:<tela>`); o botão mostra
  quantos filtros avançados estão ativos.

**MOB-06. Assistente IA no celular** (P)
Reposicionar o botão e abrir a gaveta em tela cheia.
- Aceite: o botão não cobre a barra inferior, o último cartão das listas nem o
  rodapé de gavetas.

**MOB-07. PWA instalável** (P)
`manifest.webmanifest` (nome, ícones 192/512 e maskable, `display:
standalone`, `start_url: /dashboard`, `theme_color` `#6206C8`) e o `<link>`
no `index.html`. **Sem service worker** nesta demanda (seção 9, pergunta 1).
- Aceite: Chrome Android oferece "Instalar app"; o app abre sem a barra do
  navegador; iOS usa o `apple-touch-icon` existente.

**MOB-08. Alvos de toque e fonte dos campos** (P)
`Textarea` e `Select` com `text-base md:text-sm`; `Button` com 44px no
celular; revisão dos botões só de ícone em linhas de lista.
- Aceite: nenhum zoom ao focar campo no Safari iOS; Lighthouse sem aviso de
  alvo de toque nas telas da fase 2.

### Fase 2: telas de uso diário

**MOB-10. Painel no celular** (P)
Ordem dos widgets no celular, com atrasos e próximas ações primeiro, e
gráficos com altura menor. Respeita o que o usuário personalizou.
- Depende de: MOB-01.

**MOB-11. Pipeline por etapa** (G)
No celular: chips de etapa (nome, quantidade e total, como no cabeçalho da
coluna), lista de cartões da etapa e gaveta "Mover para…". A gaveta chama a
mesma `moveOpportunityToStage` que o arraste usa (`Pipeline.tsx`). Com isso o
checklist da etapa (`getOpportunityStageChecklistIssues`, que abre o
`MissingInfoDialog`) e o formulário de motivo da perda continuam valendo. O
`DndContext` só monta no desktop; se o arraste for mantido no tablet, trocar
para `TouchSensor` com `delay`.
- Aceite: mover de etapa pelo celular tem o mesmo resultado que arrastar no
  desktop, inclusive o checklist e o motivo da perda; a etapa escolhida fica
  salva (`useFiltroSalvo("pipeline", ...)`).
- Depende de: MOB-03. **Ordem com o plano das telas grandes**: fazer depois da
  divisão do `Pipeline.tsx` (`plano-divisao-telas-grandes.md`, seção 3), ou
  junto com ela, para não mexer duas vezes no mesmo componente de 1.258 linhas.
- Testes: E2E "mover etapa", que aquele plano já pede, rodando também no
  projeto mobile do Playwright (MOB-19).

**MOB-12. Entregas no celular** (M)
Aplicar MOB-04 e MOB-05 em `Deliveries.tsx` e migrar os 3 diálogos para
MOB-03.
- Depende de: MOB-03, MOB-04, MOB-05.

**MOB-13. Telas de detalhe** (M)
`AbasRolaveis` em `SponsorDetail`, `PropertyDetail` e nas gavetas de contrato
e oportunidade; `BarraDeAcoes` no patrocinador, com `tel:`, `https://wa.me/` e
`mailto:` do contato principal (só aparecem os que existem).
- Depende de: MOB-03. No projeto, combinar com o reagrupamento das abas do
  plano das telas grandes (13 → 6).

**MOB-14. Calendário em agenda** (M)
Visão Agenda (faixa da semana e lista do dia) como padrão abaixo de 768px,
com a escolha guardada como preferência de visualização (não é filtro:
`.claude/rules/frontend.md`, "Filtros de listagem").

**MOB-15. Formulários em uma coluna** (M)
Trocar `grid-cols-2` sem prefixo por `grid-cols-1 sm:grid-cols-2` nos
formulários e migrar os diálogos restantes para MOB-03, tela por tela.
Continuam `CurrencyInput`, `DateInput` e `NumberInput`.

### Fase 3: apps externos e o resto do painel

**MOB-16. App de Campo** (M)
Logo no cabeçalho, ação de câmera fixa no rodapé do detalhe e estado de envio
por foto (enviada, enviando, falhou com "Tentar de novo"). A fila offline de
verdade depende do service worker (seção 9, pergunta 1).

**MOB-17. Portal do patrocinador** (M)
Barra inferior no celular e Aprovar/Pedir ajuste no cartão da entrega
(gaveta com comentário obrigatório para o ajuste). As policies
`*_sponsor_portal_*` não mudam: a aprovação continua pelo mesmo caminho.
- Testes: E2E de aprovação pelo portal no projeto mobile.

**MOB-18. Demais telas do painel** (G, dividir por tela)
Propostas, Contratos, Financeiro, Patrocinadores, Projetos, Ativos,
Relatórios, BrandTrack, Equipe, Acessos ao Portal, Configurações e Plano:
`ListaResponsiva` nas tabelas, `ResponsiveDialog` nos diálogos e
`AbasRolaveis` nas abas. Uma demanda por tela no board.

**MOB-19. Projeto mobile no Playwright** (P, junto da fase 1)
Projetos `mobile-ios` (`devices['iPhone 13']`, WebKit) e `mobile-android`
(`devices['Pixel 7']`) em `portal/playwright.config.ts`. Eles rodam só os
testes com `@mobile` no título, e cada demanda seguinte marca o fluxo que
adaptar (`.claude/rules/testing.md`, "Celular"). O primeiro spec,
`mobile-paginas-publicas.spec.ts`, confere em cada página pública duas coisas:
que não há rolagem horizontal e que nenhum campo tem fonte abaixo de 16px.

Como no desktop, o E2E não roda no CI (`docs/infrastructure/cicd.md`): os
specs dependem do stack local e de usuários do seed. Levar o E2E para o CI é
uma demanda à parte.

## 6. Ordem sugerida

```
Fase 1 (fundação)        MOB-19 → MOB-08 → MOB-01 → MOB-02 → MOB-06 → MOB-07
                         MOB-03 → MOB-04 → MOB-05   (em paralelo com a casca)
Fase 2 (uso diário)      MOB-10, MOB-12, MOB-14, MOB-13, MOB-15
                         MOB-11 depois da divisão do Pipeline.tsx
Fase 3                   MOB-17, MOB-16, MOB-18 (uma tela por vez)
```

MOB-19 vem primeiro para que cada demanda seguinte já tenha onde provar que
funciona no celular.

## 7. Validação de cada PR

Além do fluxo da seção 5 do `CLAUDE.md` (lint, type-check, test, build):

- E2E no projeto mobile (MOB-19) para o fluxo tocado;
- conferência manual a 360px e 430px, com o teclado aberto nos formulários;
- conferência do desktop a 1280px, para não ter regressão;
- nos componentes novos, teste unitário dos dois modos (celular e desktop)
  com `matchMedia` simulado.

## 8. Riscos e o que fica de fora

- **Área `/admin`**: uso de escritório e cheia de tabelas largas. Fica de
  fora. Só se garante que não quebra (rolagem horizontal aceitável).
- **Editor de relatório** (`RelatorioEditor`) e **construtor de proposta**:
  edição longa e com visualização lado a lado. No celular, só leitura e
  publicação nesta rodada.
- **Divisão das telas grandes**: MOB-11 e MOB-13 mexem nos mesmos arquivos
  do `plano-divisao-telas-grandes.md`. Fazer as duas coisas em PRs separados
  sobre a mesma tela dá conflito e retrabalho; a ordem está na seção 6.
- **Duas árvores por tela**: renderizar o layout de celular e o de desktop
  juntos e esconder um por CSS dobra as consultas e os efeitos. Componente com
  comportamento diferente (gaveta × diálogo, cartão × tabela) decide por
  `useIsMobile`. Só estilo fica em classes `md:`.
- **Arraste no tablet**: a 768px ou mais o kanban continua e o arraste
  continua com `PointerSensor`. Se o uso em tablet for relevante, a sensibilidade
  precisa de ajuste (MOB-11).
- **Segurança**: nenhuma demanda muda autorização. Atalhos e menus escondidos
  são experiência; a RLS e as Edge Functions continuam sendo a fronteira.

## 9. Decisões em aberto (precisam do usuário)

1. **Offline**: o App de Campo precisa funcionar sem sinal (fila de fotos
   no aparelho, service worker, sincronização depois)? Muda o tamanho de
   MOB-07 e MOB-16 de P/M para G e pede ADR própria.
2. **Atalhos da barra inferior**: Início, Pipeline, Entregas e Agenda servem
   para agência. Para a organização **marca** (ADR-0013, sem `vendas`), a
   proposta é Início, Contratos, Entregas e Agenda. Confirmar.
3. **Tablet (768–1024px)**: fica com o layout de desktop (proposta) ou com o
   de celular?
4. **Notificação push** (PWA) para entrega atrasada e aprovação do
   patrocinador: entra nesta rodada ou fica para depois? Depende do service
   worker da pergunta 1.
