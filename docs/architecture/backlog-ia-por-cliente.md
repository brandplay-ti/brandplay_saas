# Backlog: IA com chave padrão e chave por cliente

- **Data**: 2026-10-20
- **Origem**: `docs/architecture/plano-ia-por-cliente.md` (aprovado em
  2026-10-20). Seções citadas como "plano §N".
- **Fornecedores da versão**: OpenAI, Google Gemini, Anthropic.

## Convenções

- **ID**: `IA-NN`. **Tamanho** (estimativa, não compromisso): P ≤ 1 dia,
  M = 2–3 dias, G = 4–5 dias.
- **Branch** por épico, a partir de `dev`: `feature/ia-<epico>` (ex.:
  `feature/ia-fundacao`). PR para `dev`, promoção normal `dev → hml → main`.
- **Definition of Done comum** a toda história (CLAUDE.md §11): lint,
  type-check, `npm test`, build; `npm run supabase:test` quando tocar banco;
  `deno test` quando tocar Edge Function; RLS e isolamento por organização
  avaliados; checklist de `.claude/rules/security.md`; nenhum segredo no
  diff; documentação atualizada quando o comportamento mudar.
- **Regra transversal**: nenhuma história grava ou loga chave de API, prompt
  ou resposta da IA. Só o final da chave (`key_hint`) aparece em tela e
  auditoria.

## Sequência por marco

| Marco | Histórias | Resultado |
|---|---|---|
| **1 — IA volta a funcionar** | IA-01 → IA-12 (fundação e camada), IA-13 → IA-21 (funções), IA-22 (avaliação), IA-34 (deploy do marco) | Todos os clientes usando a chave padrão (semente por variável de ambiente), em qualquer um dos 3 fornecedores, com uso medido |
| **2 — Chave por cliente** | IA-23 → IA-29 | Superadmin gerencia chave padrão e chaves exclusivas em `/admin/ia` |
| **3 — Controle de custo** | IA-30 → IA-33, IA-35 → IA-37 | Alertas, custo na visão geral, consumo para o cliente, documentação final |

Caminho crítico: IA-01 → IA-05 → IA-06/IA-07 → IA-09 → IA-13 → lotes de
funções → IA-22. As histórias de um mesmo lote de funções (IA-14 a IA-21) são
independentes entre si depois de IA-13 e podem andar em paralelo.

---

## Épico 1 — Fundação de dados (plano §3.2, fase A)

### IA-01 · Migration `0031_ia_por_organizacao.sql` — M

Tabelas `ai_credentials`, `ai_org_settings`, `ai_usage_events`,
`ai_model_prices` e colunas `ai_enabled` / `ai_monthly_budget_cents` em
`billing_plans`.

Critérios de aceite:
- `ai_credentials.provider` com `check` em `openai`/`gemini`/`anthropic`;
  índices únicos parciais: uma credencial `ativa` por organização e uma padrão
  (`organization_id is null`) `ativa`.
- RLS habilitada em todas. `ai_credentials`: **nenhuma** policy para
  `authenticated`/`anon`; escrita e leitura só `service_role`.
- `ai_org_settings` e `ai_usage_events`: leitura para
  `has_org_role(organization_id, ['owner','admin'])`; sem policy de escrita;
  `insert/update/delete` revogados de `authenticated`.
- `ai_usage_events` imutável (sem update/delete para ninguém além de
  `service_role`); índices por `(organization_id, created_at)` e
  `(organization_id, user_id, created_at)` para orçamento e limite de taxa.
- `ai_model_prices` em **reais** por 1M de tokens (o orçamento é em R$),
  **sem carga inicial**: os preços do plano §2.1 são de agregadores, não das
  páginas oficiais. Quem opera cadastra antes de ligar a IA (IA-34); modelo
  sem preço grava custo nulo e mantém os tokens.
- Padrão das tabelas: `created_at`/`updated_at`, gatilho de `updated_at`.
- Policy restritiva `billing_access_restrictive` aplicada ou tabela listada
  nas exceções do teste `(m)` de `supabase/tests/cobranca.sql`, com motivo.
- Migration idempotente (CI roda duas vezes) e sem marcador destrutivo.

Dependências: nenhuma.

### IA-02 · Funções SQL de leitura e de guarda — M

- `admin_ia_clientes()` e `admin_ia_cliente_detalhe(_org_id)`: começam com
  `platform_admin_require()`; devolvem metadados da credencial (fornecedor,
  modelos, `key_hint`, status, último erro — **nunca** a cifra), configuração,
  consumo do mês e % do orçamento.
- `admin_ia_consumo(_meses)`: custo por mês e top 10 organizações.
- `ia_consumo_organizacao(_org_id)`: resumo do mês para owner/admin da
  própria organização (Q7).
- `admin_ia_padrao()` (metadados da chave padrão) e `admin_ia_precos()`
  (tabela de preços), para as telas de IA-26 e IA-28.
- Internas, só service role: `ia_parametros(_org_id)` (parâmetros efetivos e
  gasto do mês) e `ia_consumo_detalhado(_org_id)` (por funcionalidade e por
  dia), compartilhadas pelas demais.
- `ia_situacao(_org_id, _user_id)`: usada pelo servidor antes de cada chamada
  — IA habilitada, cobrança liberada, gasto do mês × orçamento (orçamento da
  organização, senão o do plano em `billing_plans`), requisições no último
  minuto. Só `service_role`.
- Todas `SECURITY DEFINER` com `revoke all ... from public, anon, authenticated`
  e grant só a quem precisa.

Dependências: IA-01.

### IA-03 · Testes SQL `supabase/tests/ia.sql` — M

Critérios: `authenticated` não lê `ai_credentials` (nem de outra
organização); owner não lê uso nem configuração de outra organização;
membro sem papel owner/admin não lê uso; `admin_ia_*` recusam não-superadmin
e `anon`; `ia_situacao` não executável por `authenticated`; índice único
impede duas credenciais ativas; `ai_usage_events` imutável. Incluído em
`npm run supabase:test` e no job `migrations` do CI.

Dependências: IA-01, IA-02.

---

## Épico 2 — Camada de IA (plano §3, §3.1, fase B)

### IA-04 · Chave mestra e cifra (`_shared/ai-crypto.ts`) — P

- AES-GCM via Web Crypto; IV aleatório por gravação; `key_version` para
  rotação (aceita decifrar versões anteriores listadas em ambiente).
- A cifra leva como dado autenticado (AAD) o dono da chave — organização ou
  `padrao`: uma linha copiada para outra organização no banco não decifra.
- Variável `AI_KEYS_MASTER_KEY` no compose e no `.env.example` (sem valor);
  `npm run supabase:chaves` passa a gerar uma para o ambiente local.
- Teste: cifra/decifra; IV diferente a cada gravação; chave mestra errada
  falha de forma explícita.

Dependências: nenhuma.

### IA-05 · Interface neutra e categorias de erro (`_shared/ai/`) — M

- Tipos: `nivel` (`rapido`/`padrao`/`visao`), mensagens, tools, tool
  obrigatória, imagens (data URL), `json` com schema, resultado
  `{ texto, chamadasDeTool, uso }`.
- Categorias de erro: `chave_invalida`, `sem_saldo`, `limite_taxa`,
  `indisponivel`, `resposta_invalida`, mais os bloqueios internos
  `ia_desabilitada`, `orcamento_esgotado`, `cobranca_bloqueada`.
- Corpo de erro padronizado devolvido ao portal: `{ error: <mensagem>, codigo }`.
  `error` continua texto porque é o que as telas já leem (`data.error`); um
  objeto ali quebraria as telas durante a migração das funções.
- Módulos: `_shared/ai/tipos.ts` (pedido, mensagens, ferramentas, resposta,
  `validarPedido`) e `_shared/ai/erros.ts` (códigos, mensagens, status HTTP,
  classificação base por status). O teste confere os códigos contra os
  `check` da migration 0031.

Dependências: nenhuma.

### IA-06 · Adaptador `openai_compat` (OpenAI e Gemini) — G

Implementa a tabela do plano §3.1 para OpenAI e Gemini: autenticação,
`system`, tools, `tool_choice`, `response_format`, `image_url`,
`max_completion_tokens` × `max_tokens`, parâmetros recusados por modelo de
raciocínio, leitura de `usage` (inclusive tokens em cache), mapeamento de
erro (`insufficient_quota` → `sem_saldo`, etc.). URL base fixa por fornecedor.

Critérios: testes com `fetch` simulado para cada linha da tabela, nos dois
fornecedores.

Feito em `_shared/ai/openai.ts`. Decisões tomadas na implementação:
- saída JSON por `response_format: json_schema` **sem** `strict` (os esquemas
  das funções não seguem as regras do modo estrito) e reforço no `system`; a
  garantia vem do parse — o que não for objeto JSON é `resposta_invalida`;
- `uso.entrada` exclui a parte lida do cache (`prompt_tokens` da OpenAI
  inclui), para o custo usar o preço certo de cada parte;
- chamada de ferramenta é reconhecida pelas `tool_calls`, não só pelo
  `finish_reason` (o Gemini pode responder `stop` mesmo chamando);
- ferramenta obrigatória não chamada e argumentos que não são objeto JSON
  viram `resposta_invalida`.
A avaliação (IA-22) confirma com chamadas reais o `json_schema` e a
ferramenta obrigatória no endpoint compatível do Gemini.

Dependências: IA-05.

### IA-07 · Adaptador `anthropic` — M

Extraído do código atual (`x-api-key`, `system` de nível superior, blocos
`tool_use`, `dataUrlToBase64Source`). Pedido `json` vira tool obrigatória com
o schema. Uso inclui `cache_read_input_tokens`/`cache_creation_input_tokens`.
Erro 529 → `indisponivel`.

Critérios: testes com `fetch` simulado equivalentes aos de IA-06.

Feito em `_shared/ai/anthropic.ts`. Decisões tomadas na implementação:
- (revisto na IA-08) saída JSON por saída estruturada
  (`output_config.format`), não por ferramenta obrigatória: Claude Opus 5.5,
  Sonnet 5.5 e Fable 5.1 recusam `tool_choice` com nome (400);
- mensagens seguidas do mesmo papel (resultados de ferramenta e a próxima
  pergunta) vão juntas, porque a API exige papéis alternados; texto vazio do
  assistente não vira bloco;
- falta de crédito é reconhecida por `billing_error` ou pelo 400
  `invalid_request_error` que fala de "credit balance" — o único caso em que o
  texto da mensagem é examinado.

Dependências: IA-05.

### IA-08 · Modelos padrão por nível e matriz de capacidades — P

Tabela no código: fornecedor → modelos padrão de `rapido`/`padrao`/`visao` e
capacidades (visão, tool obrigatória, JSON). Valores iniciais provisórios;
os definitivos saem da avaliação (IA-22).

Feito em `_shared/ai/modelos.ts`. Padrões provisórios: OpenAI `gpt-5.4-mini`
nos três níveis; Gemini `gemini-3.5-flash-lite` / `gemini-3.6-flash`;
Anthropic `claude-haiku-5-5` / `claude-sonnet-5-5`. Descobertas que mudaram
os adaptadores:
- **Ferramenta obrigatória na Anthropic**: Opus 5.5, Sonnet 5.5 e Fable 5.1
  recusam `tool_choice` com nome. A matriz lista os modelos que sabidamente
  aceitam; nos demais, ferramenta única vira saída estruturada (volta como
  chamada `saida_estruturada`) e várias ferramentas vão `auto` com instrução.
  Saída estruturada exige `additionalProperties: false` e não aceita limites
  numéricos/de tamanho: o adaptador ajusta o esquema.
- **Raciocínio consome o limite de saída** nos três fornecedores: os
  adaptadores somam `FOLGA_DE_RACIOCINIO` (8.000, teto 32.000) ao
  `maxTokens` pedido. Só o gerado é cobrado.
- Esforço/raciocínio por nível (custo e latência) fica para a avaliação
  (IA-22): hoje os modelos rodam no esforço padrão de cada um.

Dependências: IA-05.

### IA-09 · Resolução da credencial — M

- Ordem: credencial exclusiva ativa da organização → credencial padrão ativa
  do banco → **semente** por variável de ambiente (`AI_DEFAULT_PROVIDER`,
  `AI_DEFAULT_API_KEY`), só enquanto não houver padrão no banco (Q2).
- Exceção Q4: se o modelo da credencial do cliente não tem a capacidade
  exigida, usa a padrão e marca o evento como `via_padrao`.
- Falha da credencial exclusiva (Q3): **não** cai na padrão; grava
  `last_error` na credencial e devolve
  *"Não foi possível usar a IA da sua organização no momento. Entre em
  contato com o suporte."*
- Nova tentativa só em `limite_taxa`/`indisponivel`, com a **mesma**
  credencial, no máximo 2 vezes com espera crescente.

Critérios: testes cobrindo as quatro rotas (exclusiva, padrão do banco,
semente, exceção de capacidade) e a garantia de nunca usar credencial de
outra organização.

Feito em `_shared/ai/credencial.ts` (`resolverCredencial`,
`chamarComCredencial`, `repositorioSupabase`). Decisões tomadas na
implementação:
- linha que não decifra (chave mestra errada, versão ausente, linha copiada
  de outra organização) vira `chave_invalida`: para o usuário é "contate o
  suporte", e o superadmin vê na credencial;
- modelos da semente podem vir de `AI_DEFAULT_MODEL_RAPIDO/PADRAO/VISAO`;
  vazios, os padrões de `modelos.ts`;
- a passagem da Q4 continua marcada `via_padrao` mesmo quando a padrão é a
  semente;
- sucesso numa credencial com falha registrada limpa `last_error`;
- `repositorioSupabase` (as consultas reais) não tem teste unitário: é
  exercitado na migração das funções e na avaliação (IA-22).

Dependências: IA-01, IA-04, IA-08.

### IA-10 · Guardas antes da chamada — M

Chama `ia_situacao` e bloqueia, nesta ordem: IA desabilitada, cobrança
bloqueada, orçamento esgotado (Q5: corte na chave padrão, só alerta na
exclusiva), limite de taxa por organização e por usuário (valores em
constante, revisáveis).

Feito em `_shared/ai/guardas.ts`. Decisões tomadas na implementação:
- limites iniciais: 60 chamadas/min por organização e 20 por usuário
  (contam só as que chegaram ao fornecedor);
- **falha fechada**: consulta que falha ou responde fora do formato barra a
  chamada (`indisponivel`) — sem saber o orçamento, não se gasta;
- quem não é membro ativo sobe como `AcessoNegadoAIA` (403), separado da
  falta de permissão na função (cliente sem service role), que é erro de
  configuração (`indisponivel`);
- `ErroDeIA` ganhou `origem` (`fornecedor`/`plataforma`): o limite interno
  usa o código `limite_taxa`, mas não é falha da credencial e não vai para
  `last_error`.
Exercitado contra o stack isolado: membro passa, não membro é recusado,
cliente com a chave anon falha fechado.

Dependências: IA-02, IA-09.

### IA-11 · Medição de uso — P

Todo resultado (sucesso ou erro) grava `ai_usage_events`: organização,
usuário, funcionalidade, fornecedor, modelo, credencial (`exclusiva`/`padrao`/
`via_padrao`/`semente`), tokens, custo estimado (`ai_model_prices`),
latência, categoria de erro. Falha ao gravar o evento não derruba a resposta,
mas é registrada no log.

Feito em `_shared/ai/medicao.ts` e `_shared/ai/camada.ts`. A IA-11 entregou
também a entrada única da camada, **`gerar(contexto, pedido, deps)`**, que as
funções vão usar no épico 3: valida → guardas → credencial → chamada →
registro. `dependenciasSupabase(admin)` monta as dependências reais.
Decisões tomadas na implementação:
- tentativa barrada pela guarda é registrada como `bloqueado` com a chave
  que seria usada (fornecedor e modelo são obrigatórios na tabela); sem
  nenhuma chave configurada, não há evento;
- acesso negado (não membro) e falha na escolha da chave não geram evento;
- custo pelo nome do modelo como está na credencial, o mesmo cadastrado em
  `ai_model_prices`; arredondado a 6 casas.
Exercitado contra o stack isolado com fornecedor falso: chave semente,
preço lido, evento gravado e já contado por `ia_situacao`.

Dependências: IA-01, IA-06/IA-07.

### IA-12 · `deno test` no CI — P

Passo novo no job `portal` (ou job próprio) do `.github/workflows/ci.yml`
rodando os testes de `supabase/functions/_shared/`. Bloqueante.

Feito no job próprio `funcoes` do `ci.yml` (paralelo a `portal` e
`migrations`, sem Node nem stack): `denoland/setup-deno@v2` com o Deno
fixado na `v2.1.4`, a mesma da imagem `denoland/deno` usada localmente, e
`deno test --allow-read supabase/functions/_shared/` (o `--allow-read` é do
teste que confere os códigos de erro contra a migration 0031). Comando local
pela imagem em `docs/infrastructure/cicd.md`.

Dependências: IA-04, IA-06, IA-07.

---

## Épico 3 — Migração das funções (plano §3 decisão 4, fase C)

Cada história: troca o `fetch` pela camada, declara funcionalidade e nível,
determina a organização (do recurso lido sob RLS, ou a organização ativa
enviada pelo portal **validada** com `is_org_member` + `can_access_module`),
filtra as consultas por ela e trata os erros pelo helper de IA-13. Teste
manual com a chave semente em cada um dos 3 fornecedores fica para IA-22.

### IA-13 · Tratamento de erro de IA no portal — P

Helper em `portal/src/lib/` que traduz `{ error, codigo }` em
toast padronizado (IA desabilitada, orçamento esgotado, contate o suporte,
limite de taxa). Teste unitário.

Feito em `portal/src/lib/erroDeIA.ts`: `avisarErroDeIA(error, data, titulo)`
lê o corpo da função (em `data` ou, fora de 2xx, em `error.context`, via
`readEdgeFunctionError`) e mostra o toast; `lerErroDeIA` e
`traduzirErroDeIA` devolvem a mensagem sem mostrar. Decisões:
- a descrição é o `error` da função (a mensagem ao usuário de `erros.ts`); o
  helper só escolhe o título por código e tem a mesma mensagem de reserva;
- sem `codigo` conhecido não é erro da camada (recurso não encontrado,
  validação): título da tela e o `error` da função;
- a mensagem técnica do `invoke` ("non-2xx status code") e a falha de rede
  não vão crus para a tela;
- o teste lê `_shared/ai/erros.ts` e falha se a lista de códigos divergir.

Dependências: IA-05.

### IA-14 · `sponsor-executive-summary` e `generate-sellout-report` — M

Organização do patrocinador / da propriedade ou evento. Componentes:
`ExecutiveSummaryAI.tsx`, `SelloutReportGenerator.tsx`.

Feito. A IA-14 criou o apoio comum das funções do épico, em
`_shared/ai/funcao.ts` (com teste): `autenticar` (usuário do JWT, client sob
RLS), `exigirModulo` (`is_org_member` + `can_access_module`),
`organizacaoDoCorpo`/`uuidDoCorpo`, `dependenciasDaCamada` (service role só
para a camada) e `respostaDeFalha` (`{ error, codigo }` para erro de IA;
falha inesperada vira 500 sem detalhe, e o log não leva conteúdo).
Decisões tomadas na implementação:
- mesmo com a organização vinda do recurso, a função passa por
  `exigirModulo` (módulo `crm`, leitura): usuário do portal do patrocinador,
  que lê o próprio patrocinador pelo RLS, não gera resumo interno;
- **mistura de organizações corrigida também aqui**: as entregas do resumo
  eram buscadas só pelo nome da marca, em todas as organizações do usuário;
  agora todas as consultas filtram pela organização do recurso;
- os caches (`sponsor_executive_summaries`, `sellout_reports`) passam a
  gravar `organization_id`. Antes o gatilho preenchia com `get_user_org`, que
  para quem está em várias organizações podia gravar o resumo na errada;
- o evento do relatório precisa ser da mesma propriedade (senão 404);
- relatório que não grava volta mesmo assim (`saved: false`), com aviso na
  tela: a chamada já foi feita e medida;
- `SelloutReportGenerator` lista propriedades e relatórios só da organização
  ativa (antes, de todas as organizações do usuário);
- modelo gravado no cache é o da resposta, não mais um nome fixo.

### IA-15 · `detect-churn-risk` e `ticket-benchmark-ai` — M

Passam a receber a organização ativa (`ChurnRiskWidget.tsx`,
`TicketBenchmarkWidget.tsx`), validam e filtram. `ticket-benchmark-ai` deixa
de usar `get_user_org`. Corrige a mistura de organizações (plano §1.2).

Feito. As duas recebem `organization_id` do corpo, validam com
`exigirModulo` (módulo `crm`, leitura) e filtram contratos, parcelas,
entregas, patrocinadores e os caches por ela; os widgets mandam o `orgId`
de `useOrganization` e limpam ou recarregam ao trocar de organização.
Decisões tomadas na implementação:
- **a IA é a parte opcional**: o risco e a média interna são calculados sem
  ela. Falha de IA (inclusive bloqueio por orçamento ou IA desativada) não
  derruba a resposta: volta `aviso_ia: { error, codigo }`, via `tentarIA`
  (`_shared/ai/funcao.ts`), e o portal avisa com `avisarIAParcial` (IA-13).
  Era o comportamento de antes, quando a chamada falhava em silêncio;
- no benchmark, que carrega ao abrir o dashboard, o aviso fica como nota no
  card e só vira toast na atualização manual;
- recomendação de churn no nível `rapido`, benchmark no `padrao`; os dois
  pelo modo JSON da camada, com esquema, no lugar do parse do texto;
- os caches (`contract_churn_risk`, `market_benchmarks`) gravam
  `organization_id` explícito, uma linha por vez, para que uma linha antiga
  gravada na organização errada pelo gatilho não derrube as outras.

### IA-16 · `prepare-meeting-ai` e `task-insights` — P

Já determinam a organização; JSON passa a usar o modo JSON da camada
(`MeetingPrepAI.tsx`, `TaskInsightsDialog.tsx`).

### IA-17 · `score-leads` — M

Recebe a organização ativa (`LeadScoring.tsx`), valida e filtra
patrocinadores, oportunidades, propriedades e histórico por ela. Corrige a
mistura de organizações. Nível `rapido`.

### IA-18 · `generate-proposal-ai` e `generate-proposal-wizard` — M

Tool obrigatória; organização da oportunidade/patrocinador
(`GenerateProposalAIDialog.tsx`, `ProposalWizardDialog.tsx`).

### IA-19 · `suggest-next-steps` e `summarize-contract` — M

Organização do registro de contexto (6 contextos) e do contrato
(`NextStepsAI.tsx`, `Pipeline.tsx`, `ContractAISummary.tsx`).

### IA-20 · `ai-assistant` e histórico neutro — G

Organização da `ai_conversations`. Loop de tools pela camada. `ai_messages`
passa a gravar em formato neutro; leitura converte o formato Anthropic
antigo (conversas antigas continuam abrindo). Teste do conversor.
Componente: `AIAssistantDrawer.tsx`.

### IA-21 · `brandtrack-detect-image` — M

Nível `visao`, imagens pela camada, exceção Q4 coberta. Componente:
`BrandTrackUploads.tsx`.

Dependências de IA-14 a IA-21: IA-09, IA-10, IA-11, IA-13.

### IA-22 · Avaliação dos fornecedores (fase B2) — G

Script em `supabase/tools/avaliar-ia/` que, no stack local com seed, roda as
13 funções com a chave semente de cada fornecedor e gera relatório:
qualidade em português (amostra revisada por pessoa), taxa de JSON/tool
inválido, latência e custo medido em `ai_usage_events`.

Critérios: relatório anexado ao PR; fornecedor padrão e modelos por nível
decididos e gravados em IA-08 e na ADR da IA (IA-35).

**Bloqueio**: precisa de chaves de teste de OpenAI, Gemini (plano pago) e
Anthropic fornecidas pelo usuário. Dependências: IA-14 a IA-21.

---

## Épico 4 — Administração da IA (plano §4 F1, fases D e E)

### IA-23 · Edge Function `admin-ai`: credenciais — G

JWT → superadmin ativo (`platform_admins`) → valida (zod/equivalente) → ação:
- `testar`: chamada mínima ao fornecedor com a chave informada, sem gravar;
- `definir_padrao` / `definir_cliente`: testa, cifra, grava (revoga a
  anterior), audita;
- `revogar_cliente`: volta para a padrão, audita.

Comentário obrigatório nas ações que alteram. Auditoria em
`platform_admin_audit_log` com `key_hint`, nunca a chave. A chave nunca volta
na resposta.

Dependências: IA-01, IA-04, IA-06, IA-07.

### IA-24 · `admin-ai`: configuração e preços — M

Ações `configurar_cliente` (IA habilitada, orçamento, % de alerta, corte) e
`definir_preco` (preço por modelo, com vigência). Auditadas.

Dependências: IA-23.

### IA-25 · Hook `useAdminAi` (react-query) — P

Leitura por `admin_ia_*`, escrita por `admin-ai`, invalidação de cache após
cada ação. Teste unitário com Supabase simulado.

Dependências: IA-02, IA-23.

### IA-26 · Tela `/admin/ia` — lista e chave padrão — M

Card da chave padrão (fornecedor, modelos por nível, `••••1234`, último
teste/erro, trocar com "Testar conexão"). Lista de organizações com modo,
fornecedor, modelo, status da última chamada, consumo do mês, orçamento e %
usado; filtros por modo, fornecedor e "acima de 80%". Item no menu do admin.

Dependências: IA-25.

### IA-27 · Tela `/admin/ia` — detalhe do cliente — M

Definir chave exclusiva (fornecedor + chave em campo de senha
`PasswordInput` + modelos, teste obrigatório), revogar, orçamento e corte,
habilitar/desabilitar, consumo por funcionalidade e por dia (30 dias),
eventos `via_padrao` sinalizados, aviso ao salvar credencial sem modelo de
visão. Comentário obrigatório nas ações.

Dependências: IA-24, IA-25.

### IA-28 · Tela de preços de modelos — P

Lista e edição de `ai_model_prices`.

Dependências: IA-24, IA-25.

### IA-29 · E2E da área `/admin/ia` — M

Playwright no Supabase local: superadmin vê a lista; owner comum não acessa
`/admin/ia`; chave inválida no "Testar conexão" mostra erro e não grava;
orçamento salvo aparece na lista.

Dependências: IA-26, IA-27.

---

## Épico 5 — Controle de custo (plano §4 F3, fase F)

### IA-30 · Alertas de orçamento — M

Ao cruzar o % de alerta e 100% no mês: notificação (`notifications`) para
owner/admin da organização e para os superadmins, e e-mail por
`_shared/email.ts`. Um alerta por limiar por mês (sem repetição).

Dependências: IA-11.

### IA-31 · Alerta de falha da chave exclusiva — P

Falha `chave_invalida`/`sem_saldo` numa credencial exclusiva notifica os
superadmins (Q3), no máximo uma vez por hora por credencial.

Dependências: IA-09.

### IA-32 · Custo de IA na visão geral do superadmin — P

`AdminOverview.tsx`: custo de IA do mês e top 10 organizações por custo, ao
lado do faturamento (margem por cliente).

Dependências: IA-02.

### IA-33 · Consumo para o cliente (Q7) — M

Owner/admin vê, nas configurações da organização, consumo do mês, orçamento
e % usado, por `ia_consumo_organizacao`. Sem fornecedor nem chave.

Dependências: IA-02.

---

## Épico 6 — Documentação, segurança e operação (fase G)

### IA-34 · Deploy do marco 1 — P

Runbook seguido: backup, migration `0031` à mão em homologação, variáveis
`AI_KEYS_MASTER_KEY` e semente (`AI_DEFAULT_*`) no Dockploy de homologação,
preços dos modelos em uso cadastrados em `ai_model_prices` (página oficial de
cada fornecedor, convertidos para reais), publicar, `npm run supabase:checar`,
testar as funções; depois produção.
Registro em `docs/runbooks/deployment.md`.

Dependências: IA-22. **Exige autorização explícita** para acessar
homologação/produção.

### IA-35 · ADR da IA e atualização das regras — M

ADR da IA — próximo número livre; a 0009 já é a de backup (`0009-backup-externo-com-restic.md`) — (IA multi-fornecedor com chave por organização; substitui a
ADR-0003), `SECURITY.md`, `.claude/rules/security.md` (superfície nova),
`.claude/rules/supabase.md` (padrão das tabelas de IA), `CLAUDE.md` §3
(integrações e variáveis), `supabase/functions/MIGRATION_NOTES.md`.

### IA-36 · Runbook `docs/runbooks/ia.md` — P

Gerar e guardar a chave mestra; rotação (`key_version`); cadastrar a chave
padrão; criar um *Project* da OpenAI por cliente com limite de gasto; usar o
plano pago do Gemini; o que fazer com cada alerta.

### IA-37 · Termos de uso e política de privacidade — fora do time de dev

Listar OpenAI, Google e Anthropic como fornecedores que podem receber dados
dos clientes; validação com o jurídico. Responsável: a definir pelo negócio.

---

## Riscos

- **Avaliação bloqueada sem chaves de teste** (IA-22): o marco 1 pode subir
  com o fornecedor semente escolhido pelo usuário, e a avaliação vem depois.
- **Preços de modelo desatualizados** distorcem o custo estimado: conferir na
  página oficial ao cadastrar e revisar mensalmente (runbook).
- **Perda da chave mestra** inutiliza todas as credenciais cifradas: o
  runbook precisa definir onde ela tem cópia segura, fora do servidor.
- **Diferença de qualidade entre fornecedores** nas saídas estruturadas
  (propostas, JSON): coberta pela avaliação e pela taxa de
  `resposta_invalida` em `ai_usage_events`.
