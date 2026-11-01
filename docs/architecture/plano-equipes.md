# Plano: equipes de trabalho e escopo por projeto

- **Data**: 2026-10-31
- **Status**: **decisões D1–D12 fechadas em 2026-11-01** (seção 11) e
  registradas na ADR-0012. Fase 0 entregue em 2026-11-01 (seção 10); fases 1
  a 5 não iniciadas.
- **Escopo**: dentro de uma organização, separar quem trabalha em quais
  projetos (`sports_properties`), para que uma equipe não veja o que é de
  outra. Vincular usuários que já têm conta a organização, equipe e projeto, e
  gerenciar perfis e acessos.
- **Fora do escopo**: mudar o tenant (continua sendo a organização,
  ADR-0002), o portal do patrocinador e o superadmin (ADR-0008).

## 1. Resumo

1. **A organização continua sendo o tenant.** Equipe é um **sub-escopo dentro
   dela**, nunca um tenant novo. Nada atravessa organizações: equipe, membro
   da equipe e projeto vinculado são sempre da mesma organização, garantido
   por chave estrangeira composta.
2. **"Projeto" é a propriedade esportiva que já existe** (`sports_properties`,
   com hierarquia por `parent_property_id`). Ela já está em oportunidades,
   propostas, contratos, entregas, cotas, eventos, mídia e relatórios. Criar
   uma entidade "projeto" paralela duplicaria isso (decisão D1).
3. **Modelo recomendado: equipes recebem projetos; papéis recebem um
   escopo.** Cada papel da matriz atual (`organization_role_grants`) ganha,
   por módulo, o escopo de visibilidade: **Organização inteira**, **Projetos
   das minhas equipes** ou, depois, **Somente meus registros** (D6). É o padrão
   "Todos / Equipe / Próprios" de HubSpot e Pipedrive, aplicado por RLS.
4. **Opt-in e sem mudança para quem não usar.** O escopo padrão é
   "Organização inteira", que é o comportamento de hoje. Uma organização só
   passa a isolar equipes quando o administrador muda o escopo de um papel.
5. **O administrador monta a estrutura (D12).** Dono e administrador veem
   todas as propriedades, criam propriedades e equipes e vinculam membros e
   projetos às equipes. O membro em escopo equipe herda os projetos das suas
   equipes e não cria propriedade (7.7).
6. **Pré-requisito: aceite de convite por quem já tem conta** (fase 0,
   entregue na `0041`). Antes dela, o convite só funcionava para quem se
   cadastrava depois dele (gatilho `handle_new_user`), e "vincular usuário já
   cadastrado" a outra organização não funcionava.
7. **Sem serviço externo de autorização.** OpenFGA/SpiceDB resolveriam, mas
   tiram a decisão da RLS, que é a fronteira de segurança do projeto. A
   regra fica em funções `SECURITY DEFINER` no banco, no mesmo padrão de
   `can_access_module` e `billing_blocked_orgs`.

## 2. O que já existe

| Peça | Onde | Serve para |
|---|---|---|
| Membros por organização, papel fixo (`owner`, `admin`, `comercial`, `operacional`, `financeiro`) | `organization_members`, enum `org_role` | quem entra e com qual papel |
| Matriz papel × módulo (`none`/`read`/`write`) em `crm`, `operacional`, `financeiro`, `team` | `organization_role_grants` (0036), `can_access_module` | o que cada papel faz |
| Tela "Usuários & Permissões" (Membros, Permissões, Auditoria) | `pages/dashboard/Team.tsx`, `components/team/*` | base da tela nova |
| Convite, reenvio, revogação, criação de usuário, troca de papel, reativação | Edge Function `manage-team-access` | ciclo de vida do membro |
| Auditoria de equipe | `team_audit_log` (ações `invite_*`, `member_*`, `role_changed`, `permission_changed`) | trilha das alterações |
| Hierarquia de propriedades | `sports_properties.parent_property_id` | herança de acesso para subprojetos |
| Limite por plano | `billing_plans.max_users`, gatilho `trg_zz_billing_limit` | limitar equipes por plano, se for o caso |

Onde está `property_id` hoje (raiz do escopo):

- **Têm `property_id` direto**: `opportunities`, `proposals`, `contracts`,
  `deliveries`, `sponsorship_tiers`, `property_events`, `property_media`,
  `property_posts`, `property_indicators`, `property_leads`,
  `property_checklist_items`, `reports`, `lead_scores`, `sellout_reports`,
  `asset_allocations`, `brandtrack_events`.
- **Herdam de um pai**: `installments`, `tier_sales`, `contract_clauses`,
  `contract_assets`, `contract_churn_risk` (via contrato);
  `opportunity_activities`, `opportunity_comments`, `opportunity_contacts`,
  `crm_tasks` (via oportunidade); `proposal_items`, `proposal_versions` (via
  proposta); `delivery_attachments`, `delivery_approval_log` (via entrega).
- **Não pertencem a um projeto**: `sponsors` e as ~15 tabelas `sponsor_*`,
  `assets`, `brandtrack_brands`, `contract_clause_templates`,
  `pipeline_funnels`. É aqui que mora a decisão difícil (D5).

## 3. Conflito de nomes

"Equipe" e "Projeto" já são **categorias de propriedade**
(`Properties.tsx`: Evento, Campeonato, Projeto, Equipe, Atleta), e
`sports_properties.teams_count` conta equipes esportivas. Um clube vai ter a
propriedade "Equipe Sub-20" e a equipe de trabalho "Comercial SP" na mesma
tela.

Proposta (D2):

- **Na tela**: "Equipes de trabalho" no menu de configurações, e "Projetos"
  como o nome genérico das propriedades nos vínculos ("projetos desta
  equipe").
- **No banco**: `work_teams`, `work_team_members`, `work_team_properties`.
  Evita `teams`, que se confunde com a categoria e com `teams_count`.

## 4. Padrões de mercado

| Produto | Unidade de isolamento | Como funciona | O que aproveitar |
|---|---|---|---|
| **HubSpot** | Equipes (com sub-equipes) | Por objeto, cada perfil vê **Todos**, **Da equipe** ou **Próprios**. Registro pertence à equipe do responsável. | Os três níveis: simples de explicar ao cliente. |
| **Pipedrive** | Grupos de visibilidade | Item visível ao dono, ao grupo do dono ou a todos; o padrão é configurável por tipo de registro. | Padrão por tipo de registro, com exceção no registro. |
| **Salesforce** | Objeto + hierarquia de papéis | "Organization-Wide Default" por objeto (privado / leitura / edição), hierarquia de papéis (o gestor vê o que o subordinado vê), regras de compartilhamento, perfis + *permission sets* aditivos, territórios. | Padrão por objeto e permissões **aditivas**; hierarquia fica para depois. |
| **Zoho CRM** | Territórios | Registro atribuído a território; usuário vê o território e os filhos. | Herança para subníveis (= subprojetos). |
| **GitHub** | Organização → equipes → repositórios | Papel definido **no vínculo** equipe↔repositório (read, triage, write, maintain, admin); equipes aninhadas herdam. | Acesso no vínculo equipe↔projeto (leitura ou edição). |
| **Google Cloud IAM / Azure RBAC** | Organização → pasta → projeto | Papel concedido num nível vale para baixo; papéis predefinidos + personalizados. | Herança pela árvore de propriedades. |
| **Jira / Linear / Asana** | Projeto ou equipe privada | Espaço privado só para membros; administrador vê tudo. | Administrador sempre com visão total. |
| **Auth0 Organizations, WorkOS, Clerk** | Organização | Membros e papéis por organização. Não têm sub-escopo. | Confirma que sub-escopo é regra do produto, não do provedor de login. |
| **Zanzibar / OpenFGA / SpiceDB** | Relação arbitrária | ReBAC num serviço externo. | Não agora: tira a decisão da RLS e cria mais um serviço para operar. |

Práticas que aparecem em quase todos:

- **Permissão aditiva.** Quem está em duas equipes vê a união. Nada "nega"
  acesso dado por outra equipe — negação explícita confunde e gera chamado.
- **Administrador vê tudo.** Dono e administrador não ficam presos a equipe.
- **Menor privilégio por padrão** em organização nova que ativa equipes, mas
  **sem tirar acesso existente** na migração.
- **Administração delegada.** O líder de equipe gerencia a própria equipe,
  sem virar administrador da organização.
- **Acesso temporário.** Vínculo com data de fim (freelancer de um evento).
- **Revisão de acesso** periódica e trilha de auditoria de toda mudança.
- **Convite por e-mail, nunca busca na base global.** Ninguém procura
  usuários da plataforma inteira: isso revela quem tem conta.
- **Em planos Enterprise**: SSO/SCIM mapeando grupos do provedor de
  identidade para equipes. Fica como evolução (seção 10).

## 5. Modelos avaliados

| | A. Equipe recebe projetos (recomendado) | B. Registro pertence a uma equipe | C. Organização por equipe |
|---|---|---|---|
| Como | Equipe ↔ propriedades; o registro herda o escopo do `property_id` que já tem. | Coluna `team_id` em cada registro raiz (estilo HubSpot). | Cada equipe vira uma organização. |
| Esforço no banco | Médio: policies das tabelas com projeto + herança nas filhas. | Alto: `team_id` em ~40 tabelas, preenchimento e migração de dados. | Baixo no banco. |
| Coerência com o domínio | Alta: o trabalho já é organizado por propriedade. | Média: uma oportunidade de um projeto pode ser "de outra equipe". | Baixa: perde a visão consolidada, duplica patrocinador, cobrança por equipe. |
| Mudar alguém de equipe | Troca o vínculo; o histórico vai junto com o projeto. | Precisa reatribuir registros. | Migrar dados entre organizações. |
| Patrocinador (sem projeto) | Precisa de regra própria (D5). | `team_id` direto. | Duplicado em cada organização. |

**Recomendação: A**, com uma carteira de patrocinadores por equipe
(`work_team_sponsors`, D5). Pega o melhor de B onde o projeto não resolve.

## 6. Modelo de dados

```sql
-- Equipe de trabalho
work_teams (
  id uuid pk,
  organization_id uuid not null references organizations on delete cascade,
  name text not null,
  description text,
  status text not null default 'ativo',     -- 'ativo' | 'arquivado'
  created_at, updated_at,
  unique (organization_id, id)               -- alvo das FKs compostas
)
-- índice único (organization_id, lower(name)) where status = 'ativo'

-- Quem está na equipe (precisa ser membro ativo da organização)
work_team_members (
  team_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  team_role text not null default 'membro', -- 'lider' | 'membro'
  expires_at timestamptz,                   -- acesso temporário (D8)
  status text not null default 'ativo',     -- 'ativo' | 'revogado'
  created_at, updated_at,
  primary key (team_id, user_id),
  foreign key (organization_id, team_id) references work_teams (organization_id, id),
  foreign key (organization_id, user_id) references organization_members (organization_id, user_id)
)

-- Projetos da equipe
work_team_properties (
  team_id uuid not null,
  organization_id uuid not null,
  property_id uuid not null,
  access text not null default 'write',      -- 'read' | 'write'
  include_children boolean not null default true,
  created_at, updated_at,
  primary key (team_id, property_id),
  foreign key (organization_id, team_id) references work_teams (organization_id, id),
  foreign key (organization_id, property_id) references sports_properties (organization_id, id)
)

-- Escopo por papel e módulo (coluna nova na matriz de 0036)
organization_role_grants.scope text not null default 'organizacao'
  -- 'organizacao' | 'equipe' ('proprios' depois, D6); owner e admin travados em 'organizacao'

-- Carteira da equipe (D5, D7): um patrocinador pode estar na carteira de
-- várias equipes
work_team_sponsors (
  team_id uuid not null,
  organization_id uuid not null,
  sponsor_id uuid not null,
  created_at, updated_at,
  primary key (team_id, sponsor_id),
  foreign key (organization_id, team_id) references work_teams (organization_id, id),
  foreign key (organization_id, sponsor_id) references sponsors (organization_id, id)
)
```

Notas:

- **FK composta** `(organization_id, id)` torna impossível, no próprio
  esquema, vincular equipe de uma organização a projeto ou usuário de outra
  (`CLAUDE.md` seção 6). Exige `unique (organization_id, id)` em
  `sports_properties` (fase 1) e em `sponsors` (fase 3) — nenhuma tabela tem
  essa restrição hoje; `organization_members (organization_id, user_id)` já
  é único (`organization_members_org_user_unique`, 0003).
- `organization_id` das tabelas filhas vem **da equipe**, por gatilho, e o
  valor enviado pelo cliente é descartado (padrão de `tg_relatorio_vinculos`,
  0040).
- Membro revogado da organização (`organization_members.status =
  'revogado'`) perde as equipes junto: a função de escopo olha o status nas
  duas tabelas, sem depender de limpeza.
- Arquivar equipe, nunca excluir (padrão de desativação lógica).
- `team_audit_log` ganha as ações `team_created`, `team_archived`,
  `team_member_added`, `team_member_removed`, `team_property_added`,
  `team_property_removed`, `scope_changed`.
- RLS: as três tabelas seguem o padrão 4 (leitura por membro, escrita por
  owner/admin) estendido para o líder da própria equipe, mais
  `billing_access_restrictive`.

## 7. Regras de visibilidade

### 7.1 Função central

```sql
-- Projetos que auth.uid() alcança nesta organização, já com subprojetos.
-- SECURITY DEFINER, STABLE; chamada como (select public.projetos_visiveis(org))
-- na policy, para o Postgres avaliar uma vez por consulta (initplan),
-- como já é feito com billing_blocked_orgs().
projetos_visiveis(_org_id uuid, _write boolean) returns uuid[]

-- true quando o escopo do papel no módulo permite ver a linha
no_escopo(_org_id uuid, _module text, _property_id uuid,
          _owner_id uuid, _write boolean) returns boolean
```

Policy de leitura de uma tabela do padrão 7 com projeto, por exemplo
`opportunities`:

```sql
using (
  public.can_access_module(auth.uid(), organization_id, 'crm', false)
  and public.no_escopo(organization_id, 'crm', property_id, owner_id, false)
)
```

`no_escopo` devolve:

| Escopo do papel no módulo | Resultado |
|---|---|
| `organizacao` | sempre `true` (hoje) |
| `equipe` | `property_id = any(projetos_visiveis(...))`; sem projeto, ver 7.3 |
| `proprios` | `owner_id = auth.uid()` — não entra na primeira entrega (D6); o `check` da coluna aceita só `organizacao` e `equipe` até lá |

Dono e administrador ficam sempre em `organizacao`. A sessão de suporte do
superadmin (0035/0037) usa a linha `admin` e continua vendo tudo.

### 7.2 Tabelas filhas

Duas opções:

1. **Subconsulta no pai** (`exists (select 1 from contracts c where c.id =
   contract_id)`). A RLS do pai vale dentro da subconsulta; zero dado novo.
   Custo por linha em listas grandes.
2. **`property_id` desnormalizado** nas filhas mais lidas (`installments`,
   `tier_sales`, `opportunity_activities`, `crm_tasks`), preenchido por
   gatilho a partir do pai — o mesmo raciocínio da 0033 para
   `organization_id`.

Recomendação: 1 para todas, e 2 só onde a medição mostrar lentidão
(`installments` e `opportunity_activities` são as candidatas).

### 7.3 Registro sem projeto

Oportunidade, proposta ou contrato com `property_id` nulo: com escopo
`equipe`, quem vê? Recomendação (D4):

- visível só para escopo `organizacao` e para quem criou;
- quem está em escopo `equipe` **não cria** registro sem projeto (o gatilho
  recusa), para não nascer linha que ninguém da equipe enxerga.

### 7.4 Patrocinadores

O patrocinador não tem projeto e pode estar em projetos de várias equipes.
Opções (D5):

| | Regra | Prós | Contras |
|---|---|---|---|
| a | Visível se tem oportunidade, proposta, contrato ou entrega num projeto visível | Automático | Patrocinador novo, sem negócio, fica invisível para a equipe que o cadastrou |
| b | Visível se está na carteira de uma das minhas equipes (`work_team_sponsors`) | Simples, estilo HubSpot | Precisa de alguém para pôr o patrocinador na carteira |
| **c (decidido)** | **a ou b** | A equipe vê sua carteira e todo patrocinador com quem negocia | Duas regras para explicar |

Com (c), o patrocinador entra na carteira da equipe de quem o cadastra (se a
pessoa estiver em uma só; com várias, escolhe no formulário). As tabelas
`sponsor_*` herdam do patrocinador.

**Mesmo patrocinador em várias equipes (D7).** É esperado: equipes
diferentes trabalham com o mesmo patrocinador. Por isso a carteira é N:N
(`work_team_sponsors`), e não uma coluna `team_id` em `sponsors`. Continua
existindo **um** cadastro do patrocinador por organização; cada equipe vê o
cadastro e os negócios dos projetos dela, nunca os negócios de projeto de
outra equipe. O administrador põe o patrocinador na carteira de outra
equipe.

Em aberto para a fase 3 (D7a): como a equipe B descobre que o patrocinador
que vai cadastrar já existe na carteira da A, sem cadastrar de novo. Hoje
`sponsors` não tem restrição de unicidade no banco. Uma checagem de
duplicidade (CNPJ, nome) que responda só "já existe na organização; peça ao
administrador para incluir na sua carteira", sem nome, responsável ou
valores, evita o cadastro repetido sem revelar dado de outra equipe.

### 7.5 Cadastros da organização

`pipeline_funnels`, `contract_clause_templates`, kit de marca, ativos
(`assets`) e `brandtrack_brands` continuam visíveis a toda a organização.
Funil por equipe é evolução possível (`pipeline_funnels.team_id`), não
parte da primeira entrega.

### 7.6 Fora da RLS: o que precisa de revisão explícita

A RLS não protege o que roda como `service_role` ou `SECURITY DEFINER`.
Cada item precisa aplicar o escopo à mão ou ser trocado para o cliente do
usuário:

- Edge Functions com service role que leem dado de domínio:
  `generate-delivery-report`, `report-view` (público, por slug — avaliar se
  o editor de relatório respeita o escopo), `social-posts`.
- RPCs `SECURITY DEFINER` de 0008/0015 que recebem um id
  (`generate_contract_installments`, `generate_contract_deliveries`,
  `copy_*`, `create_renewal_opportunity`, `get_delivery_report_data`):
  conferir se o usuário enxerga o registro de origem.
- Agregados e painéis (`revenue-forecast`, `Dashboard`, `Finance`): hoje
  usam o cliente do usuário? Se usarem RPC definer, somam dados de outras
  equipes.
- Storage: `can_access_contract_file` decide pelo caminho do arquivo; precisa
  checar o escopo do contrato.
- Notificações (`check-notifications`): não notificar sobre registro fora do
  escopo do destinatário.
- IA: `ai-assistant` e afins já usam o cliente do usuário
  (`_shared/ai/funcao.ts`), então herdam a RLS. Conferir na implementação.
- Busca global (`CommandMenu`) e realtime: respeitam a RLS se continuarem no
  cliente do usuário.

### 7.7 Propriedades (D12)

O administrador monta a estrutura: dono e administrador veem todas as
propriedades, criam propriedades e subprojetos, criam equipes e vinculam
membros e projetos a elas. O membro não recebe propriedade uma a uma: herda
os projetos das equipes em que está, com os subprojetos quando o vínculo tem
`include_children`.

| Operação em `sports_properties` | Papel em escopo organização (hoje) | Papel em escopo equipe |
|---|---|---|
| Ler | todas (`is_org_member`) | só as de `projetos_visiveis` |
| Criar propriedade ou subprojeto | CRM ou operacional com edição | não cria; o administrador cria |
| Editar | CRM ou operacional com edição | só com vínculo `access = 'write'`; nunca muda `parent_property_id` |
| Excluir | só owner/admin (0017) | só owner/admin |

Regras:

- **União entre módulos.** `sports_properties` serve ao CRM e ao
  operacional, e o financeiro lê a propriedade de cada contrato. A
  propriedade é visível quando o papel tem escopo `organizacao` em algum
  módulo a que tem acesso, ou quando está nos projetos das equipes do
  usuário. Para isolar um papel, todos os módulos dele vão para "Minhas
  equipes" (a predefinição da 8.1 faz isso).
- **`parent_property_id` não muda por quem está em escopo equipe** (o
  gatilho recusa). Mover um subprojeto para baixo da propriedade de outra
  equipe abriria os dados dele para essa equipe.
- **Propriedade nova não entra sozinha em equipe nenhuma.** O administrador
  a vincula, na tela da equipe ou no cartão "Equipes com acesso" da
  propriedade. Subprojeto novo de uma propriedade vinculada com
  `include_children` já nasce visível para a equipe, porque
  `projetos_visiveis` percorre a árvore na consulta.
- O media kit público (`*_public_read`) e o portal do patrocinador não
  mudam.

Suposição registrada em 2026-11-01: a criação só pelo administrador vale
para papel em escopo equipe. Em escopo organização, Comercial e Operacional
continuam criando propriedade como hoje (item 4 do resumo: nada muda para
quem não isola equipes). Se a criação tiver de ser só do administrador em
qualquer caso, a policy `sports_properties_module_insert` da 0017 muda para
todas as organizações, e isso precisa de decisão própria.

## 8. Perfis e permissões

### 8.1 Primeira entrega: papéis atuais + escopo

A matriz da aba Permissões ganha o escopo em cada célula:

| Papel | CRM | Operacional | Financeiro | Equipe |
|---|---|---|---|---|
| Proprietário | Edição · Organização (fixo) | Edição · Organização (fixo) | Edição · Organização (fixo) | Edição (fixo) |
| Administrador | Edição · Organização (fixo) | Edição · Organização (fixo) | Edição · Organização (fixo) | Edição |
| Comercial | Edição · *Organização ▾* | Leitura · *Organização ▾* | Leitura · *Organização ▾* | Sem acesso |
| Operacional | Leitura · *Organização ▾* | Edição · *Organização ▾* | Leitura · *Organização ▾* | Sem acesso |
| Financeiro | Leitura · *Organização ▾* | Leitura · *Organização ▾* | Edição · *Organização ▾* | Sem acesso |

O ▾ troca entre Organização e Minhas equipes ("Meus registros" fica para
depois, D6). Os valores
acima são o padrão de 0036 com escopo Organização: nada muda até o
administrador mexer. O ▾ só aparece na fase 2: na fase 1 a coluna `scope`
já existe, mas a tela não oferece "Minhas equipes", que ainda não teria
efeito.

Sugestão de **predefinição** "Ativar isolamento por equipe": um botão que
põe **todos os módulos** de Comercial e Operacional em "Minhas equipes" e
deixa Financeiro em "Organização" (o financeiro normalmente concilia tudo).
Um módulo deixado em Organização mantém o papel vendo todas as propriedades
(7.7). O administrador ajusta depois.

### 8.2 Líder de equipe (administração delegada)

O líder (`work_team_members.team_role = 'lider'`) pode, **só na própria
equipe**: adicionar e remover membros que já são da organização e definir a
data de fim do vínculo. Não convida gente de fora, não muda papel na
organização, não vincula projetos (D9).

### 8.3 Evolução: perfis personalizados

Padrão Salesforce/Google: papéis base + perfis criados pela organização
("Comercial júnior", "Produtor de evento"), com mais módulos e ações:

- módulos novos na matriz: `propriedades`, `relatorios`, `ativos`,
  `brandtrack`, `ia`;
- ações além de ler/editar: `excluir`, `aprovar` (entregas), `exportar`,
  `publicar` (relatório público, media kit).

Isso troca a chave da matriz de `org_role` para um `profile_id` e é a
mudança mais cara (policies, tipos, telas). Recomenda-se esperar a
primeira entrega estar em uso e haver pedido real de cliente.

## 9. Telas

Na página atual "Usuários & Permissões" (`Team.tsx`):

1. **Membros** (existe): coluna "Equipes" com os chips de cada membro;
   filtro por equipe.
2. **Equipes de trabalho** (nova aba): lista com nome, líder, número de
   membros e de projetos. Detalhe da equipe com duas listas:
   - **Membros**: adicionar a partir dos membros ativos da organização
     (combobox com busca, só dentro da organização), papel na equipe, data de
     fim opcional;
   - **Projetos**: adicionar propriedades (árvore com subprojetos), acesso
     leitura/edição, "incluir subprojetos".
3. **Permissões** (existe): escopo em cada célula, a predefinição e um aviso
   de quantos membros perdem visibilidade antes de salvar.
4. **Auditoria** (existe): as ações novas.
5. **"Ver como"** (prévia): o administrador escolhe um membro e vê a lista de
   projetos e patrocinadores que ele alcança. Calculado por uma RPC só de
   leitura (`acesso_do_membro(_user_id)`), restrita a owner/admin; não troca
   de sessão. É o recurso que mais reduz chamados nos produtos de referência.

Fora da página:

- Na **propriedade** (`PropertyDetail`): aba ou cartão "Equipes com acesso".
- No **formulário de patrocinador**: "Equipe responsável" quando o usuário
  está em mais de uma.
- No **seletor de organização**: nada muda. A organização ativa continua
  sendo estado de frontend (ADR-0002); o escopo de equipe é calculado no
  banco, não escolhido na tela.

Componentes: tudo com o shadcn/ui existente (`Tabs`, `Table`, `Command`
para o combobox, `Select`, `Badge`, `Dialog`) e react-query para os dados
novos.

## 10. Vincular usuários que já têm conta

Fluxo de mercado e recomendado:

| Caso | Antes da fase 0 | Depois da fase 0 (0041) |
|---|---|---|
| E-mail sem conta | Convite → cadastro → `handle_new_user` vincula | Igual |
| E-mail com conta | Adicionado direto como membro ativo, **sem aceite**, se estivesse entre os 200 primeiros usuários da plataforma; senão, convite pendente para sempre | Convite → a pessoa entra → o onboarding mostra "Você tem um convite" → aceita ou recusa |
| Já é membro ativo da organização | O `upsert` do convite **trocava o papel** (inclusive o do proprietário) | Convite recusado com 409; papel muda em "Editar" |
| Membro revogado | Reativado direto pelo convite | Convite → aceite reativa com o papel do convite |
| Criação com senha temporária (`create_user`) | Só para e-mail novo | Igual |

Fase 0 entregue em 2026-11-01 (branch `feature/equipes-convite`):

- Migration `0041_aceite_de_convite.sql`: `convites_de_organizacao_pendentes`,
  `aceitar_convite_de_organizacao`, `recusar_convite_de_organizacao` (pelo
  id, autorizadas pelo e-mail confirmado da conta) e
  `membro_da_organizacao_por_email` (só `service_role`). Detalhes e
  suposições em `SCHEMA_NOTES.md`.
- `manage-team-access`: a ação `invite` só cria convite; não lista mais os
  usuários da plataforma e responde igual com ou sem conta.
- Portal: aviso do convite em `/auth?invite=`; cartão de convites no
  onboarding, antes de seguir para o dashboard; ações novas na auditoria.
- Testes: `supabase/tests/convites.sql`.
- Fica para a fase 1: o convite levar as equipes
  (`organization_invites.team_ids`), para o membro cair na equipe certa ao
  aceitar.

Evolução Enterprise (não agora): SSO (SAML/OIDC) e SCIM, mapeando grupos do
provedor de identidade para equipes; o GoTrue self-hosted suporta SAML, mas
exige configuração por cliente.

## 11. Decisões

Fechadas com o usuário em 2026-11-01.

| # | Pergunta | Decisão |
|---|---|---|
| D1 | "Projeto" é a propriedade (`sports_properties`) ou uma entidade nova acima dela? | Propriedade; propriedade-mãe agrupa subprojetos |
| D2 | Nomes na tela e no banco | "Equipes de trabalho" / `work_teams`; a categoria de propriedade "Equipe" não muda |
| D3 | Hierarquia organização → projeto → equipe, ou equipe recebe vários projetos? | N:N: uma equipe recebe vários projetos e um projeto pode estar em várias equipes |
| D4 | Registro sem projeto com escopo equipe | Quem está em escopo equipe é obrigado a escolher projeto; os antigos sem projeto ficam com quem criou e com o escopo organização |
| D5 | Patrocinador | (c): carteira da equipe (`work_team_sponsors`) **ou** negócio num projeto visível |
| D6 | Escopo "Meus registros" já na primeira entrega? | Não. A matriz oferece Organização e Minhas equipes. "Meus registros" entra quando houver responsável editável (`owner_id` hoje é quem criou) |
| D7 | Mesmo patrocinador em várias equipes | Esperado. Um cadastro por organização, na carteira de várias equipes (N:N); o administrador inclui na carteira (ver 7.4). Como evitar o cadastro repetido fica para a fase 3 (D7a) |
| D8 | Vínculo com data de fim | Sim, em `work_team_members.expires_at` |
| D9 | Poderes do líder de equipe | Só membros da própria equipe, entre os que já são da organização, e data de fim; não convida nem vincula projetos |
| D10 | Equipes limitadas por plano? | Recurso dos planos pagos acima do de entrada; coluna `max_teams` em `billing_plans`, gatilho `trg_zz_billing_limit`. Quais planos e quantas equipes: definir em `docs/business/cobranca.md` na fase 4 |
| D11 | Financeiro em escopo equipe vê parcelas só dos projetos dele? | Sim, se configurado; a predefinição deixa o financeiro na organização |
| D12 | Quem vê e cria propriedades com escopo equipe | O administrador (dono/admin) vê todas, cria propriedades, subprojetos e equipes, e vincula membros e projetos às equipes. O membro herda os projetos das suas equipes e não cria propriedade (7.7) |

## 12. Fases

| Fase | Entrega | Banco | Risco |
|---|---|---|---|
| **0** ✅ | Aceite de convite por quem já tem conta | `0041`; teste em `convites.sql` | Baixo |
| **1** | Equipes e vínculos, sem efeito na visibilidade: cadastro, membros, projetos, auditoria, "Ver como", equipes no convite | `work_teams*`, `unique (organization_id, id)` em `sports_properties`, coluna `scope` (padrão `organizacao`, sem seletor na tela), ações do audit log, `organization_invites.team_ids` | Baixo: só tabelas novas |
| **2** | Escopo "Minhas equipes" em `sports_properties` (7.7), nas tabelas com `property_id` e nas filhas; seletor de escopo na matriz | `projetos_visiveis`, `no_escopo`, policies de leitura **e escrita** do padrão 7 e de `sports_properties`, gatilho de `parent_property_id` | **Alto**: muda policies de ~30 tabelas |
| **3** | Patrocinadores (D5, D7, D7a) e revisão da seção 7.6 | `work_team_sponsors`, `unique (organization_id, id)` em `sponsors`, policies `sponsor_*`, RPCs definer, storage | Alto |
| **4** | Predefinição, aviso de impacto, tela da propriedade, limite por plano | `max_teams` | Baixo |
| **5** | Perfis personalizados e módulos novos (8.3) | troca da chave da matriz | Alto; só com demanda |

Fases 2 e 3 devem ir juntas para produção: escopo nos negócios sem escopo
no patrocinador deixa a lista de patrocinadores aberta, e o contrário
esconde patrocinador de quem negocia com ele.

## 13. Testes

Em `supabase/tests/` (novo `equipes.sql`, no estilo de `seguranca.sql`),
com duas equipes A e B na mesma organização e uma segunda organização:

- membro só de A não lê nem escreve oportunidade, proposta, contrato,
  entrega, parcela, cota e relatório de projeto de B;
- membro de A e B vê a união; vínculo com `include_children` alcança o
  subprojeto; `access = 'read'` não edita;
- escopo `organizacao` (padrão) vê tudo, igual a hoje — os testes atuais de
  `seguranca.sql`, `cobranca.sql` e `relatorios.sql` passam sem mudança;
- owner, admin e sessão de suporte veem tudo;
- membro em escopo equipe vê só as propriedades das suas equipes (com o
  subprojeto, quando `include_children`), não cria propriedade nem muda
  `parent_property_id`; papel com um módulo em escopo organização vê todas;
- não é possível vincular equipe a projeto ou usuário de outra organização
  (FK composta) nem enviar `organization_id` diferente (gatilho descarta);
- membro revogado da organização perde a equipe; vínculo vencido deixa de
  valer;
- líder não adiciona quem não é da organização nem mexe em outra equipe;
- registro sem projeto não é criado por quem está em escopo equipe;
- teste `(m)` de `cobranca.sql` cobre as tabelas novas
  (`billing_access_restrictive`);
- RPCs da seção 7.6 recusam id de registro fora do escopo.

Unitário (Vitest) para a matriz com escopo e para o formulário de equipe;
E2E para criar equipe, vincular projeto e conferir que o membro de outra
equipe não vê a oportunidade.

Desempenho: medir `explain analyze` das listas de oportunidades, contratos
e parcelas com 10 mil linhas e 20 equipes, antes e depois da fase 2.

## 14. Riscos

- **Policies de ~30 tabelas mudam na fase 2.** Um erro de policy vaza ou
  esconde dado. Mitigação: escopo padrão `organizacao`, testes de RLS antes
  do merge, homologação com uma organização real em escopo equipe.
- **Caminhos fora da RLS** (seção 7.6) são o vazamento mais provável, porque
  nenhum teste de policy os pega. Precisam de teste próprio cada um.
- **Desempenho**: `projetos_visiveis` como `uuid[]` cresce com o número de
  projetos. Até algumas centenas por organização é barato; acima disso,
  trocar por `exists` contra `work_team_properties` com índice.
- **Usuário em escopo equipe sem equipe nenhuma** não vê nada. A tela deve
  avisar o administrador antes de salvar (aviso de impacto, fase 4).
- **Confusão de nomes** "Equipe" (categoria) × "Equipe de trabalho" (D2).
