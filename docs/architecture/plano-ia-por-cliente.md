# Plano de ação: IA com chave padrão e chave por cliente

- **Data**: 2026-10-20
- **Status**: **aprovado em 2026-10-20**, com todas as decisões da seção 7.
  Backlog em `docs/architecture/backlog-ia-por-cliente.md`. A ADR da IA (próximo número livre), que
  substitui a ADR-0003, é uma das histórias do backlog.
- **Pedido**: IA compatível com vários fornecedores; uma chave padrão da
  plataforma usada por todos os clientes; o superadmin troca a chave de um
  cliente por uma exclusiva, para controlar o custo de cada um; tela de gestão
  de IA dos clientes na área `/admin`; os recursos de IA do portal passam a
  usar a chave ligada à organização. O pedido original citava OpenAI e
  DeepSeek; depois da comparação (§2.1), a versão atual fica com **OpenAI,
  Google Gemini e Anthropic**.

## 1. Diagnóstico

### 1.1 Como está hoje

As 13 Edge Functions de IA chamam `https://api.anthropic.com/v1/messages`
direto, cada uma com o próprio `fetch`, o próprio modelo fixo no código e a
mesma `ANTHROPIC_API_KEY` de ambiente (ADR-0003, `supabase/functions/MIGRATION_NOTES.md`).
Não há camada comum, nem registro de uso. Sem a variável configurada no
ambiente, todas falham — é o "pararam de funcionar".

| Função | Precisa de | Como sabe a organização hoje |
|---|---|---|
| `ai-assistant` | tools em loop multi-turno, histórico em `ai_messages` | ❌ não sabe (dá para tirar de `ai_conversations.organization_id`) |
| `brandtrack-detect-image` | **visão** + tool forçada | ✅ `brandtrack_media.organization_id` |
| `generate-proposal-ai` | tool forçada | ❌ |
| `generate-proposal-wizard` | tool forçada, saída longa | ❌ |
| `summarize-contract` | texto longo + chat | ❌ (dá para tirar do contrato) |
| `suggest-next-steps` | tool forçada, 6 contextos | ❌ (dá para tirar do registro de contexto) |
| `prepare-meeting-ai` | JSON | ✅ `sponsors.organization_id` + `can_access_module` |
| `task-insights` | JSON | ✅ registro da tarefa + `can_access_module` |
| `sponsor-executive-summary` | texto | ❌ (dá para tirar do patrocinador) |
| `generate-sellout-report` | texto longo | ❌ (dá para tirar da propriedade/evento) |
| `ticket-benchmark-ai` | JSON | ⚠️ `get_user_org` — devolve **uma** organização, ambíguo para quem está em várias |
| `score-leads` | tool forçada | ❌ lê patrocinadores de **todas** as organizações do usuário num só prompt |
| `detect-churn-risk` | texto curto | ❌ idem, varre tudo que o RLS deixa ver |

### 1.2 O que isso significa para o pedido

1. **Sem saber a organização, não há como escolher a chave nem atribuir
   custo.** 9 das 13 funções não determinam a organização. É o pré-requisito
   número um, antes de qualquer tela.
2. **`score-leads` e `detect-churn-risk` misturam organizações** quando o
   usuário é membro de mais de uma (ADR-0002). Não vaza dado para terceiros
   (o usuário vê as duas), mas mistura contexto comercial de clientes
   diferentes no mesmo prompt e torna o custo inatribuível. Corrigir junto.
3. **Chave exclusiva sozinha não controla custo.** Ela separa a fatura no
   painel do fornecedor, mas o BrandPlay continua sem saber quanto cada cliente
   gastou, nem consegue parar o consumo. O controle de verdade é **medição
   própria + orçamento**, com a chave exclusiva como reforço.
4. **Dois formatos cobrem os três fornecedores.** OpenAI e Gemini falam o
   Chat Completions da OpenAI (o Google documenta um endpoint compatível,
   `https://generativelanguage.googleapis.com/v1beta/openai/`). A Anthropic
   fala o próprio formato (Messages); a camada compatível com OpenAI que ela
   oferece é indicada pela própria Anthropic para teste, não para produção.
   Logo: dois adaptadores, `openai_compat` e `anthropic` — e o segundo já está
   praticamente escrito, porque é o formato do código atual (§3.1).
5. **Visão**: os três fornecedores aceitam imagem, então o BrandTrack
   (`brandtrack-detect-image`) funciona em qualquer um. A regra da Q4 continua
   valendo para o caso de o superadmin escolher, para um cliente, um modelo
   sem visão.
6. **Histórico do assistente** (`ai_messages.tool_calls`) está gravado no
   formato de blocos da Anthropic. Se a organização trocar de fornecedor no
   meio de uma conversa, o histórico precisa ser convertido. Passa a ser
   gravado num formato neutro.
7. **CI não roda testes Deno** (só existe `create-organization/organization_rls_test.ts`,
   fora do pipeline). A camada de IA precisa de testes de adaptador, então
   entra um passo `deno test` no `ci.yml`.

## 2. Como outros SaaS resolvem

| Estratégia | Exemplos de mercado | Prós | Contras |
|---|---|---|---|
| **Chave única da plataforma + medição por cliente + cota no plano** | Notion AI, HubSpot (créditos), Canva, Intercom Fin (por resolução) | Simples para o cliente; IA vira item de plano/receita | Custo todo na plataforma; exige medição e limite bem feitos |
| **Chave por cliente gerida pela plataforma** (o pedido) | SaaS B2B com clientes enterprise; OpenAI Projects (chave e orçamento por projeto) | Custo isolado na fatura do fornecedor; limite "duro" no próprio fornecedor | Operação manual por cliente; sem medição própria não se vê o consumo dentro do produto |
| **BYOK — o cliente traz a chave** | Cursor, JetBrains AI, Zapier, n8n | Custo zero para a plataforma | Suporte difícil (chave errada, sem saldo); cliente pequeno não sabe fazer |
| **Gateway de IA** (LiteLLM self-hosted, OpenRouter, Portkey) | Plataformas com muitos modelos | Chaves virtuais com orçamento, roteamento, fallback, painel de custo | Mais um serviço para operar (LiteLLM) ou intermediário pago e com dado passando por terceiro (OpenRouter/Portkey) |

Pontos que aparecem em todas as referências:

- **Medir tudo no próprio produto**: tokens de entrada/saída por cliente,
  funcionalidade, fornecedor e modelo — a plataforma é a fonte de verdade do
  uso, não o painel do fornecedor.
- **Orçamento por cliente com alerta e corte**, e limite de taxa (requisições
  por minuto) contra abuso.
- **Credencial amarrada ao tenant em toda requisição**: retry, fila e fallback
  nunca podem usar a chave de outro cliente.
- **Chave nunca volta para o navegador**: gravação "só escrita", tela mostra
  só os últimos 4 caracteres.

**Recomendação**: o modelo pedido (padrão + chave exclusiva pelo superadmin),
**sempre com medição própria e orçamento por organização**. Para a chave
exclusiva na OpenAI, usar um *Project* por cliente, com limite de gasto
configurado lá também (corte duro do lado do fornecedor). Gateway fica para
depois: a camada nova aceita um fornecedor "compatível com OpenAI" a mais, então
plugar um LiteLLM no compose no futuro não muda as funções.

### 2.1 Fornecedores avaliados (Q6)

Preços por 1M de tokens (entrada/saída) tirados de agregadores em 2026, não
das páginas oficiais, e com divergência entre fontes. **Servem para comparar
ordem de grandeza, não para orçar** — conferir na página do fornecedor antes de
cadastrar em `ai_model_prices`.

**Na versão atual:**

| Fornecedor | Modelo econômico | Modelo melhor | Visão | Formato | Onde processa | Observação |
|---|---|---|---|---|---|---|
| **OpenAI** | nano ≈ US$ 0,20 / 1,25; mini ≈ US$ 0,75 / 4,50 | GPT-5.x ≈ US$ 5 / 30 | Sim | Chat Completions (nativo) | EUA | Referência de qualidade; *Projects* com chave e orçamento por cliente |
| **Google Gemini** (API Gemini) | Flash-Lite ≈ US$ 0,10–0,30 / 0,40–2,50 (varia por versão) | Flash / Pro | **Sim, forte** | Chat Completions (endpoint compatível oficial) | EUA/global; São Paulo só via Vertex AI | Mais barato dos três. Usar **só o plano pago**: o gratuito usa os dados para treino. Vertex AI (região `southamerica-east1`) autentica por conta de serviço, não por chave — fica para depois |
| **Anthropic** | Haiku ≈ US$ 1 / 5 | Sonnet ≈ US$ 3 / 15 | Sim | Messages (próprio) | EUA | Formato do código atual: adaptador sai do que já existe |

**Avaliados e deixados para versões futuras** (todos entram pelo adaptador
`openai_compat`, exceto onde indicado):

| Fornecedor | Por que fica para depois |
|---|---|
| DeepSeek (V4-Flash ≈ US$ 0,14 / 0,28) | Processa na China (transferência internacional sem adequação, LGPD); visão só em modelo experimental; tool obrigatória não funciona com raciocínio ligado |
| Maritaca (Sabiazinho-4 R$ 1 / R$ 4) | Português nativo e empresa brasileira, mas visão e tool obrigatória não confirmadas; local de processamento a confirmar |
| Mistral (Small 4 ≈ US$ 0,10 / 0,30) | API parecida com a da OpenAI, mas não idêntica (ex.: `tool_choice: "any"`) — pede ajustes na tabela de diferenças |
| Groq / Together (modelos abertos, a partir de ≈ US$ 0,05) | Catálogo instável; visão limitada |

**Leitura para o BrandPlay:**

- **Gemini é a opção econômica**, com visão nativa e endpoint compatível com
  OpenAI documentado pelo Google.
- **OpenAI é a referência de qualidade** e a melhor opção de chave exclusiva
  com corte no próprio fornecedor (*Projects*).
- **Anthropic mantém o que já funciona** e dá uma terceira opção sem custo de
  reescrita.
- **A escolha do fornecedor padrão sai de uma avaliação** (fase B2), não da
  tabela: as 13 funções com dados fictícios nos três fornecedores, comparando
  qualidade em português, taxa de JSON inválido, latência e custo medido.

## 3. Decisões de desenho

1. **Camada única `supabase/functions/_shared/ai.ts`.** As funções deixam de
   chamar `fetch` no fornecedor. Passam a chamar algo como
   `ia.gerar({ organizacaoId, funcionalidade, nivel, system, mensagens, tools, toolObrigatoria, imagens, json })`,
   que devolve `{ texto, chamadasDeTool, uso }`. Adaptadores:
   - `openai_compat`: OpenAI e Gemini;
   - `anthropic`: Anthropic — o código atual vira adaptador.

   URL base, matriz de capacidades e diferenças de cada fornecedor (§3.1)
   ficam fixas no código; **sem** URL livre digitada na tela, para não virar
   canal de exfiltração de prompt. Fornecedor novo compatível com OpenAI =
   uma entrada nessa tabela, sem mexer nas funções.
2. **Modelo por nível, não por função.** Cada função declara o nível de que
   precisa — `rapido` (score-leads, churn), `padrao` (o resto), `visao`
   (BrandTrack). Cada credencial mapeia nível → modelo, com padrão por
   fornecedor; o superadmin pode trocar. Nenhum nome de modelo fica espalhado
   pelo código.
3. **Resolução da credencial no servidor, por organização.** Ordem: chave
   exclusiva ativa da organização → chave padrão da plataforma. Sem
   fallback silencioso: se a chave exclusiva falhar (inválida, sem saldo), a
   requisição falha, o erro fica registrado na credencial e o superadmin é
   alertado — cair na chave padrão esconderia o problema e jogaria o custo do
   cliente na plataforma (Q3). O usuário vê: *"Não foi possível usar a IA da
   sua organização no momento. Entre em contato com o suporte."* — sem
   detalhe técnico, sem nome do fornecedor.
   **Exceção (Q4):** quando a funcionalidade exige uma capacidade que o
   modelo configurado para o cliente não tem (ex.: visão no BrandTrack — os
   três fornecedores têm, mas um modelo escolhido pode não ter), aquela
   chamada usa a chave padrão, com o custo registrado na organização e marcado
   como "via chave padrão" na tela do superadmin. A tela avisa ao salvar uma
   credencial sem modelo de visão.
4. **Organização sempre derivada do recurso, ou validada.** Cada função tira a
   organização do registro que já lê sob RLS (contrato, patrocinador, conversa,
   mídia). As que trabalham sobre listas (`score-leads`, `detect-churn-risk`,
   `ticket-benchmark-ai`) recebem a organização ativa do portal, **validam**
   com `is_org_member` + papel do módulo, e filtram todas as consultas por ela
   (CLAUDE.md §7: o `organization_id` do corpo nunca é aceito sem validar contra
   o JWT).
5. **Chaves cifradas na aplicação.** A Edge Function cifra com AES-GCM (Web
   Crypto) usando uma chave mestra de ambiente (`AI_KEYS_MASTER_KEY`, no
   Dockploy). O banco guarda só cifra, IV, versão da chave mestra e os últimos
   4 caracteres. Backup do banco sozinho não expõe chave. Alternativa
   considerada: Supabase Vault — descartada porque a chave raiz fica no volume
   do Postgres (restauração em outra instância quebra) e o Studio lê o
   segredo decifrado.
6. **Medição de todo uso.** Toda chamada grava um evento de uso: organização,
   usuário, funcionalidade, fornecedor, modelo, credencial (padrão ou
   exclusiva), tokens de entrada/saída, custo estimado, latência e resultado.
   **Nunca** o conteúdo do prompt ou da resposta. Custo estimado vem de uma
   tabela de preços por modelo mantida pelo superadmin.
7. **Orçamento por organização.** Limite mensal em custo estimado, com alerta
   em 80% (notificação ao owner/admin e ao superadmin) e, em 100% (Q5): corte
   para quem usa a chave padrão; só alerta para quem tem chave exclusiva (o
   limite duro fica no fornecedor). Limite de taxa por organização/usuário. Organização com cobrança
   bloqueada não usa IA (mesma regra do `billing_access_restrictive`).
8. **Tudo administrativo é auditado** em `platform_admin_audit_log` (ADR-0008):
   definir/revogar chave, trocar fornecedor/modelo, mudar orçamento,
   habilitar/desabilitar IA. O registro leva o final da chave, nunca a chave.
9. **Dado da plataforma, não do cliente.** Credenciais e configuração de IA
   seguem o padrão 9 (superadmin) de `.claude/rules/supabase.md`; o uso da
   organização é legível pelo owner/admin dela (resumo) e pelo superadmin
   (contagens e custo — dentro do que a ADR-0008 já permite). Nenhuma tabela
   de domínio ganha `or is_platform_admin()`.

### 3.1 Diferenças entre fornecedores que a camada trata

A interface neutra de `_shared/ai.ts` esconde estas diferenças das funções:

| Recurso | OpenAI | Gemini (endpoint compatível) | Anthropic |
|---|---|---|---|
| Autenticação | `Authorization: Bearer` | `Authorization: Bearer` (chave da API Gemini) | `x-api-key` + `anthropic-version` |
| Instrução de sistema | mensagem `role: "system"` | mensagem `role: "system"` | campo `system` de nível superior |
| Tool obrigatória | `tool_choice: {type:"function", function:{name}}` | idem | `tool_choice: {type:"tool", name}` só nos modelos que aceitam (Opus 5.5, Sonnet 5.5 e Fable 5.1 recusam); nos demais, saída estruturada (ferramenta única) ou `auto` com instrução |
| Definição de tool | `{type:"function", function:{name, description, parameters}}` | idem | `{name, description, input_schema}` |
| Resposta com tool | `choices[0].message.tool_calls[].function.arguments` (string JSON) | idem | blocos `tool_use` em `content` (objeto) |
| JSON garantido | `response_format` (`json_schema`) | `response_format` | saída estruturada (`output_config.format`), com o esquema fechado (`additionalProperties: false`) |
| Imagem | `image_url` com data URL | `image_url` com data URL | bloco `image` com `source.base64` (função `dataUrlToBase64Source` atual) |
| Limite de saída | `max_completion_tokens` nos modelos novos (`max_tokens` está obsoleto) | `max_tokens` | `max_tokens` (obrigatório) — nos três, com folga para o raciocínio do modelo |
| Parâmetros recusados | modelos de raciocínio recusam `temperature` | — | — |
| Uso (medição) | `usage.prompt_tokens` / `completion_tokens` / `prompt_tokens_details.cached_tokens` | `usage.prompt_tokens` / `completion_tokens` | `usage.input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens` |
| Erros a mapear | 401, 429 (`rate_limit` × `insufficient_quota`), 5xx | 400 (chave), 429, 5xx | 401, 429, 529 (sobrecarregado), 5xx |

Os erros viram categorias neutras — `chave_invalida`, `sem_saldo`,
`limite_taxa`, `indisponivel` — que decidem a mensagem ao usuário (Q3), o
registro em `ai_credentials.last_error` e se vale tentar de novo (só
`limite_taxa`/`indisponivel`, com a **mesma** credencial).

### 3.2 Modelo de dados (migration `0031_ia_por_organizacao.sql`)

| Tabela | Conteúdo | Acesso |
|---|---|---|
| `ai_credentials` | `organization_id` (nulo = padrão da plataforma), `provider` (lista fechada em `check`: `openai`/`gemini`/`anthropic`), `key_ciphertext`, `key_iv`, `key_version`, `key_hint`, `model_rapido`, `model_padrao`, `model_visao`, `status` (`ativa`/`revogada`), `last_validated_at`, `last_error`, `created_by`, `revoked_at`, timestamps. Índice único parcial: 1 ativa por organização e 1 padrão ativa | **Nenhum** select para `authenticated`; escrita só `service_role` (Edge Function). Superadmin lê os metadados (sem cifra) por função `admin_ia_*` |
| `ai_org_settings` | `organization_id`, `ai_enabled`, `monthly_budget_cents`, `alert_threshold_pct`, `hard_limit` | Leitura owner/admin da organização; escrita só servidor |
| `ai_usage_events` | evento por chamada (decisão 6) | Insert só servidor; leitura agregada por owner/admin da organização e superadmin; imutável |
| `ai_model_prices` | fornecedor, modelo, preço por 1M tokens de entrada/saída/cache, vigência | Leitura servidor; escrita superadmin pela Edge Function |
| `billing_plans` | colunas novas `ai_enabled` / `ai_monthly_budget_cents` (padrão do orçamento por plano) | Já existente (ADR-0007) |

As tabelas com `organization_id` entram na lista de exceções do teste `(m)`
de `supabase/tests/cobranca.sql` (dado da plataforma), exceto o que o owner lê
— a decidir na implementação qual policy restritiva se aplica.

## 4. Funcionalidades

### F1. Gestão de IA dos clientes (`/admin/ia`)

- **Chave padrão da plataforma**: fornecedor, modelos por nível, chave
  (só escrita, mostra `••••1234`), botão **Testar conexão** antes de salvar,
  data do último teste e último erro.
- **Lista de clientes** (todas as organizações): modo (padrão/exclusiva),
  fornecedor, modelo, final da chave, status da última chamada, consumo do mês
  (requisições, tokens, custo estimado), orçamento e % usado, IA
  habilitada. Filtros por modo, fornecedor e "acima de 80%".
- **Detalhe do cliente**: definir chave exclusiva (fornecedor + chave +
  modelos, com teste obrigatório), revogar (volta para a padrão), ajustar
  orçamento e corte, habilitar/desabilitar IA, consumo por funcionalidade e
  por dia nos últimos 30 dias. Ações com comentário obrigatório, como na
  liberação de acesso.
- **Preços de modelos**: tabela editável para o custo estimado.
- Edge Function nova **`admin-ai`** (precisa da chave mestra, então não pode
  ser SQL puro): JWT → superadmin ativo → valida → testa a chave no fornecedor
  → cifra → grava → audita. react-query em todo código novo.

### F2. Recursos do portal usando a chave da organização

- As 13 funções migradas para `_shared/ai.ts`, com a organização determinada
  (§3, decisão 4) e as consultas filtradas por ela.
- Portal passa a organização ativa onde a função trabalha sobre listas.
- Mensagens de erro padronizadas: IA desabilitada, orçamento esgotado, chave
  do cliente inválida, limite de taxa — com texto para o usuário final sem
  expor detalhe técnico.
- Histórico do `ai-assistant` em formato neutro, com conversão do formato
  Anthropic na leitura (conversas antigas continuam abrindo).

### F3. Controle de custo

- Medição (decisão 6), orçamento e alerta (decisão 7), limite de taxa.
- Visão geral do superadmin ganha "custo de IA do mês" e "top 10 clientes por
  custo", ao lado do faturamento — dá para comparar custo de IA × receita do
  cliente (margem).
- Opcional (Q7): owner/admin vê o consumo da própria organização em
  Configurações.

## 5. Fases e marcos

| Fase | Entrega | Arquivos principais |
|---|---|---|
| **A. Fundação** | Migration `0031` (tabelas, RLS, funções `admin_ia_*` de leitura, colunas em `billing_plans`; preços em reais, sem carga inicial); testes SQL | `0031_ia_por_organizacao.sql`, `tests/ia.sql` |
| **B. Camada de IA** | `_shared/ai.ts` (interface, resolução da credencial, orçamento, limite de taxa, medição), `_shared/ai-crypto.ts`, adaptadores `openai_compat` e `anthropic`; `deno test` dos adaptadores com `fetch` simulado; passo novo no `ci.yml` | `functions/_shared/`, `.github/workflows/ci.yml` |
| **B2. Avaliação de fornecedores** (roda depois da fase C) | Script que roda as 13 funções com dados fictícios (seed local) em OpenAI, Gemini e Anthropic e gera tabela de qualidade, JSON inválido, latência e custo medido. Decide o fornecedor e os modelos padrão por nível. **Precisa das chaves de teste do usuário** | `supabase/tools/avaliar-ia/` |
| **C. Migração das funções** | Em 4 lotes, do mais simples ao mais delicado: (1) texto/JSON — `sponsor-executive-summary`, `generate-sellout-report`, `detect-churn-risk`, `ticket-benchmark-ai`, `prepare-meeting-ai`, `task-insights`; (2) tool forçada — `score-leads`, `generate-proposal-ai`, `generate-proposal-wizard`, `suggest-next-steps`, `summarize-contract`; (3) `ai-assistant` (loop + histórico neutro); (4) `brandtrack-detect-image` (visão). Correção da organização em cada uma | 13 funções, chamadas no portal |
| **D. `admin-ai`** | Edge Function administrativa: chave padrão, chave por cliente, teste de conexão, revogação, orçamento, preços; auditoria | `functions/admin-ai/`, compose e `.env.example` (variável `AI_KEYS_MASTER_KEY`) |
| **E. Tela `/admin/ia`** | F1 completa, item no menu do admin | `portal/src/pages/admin/AdminAi*.tsx`, hook `useAdminAi.ts` |
| **F. Controles** | Alertas de 80%/100% (notificação + e-mail via `_shared/email.ts`), card de custo na visão geral, opcional: consumo em Configurações | `check-notifications` ou função nova, `AdminOverview.tsx` |
| **G. Documentação** | ADR da IA, próximo número livre (substitui ADR-0003), `SECURITY.md`, `.claude/rules/security.md` e `supabase.md` (padrão novo), `CLAUDE.md` §3, runbook `docs/runbooks/ia.md` (gerar chave mestra, cadastrar chave padrão, criar Project na OpenAI por cliente, rotação), `MIGRATION_NOTES.md` | docs |

- **Marco 1 — IA volta a funcionar** (A + B + B2 + C + chave padrão via
  variável de ambiente como semente): todos os clientes no fornecedor padrão
  escolhido na avaliação, com uso medido desde o primeiro dia.
- **Marco 2 — chave por cliente** (D + E): o pedido completo.
- **Marco 3 — controle de custo** (F + G).

## 6. Validação prevista

- `npm run lint`, `type-check`, `test`, `build`; `deno test` da camada de IA.
- `npm run supabase:test` com `tests/ia.sql`: `authenticated` não lê
  `ai_credentials` (nem a cifra, nem de outra organização); owner não lê uso
  de outra organização; funções `admin_ia_*` recusam não-superadmin e `anon`;
  auditoria gravada; orçamento esgotado bloqueia.
- Ciclo limpo num projeto Compose isolado (reset, up, migrate 2x, seed, test).
- Chamada real a cada fornecedor **com chaves de teste fornecidas pelo
  usuário**: as 13 funções em OpenAI, Gemini e Anthropic, conferindo tool
  forçada, JSON e visão (é a própria fase B2). Sem as chaves, só a parte simulada — e isso será dito.
- Navegação logada como superadmin (`/admin/ia`) e como owner comum.

## 7. Decisões

### 7.1 Tomadas em 2026-10-20

- **Q1 / Q6** — fornecedores da versão atual: **OpenAI, Google Gemini e
  Anthropic**. DeepSeek, Maritaca, Mistral e Groq/Together ficam para versões
  futuras (§2.1). Os termos de uso e a política de privacidade devem listar os
  fornecedores que recebem dados dos clientes (avaliar com o jurídico).
- **Q3** — chave exclusiva falhou: **erro**, com a mensagem *"Não foi possível
  usar a IA da sua organização no momento. Entre em contato com o suporte."*
  e alerta ao superadmin (§3, decisão 3).
- **Q4** — funcionalidade que o fornecedor do cliente não suporta (visão):
  **usa a chave padrão**, custo atribuído ao cliente e sinalizado na tela.
- **Q5** — orçamento em **R$ estimado**; em 100%, **corte** na chave padrão e
  **só alerta** na chave exclusiva.

- **Q2** — chave padrão **no banco, editável pela tela** (cifrada e
  auditada); variável de ambiente só como semente na primeira subida.
- **Q7** — owner/admin do cliente **vê o consumo** da própria organização
  (fase F).
- **Q8** — **sem BYOK self-service** por agora: só o superadmin cadastra
  chave; o desenho permite abrir depois.
- **Q9** — colunas de IA em `billing_plans` **prontas agora**; monetização
  (cota por plano, créditos, excedente) numa tarefa própria.

### 7.2 Em aberto

Nenhuma.

## 8. Fora do escopo

- Fornecedores além de OpenAI, Gemini e Anthropic (DeepSeek, Maritaca,
  Mistral, Groq/Together) — §2.1.
- Gemini pelo Vertex AI na região de São Paulo (autenticação por conta de
  serviço).
- Gateway de IA (LiteLLM/OpenRouter) — a camada já fica pronta para ele.
- Venda de créditos de IA avulsos e cobrança de excedente no Stripe.
- BYOK self-service pelo cliente.
- Conversão em massa do histórico antigo de `ai_messages` (a leitura converte).
- Streaming de resposta no assistente.
