# Plano: auditoria das ações de CRUD do portal

- **Data**: 2026-10-20 (revisado contra `dev` em 2026-11-07)
- **Status**: proposta — **nada da auditoria genérica foi implementado** (não
  existe schema `audit`, gatilho, migration nem tela). Retenção decidida (24
  meses, seção 2, item 9); demais decisões em aberto na seção 8. A revisão de
  2026-11-07 está na seção 0; ela corrigiu referências e acrescentou o que o
  plano original não previa (sessão de suporte, escopo por equipe, tabelas
  novas).
- **Objetivo**: registrar, para as principais ações de criação, alteração e
  exclusão do portal, **quem** agiu, **quando**, **de onde**, **em qual
  organização**, **em qual registro** e **o que mudou** (antes/depois), sem
  degradar as escritas e sem abrir brecha no isolamento por organização.
- **Referências**: `supa_audit` (Supabase), OWASP Logging Cheat Sheet,
  documentação do PostgreSQL (triggers, particionamento, BRIN), `pg_partman`,
  LGPD art. 37 e 46 — links na seção 10.

## 0. Revisão de 2026-11-07

O plano nasceu em 2026-10-20 numa base antiga (`feature/jornada-v2`). Esta
tabela é o resultado de conferir cada item contra `dev` (migrations até a
`0044`, ADRs até a 0013). Legenda: **pendente** (trabalho não feito, que
continua valendo), **mantida** (decisão ou premissa conferida e ainda válida),
**ajustado** (vale, com mudança no texto) e **novo** (surgiu depois do plano).
Nenhum item do plano está **feito**.

| Item | Situação | Evidência em `dev` |
|---|---|---|
| Schema `audit`, `audit.eventos`, `audit.tabelas_auditadas`, gatilho genérico (etapa A) | pendente | Nenhuma referência ao schema `audit`, a `pg_partman`, `pg_cron` ou `x-audit` em `supabase/`, `portal/` e `docker/`. `0001_extensions.sql` só cria `pgcrypto`, `pg_trgm` e `unaccent` |
| Logs atuais imutáveis (etapa B) | pendente | `sponsor_audit_logs_tenant` continua `for all` (`0005`; a `0017` não tocou nele). `opportunity_audit_logs_module_insert` existe (`0017`; a `0043` só trocou o módulo `crm` por `vendas`). `team_audit_log_admin_insert` existe (`0005`). O portal só **lê** `opportunity_audit_logs` e `team_audit_log` (`OpportunityDrawer.tsx`, `Pipeline.tsx`, `components/team/TeamAuditLog.tsx`), então remover as policies de insert continua sem efeito na tela |
| `delivery_approval_log` "escrito pelo client" | ajustado | A `0017` já trocou o `for all` por select (membro e patrocinador) e insert (`decided_by = auth.uid()`); não há update nem delete. O portal ainda grava direto (`PortalDeliveries.tsx`). É evento de negócio e continua fora da etapa B |
| `team_audit_log` como "log de equipe" | ajustado | Cresceu: 21 ações no `check` (`0042`), alimentado por gatilhos (`tg_auditar_permissao`, `0036`; `tg_auditar_equipe` e correlatos, `0042`), pelas RPCs de convite (`0041`: `invite_accepted`, `invite_declined`) e por `manage-team-access`. A tela é a aba "Auditoria" de Usuários & Permissões |
| `platform_admin_audit_log` como modelo | mantida | `0027`: sem escrita para `anon`/`authenticated`, só select para superadmin. Hoje também recebe `admin_abrir_sessao_suporte` (`0035`), as liberações (`0029`) e as ações de `admin-discounts` e `admin-ai` |
| Lacuna "Edge Functions com service role perdem o autor" | ajustado | As funções de IA e o BrandTrack passaram para o client do usuário (ADR-0010; `_shared/ai/funcao.ts`, cabeçalho de `brandtrack-detect-image`). Restam como service role que escreve domínio: `manage-team-access`, `manage-portal-access` e `create-organization` (via RPC `create_organization_with_owner`), as três na fase 4, e `social-posts` (ação `atualizar`, métricas em `property_posts`, pelo `_shared/metricas_youtube.ts`). `generate-delivery-report` sai da lista: só lê (RPCs `get_*_report_data`) |
| Contexto da requisição no client e em Edge Functions (etapa D) | pendente | `portal/src/integrations/supabase/client.ts` só tem o `createSupabaseFetch` (que injeta `apikey`); nenhum `x-audit-*` ou `x-correlation-id`. O despachante das Edge Functions (`supabase/functions/main`) já gera `x-request-id` (`docs/infrastructure/monitoring.md`) |
| RPCs de leitura e telas (etapa E) | pendente | Sem `portal/src/components/audit/` nem `useAuditoria.ts`. Já existe uma aba "Auditoria" (só de equipe e permissões): ver pergunta 7 da seção 8 |
| Testes e medição (etapa F) | pendente | Sem `supabase/tests/auditoria.sql`. `npm run supabase:test` lista os arquivos um a um (`package.json`), e o CI só chama esse script |
| Numeração: migrations `0030`–`0032` e ADR-0009 | ajustado | As migrations `0030`–`0044` estão ocupadas: a primeira livre hoje é a `0045`. A ADR-0009 não existe em `dev`, mas esse número é o da ADR de backup externo com restic (outra frente, que o usa na `feature/jornada-v2`), e `0010`–`0013` estão ocupadas: use a próxima livre (hoje 0014) |
| Decisão de retenção (24 meses) | mantida | Decidida pelo usuário em 2026-10-20; nada a contrário em `dev` |
| `pg_partman`, `pg_cron` e `pgaudit` na imagem do banco | mantida, **não reconferida** | O compose segue em `supabase/postgres:17.6.1.136` (`docker/supabase/docker-compose.yml`), a mesma imagem da conferência original. Esta revisão não subiu o stack: a etapa A começa confirmando as extensões e o `shared_preload_libraries` do `pg_cron` (seção 4) |
| Schema `audit` fora do PostgREST | mantida | `PGRST_DB_SCHEMAS=public,storage,graphql_public` (`docker/supabase/.env.example`); o teste `(m)` de `supabase/tests/cobranca.sql` só olha `public` |
| Fases e lista de tabelas (seção 6) | ajustado | Todas as tabelas das fases 1 a 4 existem. O portal escreve em tabelas que o plano nunca classificou: seção 6.1 |
| Sessão de suporte do superadmin | novo | `0035` e `0037` (ADR-0008): o operador age com o próprio `auth.uid()` e passa em `is_org_member`/`has_org_role`/`can_access_module` sem ser membro. Sem tratamento, a auditoria o registraria como ator sem papel. Seções 2 (item 7) e 5 |
| Leitura por módulo e escopo por equipe (`0036`, ADR-0012) | novo | A `0036` já faz o SELECT de várias tabelas passar por `can_access_module`, e a fase 2 do plano de equipes (não iniciada) vai mudar as policies de ~30 tabelas. O critério de `audit_historico` do plano original (`is_org_member`) ficou defasado: seção 3 |
| Módulo `vendas` no lugar de `crm` | novo | `0043` (ADR-0013): as policies do funil e as RPCs checam `vendas`; a marca não tem o módulo |

## 1. O que já existe

Há cinco logs, cada um com formato próprio, escritos por caminhos diferentes:

| Tabela | Escrita por | Cobre | Problema |
|---|---|---|---|
| `team_audit_log` | gatilhos de permissão e equipe (`0036`, `0042`), RPCs de convite (`0041`) e Edge Function `manage-team-access` (service role) | convites, papéis, permissões, revogação de membros, equipes, vínculos de equipe e mudança de escopo | Policy `team_audit_log_admin_insert` (`0005`) deixa owner/admin inserir à mão — dá para forjar evento |
| `sponsor_audit_logs` | gatilho `tg_sponsor_audit` + funções de ciclo de vida (`0009`, `0015`, `0016`) | criação, dono, ciclo de vida, prioridade, saúde e arquivamento de `sponsors` | Policy `sponsor_audit_logs_tenant` é `for all` com `is_org_member`: **qualquer membro edita ou apaga o log** |
| `opportunity_audit_logs` | gatilho `tg_opportunity_audit_log` (`0016`) | criação, mudança de estágio e de valor de `opportunities` | Policy `opportunity_audit_logs_module_insert` deixa usuário do módulo `vendas` inserir evento falso; não cobre exclusão nem os demais campos. O gatilho grava `owner_id` como ator quando não há `auth.uid()`, o que mascara ação do sistema como ação do dono |
| `delivery_approval_log` | portal (insert direto) | aprovação de entrega, inclusive pelo patrocinador | É evento de negócio (fluxo de aprovação), não auditoria; escrito pelo client. Já não tem update nem delete pela API (`0017`) |
| `platform_admin_audit_log` | funções `admin_*`, `admin-plans`, `admin-discounts`, `admin-ai` | ações do superadmin, inclusive abertura de sessão de suporte | Está bem resolvido (imutável pela API, ADR-0008) — é o modelo a seguir |

Lacunas:

- **55 tabelas** são escritas pelo portal (insert/update/delete/upsert direto
  via PostgREST, em 41 arquivos) e só `sponsors` e `opportunities` têm algum
  rastro de campo. Contratos, parcelas, propostas, entregas, cotas, ativos e
  propriedades não têm nenhum. Equipes e permissões têm trilha própria em
  `team_audit_log`.
- Nenhum log registra **exclusão** nem o **conjunto de campos alterados**.
- Nenhum log registra **origem** (portal, portal do patrocinador, Edge
  Function, IA, sessão de suporte, SQL Editor) nem IP/agente.
- Edge Functions com service role escrevem com `auth.uid()` nulo: o autor se
  perde. Hoje isso vale para `manage-team-access`, `manage-portal-access`,
  `create-organization` (via RPC) e a ação `atualizar` de `social-posts`. As
  demais funções de domínio, inclusive as de IA, usam o client do usuário e já
  chegam ao banco com `auth.uid()`.
- A sessão de suporte (`0035`, ADR-0008) faz o superadmin passar nas funções
  de membro sem ser membro: o evento gravaria o `auth.uid()` do operador sem
  dizer que foi suporte da plataforma.
- O GoTrue já registra eventos de autenticação em `auth.audit_log_entries`
  (login, logout, recuperação de senha, cadastro) — não é preciso duplicar.

Inventário de escrita do portal por tabela (contagem de chamadas
`insert/update/delete/upsert`, levantada em 2026-11-07) está no apêndice A.

## 2. Decisões de desenho

1. **Captura no banco, por gatilho genérico** — não no frontend. O portal
   escreve direto via PostgREST; auditar na tela seria contornável e
   esqueceria Edge Functions, RPCs e o SQL Editor. Um gatilho `AFTER ... FOR
   EACH ROW` único (`audit.tg_registrar()`), ligado por tabela, é o padrão do
   `supa_audit` e do *audit trigger* da wiki do PostgreSQL. Captura assíncrona
   por WAL/decodificação lógica (Debezium, wal2json) foi descartada: exige
   infraestrutura nova e perde `auth.uid()`, que só existe na transação.
   Como é `AFTER`, o evento já nasce com o `organization_id` final, depois dos
   gatilhos `BEFORE` que herdam a organização do pai (`0033`).
   **O gatilho nunca pode derrubar a escrita de negócio**: `organization_id`
   é nulo em várias tabelas (`contracts` e `installments`, por exemplo, não
   têm `not null`), e a regra do projeto é que a linha sem organização fique
   invisível, não que dê erro. Ver pergunta 5 da seção 8.
2. **Log técnico genérico, separado dos logs de negócio.** Os cinco logs
   atuais alimentam telas (linha do tempo da oportunidade, histórico da
   equipe, aprovações do portal) e continuam como estão. A auditoria nova é a
   fonte de "quem mudou o quê"; as linhas do tempo continuam sendo a narrativa
   de negócio. Unificar fica para depois (seção 9). O log transacional das
   Edge Functions (`docs/infrastructure/monitoring.md`) é outra camada
   (tráfego e erro, sem valores) e não substitui nem é substituído por este.
3. **Imutável pela API.** Nenhuma policy de escrita; `insert/update/delete`
   revogados de `anon`, `authenticated` e `service_role`. Só o gatilho
   (`SECURITY DEFINER`, dono `postgres`) grava. Leitura só por funções
   `SECURITY DEFINER` (mesmo modelo das `admin_*`).
4. **Schema próprio `audit`, fora do PostgREST.** A tabela não fica em
   `public` nem em `PGRST_DB_SCHEMAS`: o client não a consulta direto, só via
   RPC em `public`. Isso também a tira do teste `(m)` de `cobranca.sql`
   (que olha `public`) — o bloqueio de cobrança é aplicado dentro das funções
   de leitura. Efeito colateral a tratar na etapa A: o `pg_dump` do runbook de
   backup só leva `public`, `auth`, `storage` e `migrations`
   (`docs/runbooks/backup.md`); o schema `audit` precisa entrar nele e no
   restore, senão o log não tem backup.
5. **Guardar só o que mudou.** Em UPDATE, `old_values`/`new_values` levam só
   as colunas alteradas, e `changed_fields` lista os nomes; em INSERT, a linha
   nova; em DELETE, a linha antiga. UPDATE sem mudança real (depois de
   ignorar `updated_at`) não gera evento. Reduz volume e deixa o diff legível.
6. **Configuração por tabela.** `audit.tabelas_auditadas` diz quais tabelas
   têm o gatilho, quais colunas ignorar (`updated_at`, vetores de busca,
   textos longos gerados por IA) e quais **mascarar** (CPF/CNPJ, `token` de
   convite, documentos). Atende a OWASP (não registrar segredo nem dado
   pessoal sensível) e a regra de logs do projeto (`.claude/rules/security.md`).
7. **Ator confiável, nunca vindo do body.** `actor_user_id` sai de
   `auth.uid()` (JWT validado pelo PostgREST). Para as poucas Edge Functions
   que escrevem com service role, a função envia o `user.id` que **ela**
   derivou do JWT no header `x-audit-actor`; o gatilho só aceita esse header
   quando `auth.role() = 'service_role'`. Sem JWT e sem header, o ator fica
   nulo e a origem diz `sql` ou `sistema`. Quando `auth.uid()` não é membro
   ativo da organização do registro mas há sessão de suporte aberta para ela
   (`sessao_suporte_vigente(organization_id)`, `0035`), o tipo é `suporte`.
8. **Particionado por mês desde o início**, com retenção por descarte de
   partição (seção 4). Sai barato agora e evita migração de tabela grande
   depois.
9. **Retenção de 24 meses** (decidido pelo usuário em 2026-10-20). O
   `pg_partman` mantém as partições dos últimos 24 meses
   (`retention = '24 months'`, `retention_keep_table = false`) e o job do
   `pg_cron` descarta, todo mês, a partição que passou do prazo. Vale para
   todas as tabelas auditadas, sem prazo diferente por fase. Eventos
   descartados só voltam pelo backup do banco, dentro do prazo de retenção do
   backup (`docs/runbooks/backup.md`) — prazo que hoje não está fixado em
   número no repositório (pergunta 6 da seção 8).

## 3. Modelo de dados

```sql
create schema audit;

create table audit.eventos (
  id               bigint generated always as identity,
  ocorrido_em      timestamptz not null default now(),
  organization_id  uuid not null,            -- sem FK: o log sobrevive à exclusão da organização (nulo: ver seção 8, pergunta 5)
  -- quem
  actor_user_id    uuid null,                -- auth.uid() ou x-audit-actor (só service_role)
  actor_tipo       text not null,            -- membro | patrocinador | suporte | sistema | ia | sql
  actor_papel      text null,                -- org_role no momento do ato (snapshot); nulo em suporte
  -- o quê
  tabela           text not null,            -- 'contracts', 'installments', ...
  registro_id      uuid not null,            -- id da linha (todas as tabelas de domínio têm uuid)
  operacao         text not null,            -- INSERT | UPDATE | DELETE
  campos_alterados text[] null,
  valores_antigos  jsonb null,
  valores_novos    jsonb null,
  -- de onde
  origem           text not null,            -- portal | portal_patrocinador | edge:<nome> | rpc:<nome> | sql
  transacao_id     xid8 not null default pg_current_xact_id(),  -- agrupa a mesma requisição
  correlacao_id    text null,                -- x-correlation-id da ação do usuário (várias requisições)
  ip               inet null,                -- x-forwarded-for (ver seção 8)
  user_agent       text null,
  motivo           text null,                -- set_config('audit.motivo', ...) em RPCs que pedem comentário
  primary key (id, ocorrido_em),
  constraint eventos_operacao_check check (operacao in ('INSERT','UPDATE','DELETE'))
) partition by range (ocorrido_em);

create table audit.tabelas_auditadas (
  tabela            text primary key,
  colunas_ignoradas text[] not null default '{updated_at}',
  colunas_mascaradas text[] not null default '{}',
  ativo             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

- `organization_id` vem da própria linha. As tabelas de tenant herdado (padrão
  2, ex.: `ai_messages`) resolvem a organização pelo pai numa função por
  tabela — ou ficam fora da primeira fase.
- `actor_tipo = 'patrocinador'` quando `auth.uid()` não é membro da
  organização mas tem `sponsor_portal_access` (ex.: aprovação de entrega).
- `actor_tipo = 'suporte'` quando `auth.uid()` não é membro e há sessão de
  suporte vigente para a organização (superadmin, ADR-0008). O evento
  identifica o operador por `actor_user_id`; se o cliente enxerga ou não esse
  evento é a pergunta 1 da seção 8. A abertura da sessão continua só em
  `platform_admin_audit_log`.
- `registro_id` é o `id` da linha. Não precisa do uuid derivado da PK do
  `supa_audit`, porque todas as tabelas de domínio do BrandPlay têm `id uuid`.
- Contexto da requisição vem de `request.headers` e `request.jwt.claims`,
  que o PostgREST publica como GUC em toda requisição (o compose usa
  `postgrest/postgrest:v14.12`).

### Leitura (RPCs em `public`)

| Função | Quem pode | Uso |
|---|---|---|
| `audit_eventos(_org_id, _filtros jsonb, _antes_de bigint, _limite int)` | `has_org_role(_org_id, ['owner','admin'])` e organização com acesso de cobrança | tela "Auditoria" da organização: filtro por período, tabela, ator, operação |
| `audit_historico(_tabela text, _registro_id uuid)` | quem consegue **ler o registro hoje**, pelo mesmo critério do SELECT da tabela de origem | aba "Histórico" no detalhe de contrato, proposta, patrocinador etc. |

Paginação por *keyset* (`_antes_de` = último `id` visto), nunca `offset`.
Ambas `revoke all ... from public, anon` e `grant execute ... to authenticated`.
O superadmin **não** lê `audit.eventos` (são dados de domínio dos clientes,
ADR-0008); em sessão de suporte ele vale como `admin` da organização e lê o
feed como qualquer admin, o que é coerente com a regra do ADR e fica evidente
no tipo `suporte`.

`audit_historico` **não** pode usar `is_org_member` como critério. Desde a
`0036`, o SELECT de patrocinadores, oportunidades, propostas, entregas e
parcelas já exige acesso de leitura ao módulo (`can_access_module`), e a fase 2
do plano de equipes (ADR-0012) vai esconder também os registros de projetos que
não são das equipes do usuário. O histórico não pode mostrar o que o registro
esconde. Opção de implementação (a decidir na etapa E): a função confere a
leitura rodando um `select` do registro na própria tabela, com a RLS do
usuário (`security invoker`, nome da tabela só de `audit.tabelas_auditadas`);
assim o histórico acompanha qualquer mudança futura de policy sem reescrever a
função. Registro excluído não passa nessa conferência; o histórico dele só
aparece no feed de owner/admin.

## 4. Performance

Volume esperado: o BrandPlay é um sistema de gestão com escrita humana, longe
do teto que o `supa_audit` recomenda para auditoria por gatilho (~3 mil
escritas/s por tabela). O custo relevante é por escrita (um insert extra e a
montagem do jsonb), não de vazão.

| Medida | Por quê |
|---|---|
| Gatilho `AFTER ROW`, diff só das colunas alteradas, UPDATE vazio descartado | Menos bytes por evento e menos eventos |
| Particionamento mensal com `pg_partman` 5.3.1 + manutenção por `pg_cron` 1.6.4 (ambos disponíveis na imagem `supabase/postgres:17.6.1.136`, conferido no stack local em 2026-10-20; **reconferir na etapa A**, junto com o `shared_preload_libraries` do `pg_cron`, que o compose não define) | Retenção = `drop` de partição (sem `delete` em massa, sem inchaço de vacuum); consultas por período tocam só as partições do intervalo |
| Índices por partição: `(organization_id, ocorrido_em desc)`, `(tabela, registro_id, ocorrido_em desc)`, `(organization_id, actor_user_id, ocorrido_em desc)` | Cobrem as três consultas da tela (feed, histórico do registro, "o que fulano fez") |
| BRIN em `ocorrido_em` | Tabela só de inserção, em ordem de tempo: BRIN custa quase nada e ajuda varreduras por período longo |
| Sem FK para `organizations`/`auth.users` | FK em tabela de log custa em toda escrita e impediria apagar organização/usuário |
| `bigint identity` em vez de uuid | Índice menor e ordenação natural para o keyset |
| Gatilho de instrução com *transition tables* (`REFERENCING NEW TABLE`) como opção para tabelas de carga em lote (`installments`, `proposal_items`, `contract_assets`, `tier_assets`) | Uma chamada por instrução em vez de uma por linha. Só adotar se o benchmark da fase F mostrar necessidade |
| Desligar a auditoria só em carga operada à mão (importação do Lovable, `supabase/tools`) via `set_config('audit.desligado','on', true)`, aceito apenas quando `current_user` não é `anon`/`authenticated`/`service_role` | A carga inicial não deve gerar milhões de eventos; a API nunca consegue desligar |

**Meta de aceite**: a fase F mede insert/update em `contracts` e a geração de
parcelas com e sem auditoria (`pgbench` com script próprio no stack isolado).
Aceitar se o overhead por escrita ficar abaixo de ~20% e a geração de 60
parcelas continuar abaixo de 200 ms; acima disso, trocar as tabelas de lote
para gatilho de instrução.

**Ambientes hospedados**: o Postgres de homologação e de produção é
configurado no Dockploy (`CLAUDE.md`, seção 3), não neste repositório. Antes de
publicar a migration da etapa A, conferir lá que `pg_cron` e `pg_partman`
estão disponíveis e habilitados (pergunta 4 da seção 8); a migration não pode
ser a primeira a descobrir que faltam.

## 5. Rastreabilidade

Atributos da OWASP (quando, onde, quem, o quê) mapeados para colunas:

| OWASP | Coluna |
|---|---|
| quando | `ocorrido_em` |
| identificador da interação | `transacao_id` (uma requisição PostgREST = uma transação) e `correlacao_id` (uma ação de usuário com várias requisições, ex.: criar contrato + cláusulas + parcelas) |
| onde | `origem`, `ip`, `user_agent` |
| quem | `actor_user_id`, `actor_tipo`, `actor_papel` |
| o quê | `tabela`, `registro_id`, `operacao`, `campos_alterados`, valores antes/depois, `motivo` |

Como cada origem chega ao gatilho:

| Origem | Ator | Ajuste necessário |
|---|---|---|
| Portal (PostgREST com JWT do usuário) | `auth.uid()` | `createSupabaseFetch`, em `client.ts`, envia `x-audit-origin: portal` e, por ação, `x-correlation-id` |
| Portal do patrocinador | `auth.uid()`, tipo `patrocinador` | mesmo client, `x-audit-origin: portal_patrocinador` nas rotas `/portal` |
| Sessão de suporte do superadmin | `auth.uid()` do operador, tipo `suporte` | nenhum no client: o gatilho consulta `sessao_suporte_vigente(organization_id)` |
| Edge Function com JWT do usuário (IA, BrandTrack, `summarize-contract`, `generate-proposal-pdf`...) | `auth.uid()` | helper em `supabase/functions/_shared/` que cria o client com `x-audit-origin: edge:<nome>`; a camada de IA já centraliza isso em `_shared/ai/funcao.ts` (`autenticar`), as demais criam o client à mão |
| Edge Function com service role (`manage-team-access`, `manage-portal-access`, `create-organization`, `social-posts`) | `x-audit-actor` (aceito só para `service_role`) | o helper repassa o `user.id` derivado do JWT; sem usuário (webhook, cron), ator nulo e `actor_tipo = sistema`. As três primeiras só importam na fase 4 (acesso e configuração); `social-posts`, quando `property_posts` entrar (seção 6.1) |
| RPC com comentário obrigatório | `auth.uid()` | a função faz `set_config('audit.motivo', _comentario, true)` |
| SQL Editor / psql | nulo, `actor_tipo = sql` | nenhum — fica visível que foi operação manual |

Ligação com o log transacional das Edge Functions: o despachante
(`supabase/functions/main`) já gera um `x-request-id` por requisição e o repassa
à função. O helper pode copiá-lo para o `correlacao_id` quando a origem for uma
Edge Function, o que permite ir de um evento de auditoria à linha
`request.contexto` do log (`docs/infrastructure/monitoring.md`) sem criar outro
formato de log.

IP e user agent: o `x-forwarded-for` passa por Traefik e Kong antes do
PostgREST. A etapa D precisa confirmar qual entrada da cadeia é confiável (o
cliente pode enviar o próprio header) antes de gravá-lo; nada no repositório
trata isso hoje.

Integridade (OWASP: detectar alteração e exclusão): na fase 1 a garantia é
de permissão (ninguém da API escreve). Encadear hash por organização
(`hash = sha256(hash_anterior || evento)`) dá evidência contra quem opera o
banco, mas serializa as escritas da organização; fica como opção (seção 8).
Para atos de quem opera o banco, a camada certa é o `pgaudit` (17.1,
disponível) nos logs do servidor de produção.

## 6. Escopo por fase

Prioridade pelas ações de maior impacto (dinheiro, compromisso com o
patrocinador, acesso):

| Fase | Tabelas | Motivo |
|---|---|---|
| 1. Financeiro e contratual | `contracts`, `contract_clauses`, `contract_assets`, `installments`, `tier_sales`, `sponsorship_tiers` | Valor, parcela e cota vendida: a pergunta "quem mudou o valor?" precisa de resposta |
| 2. Comercial | `opportunities`, `proposals`, `proposal_items`, `sponsors`, `sponsor_contacts`, `sponsor_documents`, `sponsor_brands` | Pipeline e propostas; complementa os logs atuais |
| 3. Operação | `deliveries`, `delivery_attachments`, `assets`, `asset_allocations`, `tier_assets`, `sports_properties`, `property_events`, `property_media` | Entregas e inventário |
| 4. Acesso e configuração | `organizations`, `organization_members`, `organization_invites`, `sponsor_portal_access`, `sponsor_invites`, `pipeline_funnels`, `pipeline_stage_slas`, `contract_clause_templates` | Quem deu acesso a quem; complementa `team_audit_log` |

Fora: dado pessoal do usuário (`notifications`, `user_dashboard_preferences`,
`user_stage_probabilities`), tabelas geradas por IA ou recalculáveis
(`lead_scores`, `contract_churn_risk`, `market_benchmarks`,
`sponsor_executive_summaries`, `sellout_reports`, `ai_*`), BrandTrack
(`brandtrack_*`, alto volume de detecções), os próprios logs, `billing_*` (já
escritos só pelo servidor, com `platform_admin_audit_log` para o
superadmin), `platform_support_sessions` (sessão do operador, auditada em
`platform_admin_audit_log`) e as tabelas de erro.

### 6.1 Tabelas escritas pelo portal que o plano não classificava

Conferido em 2026-11-07 contra o apêndice A. A coluna "Sugestão" é só ponto de
partida; a classificação é a pergunta 3 da seção 8 e nada aqui foi decidido.

| Tabelas | Origem | Sugestão |
|---|---|---|
| `proposal_versions` | já estava no apêndice, sem fase | fase 2 |
| `opportunity_activities`, `opportunity_comments`, `opportunity_comment_attachments`, `opportunity_contacts`, `sponsor_interactions`, `sponsor_crm_profiles`, `crm_tasks` | CRM; já estavam no apêndice, sem fase | fora (já têm autor e data próprios), exceto se algum cliente pedir |
| `asset_photos`, `property_checklist_items` | operação; sem fase | fase 3 |
| `property_leads` | formulário público do media kit (insert `anon`) | fora: não tem ator autenticado e já guarda origem e data |
| `reports`, `property_posts`, `property_indicators` | relatório em landing page (ADR-0011, `0040`) | fase 3 (`reports` tem regras de publicação em gatilho) |
| `organization_brand_kits`, `organization_brand_assets` | marca da organização (`0034`) | fase 4, baixa prioridade |
| `work_teams`, `work_team_members`, `work_team_properties`, `organization_role_grants` | equipes e permissões (ADR-0012, `0036`, `0042`) | fora de `audit.eventos`: já auditadas em `team_audit_log` por gatilho |

## 7. Entregas

Numeração de migration e de ADR: a primeira livre **no momento de escrever**
(hoje a migration `0045` e a ADR 0014). Outras frentes (equipes, visão de
marca) também consomem números; não reservar com antecedência.

| Etapa | Entrega | Arquivos |
|---|---|---|
| A. Fundamento | schema `audit`, `audit.eventos` particionada, `audit.tabelas_auditadas`, `pg_partman` + job `pg_cron`, gatilho genérico com diff, máscara, tipo `suporte` e contexto da requisição, revogação total de escrita; `pg_dump` e restore passam a incluir `audit` | migration nova (`audit_fundamento`), `docs/runbooks/backup.md`, `docs/runbooks/restore.md` |
| B. Integridade dos logs atuais | `sponsor_audit_logs`: trocar `for all` por leitura de membro, sem escrita pela API; remover `opportunity_audit_logs_module_insert` e `team_audit_log_admin_insert` (o portal não insere nessas tabelas — reconferido por grep em 2026-11-07; quem grava são gatilhos, RPCs e `manage-team-access`) | migration nova (`logs_imutaveis`) |
| C. Ligar as tabelas | fases 1 a 4 da seção 6, uma migration por fase ou uma só com `audit.ativar('<tabela>')` | migration nova (`auditoria_tabelas`) |
| D. Contexto | headers `x-audit-origin`/`x-correlation-id` no client; helper de client para Edge Functions com `x-audit-actor` (só as quatro com service role) e `x-request-id` como correlação; `audit.motivo` nas RPCs com comentário; confirmar a entrada confiável de `x-forwarded-for` | `portal/src/integrations/supabase/client.ts`, `supabase/functions/_shared/` |
| E. Leitura e telas | RPCs `audit_eventos` e `audit_historico` (seção 3); tela "Auditoria" da organização (ou ampliação da aba existente: pergunta 7) e aba "Histórico" nos detalhes, com react-query, diff campo a campo e nomes de campo em PT-BR | `portal/src/components/audit/`, `portal/src/hooks/useAuditoria.ts`, páginas de detalhe |
| F. Testes e medição | SQL: evento gerado em insert/update/delete; UPDATE vazio não gera; membro de outra organização não lê; não-admin não lê o feed; ninguém da API escreve, altera ou apaga; `x-audit-actor` ignorado fora de `service_role`; coluna mascarada não aparece; sessão de suporte gera `actor_tipo = 'suporte'`; linha com `organization_id` nulo não derruba a escrita; histórico respeita o escopo por equipe quando a fase 2 existir. E2E: editar contrato e ver o histórico. Benchmark da seção 4 | `supabase/tests/auditoria.sql` **e** entrada nova na lista do script `supabase:test` (`package.json`), `portal/e2e/` |
| G. Documentação | ADR de auditoria por gatilho, `SECURITY.md`, `.claude/rules/supabase.md` (tabela nova de domínio entra em `audit.tabelas_auditadas`), `SCHEMA_NOTES.md`, `docs/infrastructure/monitoring.md` (a frase "auditoria de negócio continua nas tabelas `*_audit_log`" passa a citar `audit.eventos`), runbook de retenção | `docs/` |

## 8. Decisões em aberto (precisam do usuário)

Nenhuma destas foi decidida; a retenção de 24 meses (seção 2, item 9) é a
única decisão fechada.

| # | Decisão | Proposta padrão |
|---|---|---|
| 1 | O cliente enxerga os eventos de `actor_tipo = 'suporte'` no feed da organização? | Sim, identificados como "Suporte da plataforma": a sessão já exige comentário e prazo, e esconder do dono da organização o que o operador mexeu nos dados dele contraria a transparência da ADR-0008. Confirmar também com a política de privacidade |
| 2 | Quem lê o feed da organização | owner e admin. Histórico de um registro: qualquer membro que lê o registro (pelo critério de SELECT da tabela, seção 3) |
| 3 | Classificação das tabelas da seção 6.1 | Sugestão da própria seção |
| 4 | `pg_cron` e `pg_partman` disponíveis no Postgres de homologação e produção (configurado no Dockploy) | A confirmar com quem opera os ambientes antes da etapa A. Se faltar, alternativa: partições criadas por migration e descarte mensal por rotina externa. O `pg_cron` passou a ser criado pela `0047` (retenção dos logs de falha, ADR-0014), que para se ele não estiver carregado: aplicada em homologação e produção, a pergunta fica respondida para ele; o `pg_partman` continua a confirmar |
| 5 | Linha de tabela de domínio com `organization_id` nulo: o gatilho registra com organização nula (coluna sem `not null`), ignora e avisa, ou o evento fica em partição própria? | Registrar sem derrubar a escrita, com `organization_id` nulo visível só a quem opera o banco; a causa (insert sem organização) já é bug a corrigir na origem |
| 6 | Prazo de retenção do backup do banco | Fixar em número no runbook junto com a frente de backup, e conferir se cobre os 24 meses; senão registrar que evento descartado não volta |
| 7 | Tela nova "Auditoria" ou ampliar a aba "Auditoria" de Usuários & Permissões (`components/team/TeamAuditLog.tsx`, hoje só equipe e permissões) | Tela própria para dados de domínio, sem misturar com a de equipe; unificar fica com a seção 9 |
| 8 | Gravar IP e user agent | Sim, com a mesma retenção (24 meses). IP é dado pessoal (LGPD): precisa constar na política de privacidade |
| 9 | Pedido de exclusão de dados (LGPD) | Pseudonimizar o ator (`actor_user_id` → nulo, mantendo `actor_papel`) em vez de apagar o evento; base legal: exercício regular de direitos e segurança (art. 7, VI e art. 46) |
| 10 | Cadeia de hash contra adulteração | Não na fase 1; reavaliar se algum cliente exigir evidência formal |
| 11 | Exportação (CSV) para o cliente | Etapa E, só owner |
| 12 | Mostrar o log ao patrocinador no portal | Não — o portal já mostra `delivery_approval_log` |

## 9. Fora do escopo

- Unificar `sponsor_audit_logs`, `opportunity_audit_logs` e `team_audit_log`
  em `audit.eventos` (as linhas do tempo leriam de lá). Avaliar depois que a
  auditoria estiver em produção.
- Auditoria de leitura (quem visualizou o quê). Só se surgir requisito.
- Envio para sistema externo de logs (SIEM).
- Eventos de autenticação: já estão em `auth.audit_log_entries` do GoTrue;
  uma tela que os exiba é tarefa própria.
- Ações do superadmin: continuam em `platform_admin_audit_log` (ADR-0008); o
  feed da organização não as duplica, a não ser as feitas em sessão de
  suporte (pergunta 1 da seção 8).

## 10. Referências

Os links externos são os do plano original e não foram revisitados em
2026-11-07.

- `supa_audit` — https://github.com/supabase/supa_audit (gatilho genérico,
  `record`/`old_record` em jsonb, teto de ~3 mil escritas/s por tabela)
- OWASP Logging Cheat Sheet —
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
  (atributos quando/onde/quem/o quê, dados a excluir, integridade)
- PostgreSQL — gatilhos com transition tables:
  https://www.postgresql.org/docs/17/sql-createtrigger.html
- PostgreSQL — particionamento declarativo:
  https://www.postgresql.org/docs/17/ddl-partitioning.html
- PostgreSQL — índices BRIN: https://www.postgresql.org/docs/17/brin.html
- Audit trigger da wiki do PostgreSQL:
  https://wiki.postgresql.org/wiki/Audit_trigger_91plus
- `pg_partman` — https://github.com/pgpartman/pg_partman
- `pgaudit` — https://github.com/pgaudit/pgaudit
- PostgREST — GUCs da requisição (`request.headers`, `request.jwt.claims`):
  https://docs.postgrest.org/en/stable/references/transactions.html
- EnterpriseDB — auditoria com gatilho de instrução e transition tables:
  https://www.enterprisedb.com/postgres-tutorials/can-modified-tuples-be-accessed-using-statement-level-trigger-postgres
- CYBERTEC — custo de gatilhos:
  https://www.cybertec-postgresql.com/en/more-on-postgres-trigger-performance/
- LGPD (Lei 13.709/2018), art. 37 (registro das operações de tratamento) e
  art. 46 (segurança) — https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- No repositório: ADR-0008 (superadmin e sessão de suporte), ADR-0010 (IA com
  o client do usuário), ADR-0012 (equipes), `docs/infrastructure/monitoring.md`
  (log transacional), `docs/runbooks/backup.md`.

## Apêndice A — escritas do portal por tabela

Levantado em 2026-11-07 por script sobre `portal/src` (chamadas
`.from("<tabela>").<op>(`, inclusive quebradas em linhas e com `as any`;
arquivos de teste e `types.ts` excluídos): 55 tabelas em 41 arquivos.
Indicativo, não exaustivo: não vê escrita feita por RPC, Edge Function ou
`.from()` guardado em variável. As diferenças em relação ao levantamento de
2026-10-20 misturam mudança de código e de critério de contagem.

| Tabela | insert | update | delete |
|---|---|---|---|
| contracts | 3 | 8 | 1 |
| installments | — | 2 (+ RPC `mark_overdue_installments`) | — |
| contract_clauses / contract_assets | 2 / 2 | 2 / — | 2 / 1 |
| tier_sales / sponsorship_tiers / tier_assets | 1 / 1 / 3 | — / 1 / 2 | 1 / 1 / 3 |
| opportunities | 3 | 8 | 2 |
| proposals / proposal_items / proposal_versions | 4 / 6 / 3 | 10 / 1 / 1 | 1 / 1 / — |
| sponsors / sponsor_documents / sponsor_brands | 2 / 1 / 1 | 2 / 1 / 1 | — / 1 / 1 |
| deliveries / delivery_attachments | 1 / 1 | 6 / — | 1 / 1 |
| assets / asset_photos / asset_allocations | 2 / 2 / 3 | 3 / 2 / — | 1 / 1 / 1 |
| sports_properties / property_events / property_media | 2 / 1 / 3 | 2 / — / 4 | — / 1 / 1 |
| crm_tasks / opportunity_activities / sponsor_interactions | 2 / 3 / 1 | 4 / 3 / 2 | 1 / 1 / 1 |
| opportunity_comments / opportunity_comment_attachments / opportunity_contacts | 1 / 1 / 1 | — | — / — / 1 |
| organizations / pipeline_funnels / contract_clause_templates | — / 1 / 1 | 2 / — / — | — / — / 1 |
| sponsor_invites / sponsor_portal_access | — | 1 / 1 | — |
| reports / property_posts / property_indicators | 1 / 1 / 1 | 1 / 1 / 1 | — / 1 / 1 |
| property_checklist_items / property_leads / sponsor_crm_profiles | 2 / 1 / 2 | 4 / — / — | 1 / — / — |
| work_teams / work_team_members / work_team_properties | 1 / — / 1 | 2 / 2 (+1 upsert) / 1 | — / — / 1 |
| organization_role_grants | — | 1 | — |
| organization_brand_kits / organization_brand_assets / pipeline_stage_slas | upsert 1 cada | — | — |

RPCs que escrevem domínio: `merge_sponsors`, `create_renewal_opportunity`,
`copy_opportunity_tier_to_proposal`, `copy_proposal_items_to_contract`,
`mark_overdue_installments`, `accept_sponsor_invite_by_token`,
`create_organization_with_owner` (todas existem nas migrations de `dev`;
`create_renewal_opportunity` e `create_organization_with_owner` foram
redefinidas na `0043`). Edge Functions que escrevem domínio com o client do
usuário: `ai-assistant` (`sponsor_interactions`, `opportunity_activities`),
`summarize-contract` (`contracts`), `generate-proposal-pdf` (`proposals`) e,
fora do escopo da auditoria, `brandtrack-detect-image` e `score-leads`. Com
service role: `manage-team-access`, `manage-portal-access`,
`create-organization` e `social-posts`. Todas passam pelo gatilho sem mudança
de código; só o contexto (origem/ator) depende da etapa D, e só as quatro
últimas precisam de `x-audit-actor`.
