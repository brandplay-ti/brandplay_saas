# Migração: Lovable AI Gateway → Anthropic API direta

Este documento registra a migração das Edge Functions que chamavam o gateway de IA
proprietário do Lovable (`https://ai.gateway.lovable.dev/v1/chat/completions`, formato
OpenAI chat-completions) para chamar a **API da Anthropic diretamente**
(`https://api.anthropic.com/v1/messages`), e a migração do envio de e-mail (Resend) que
passava pelo proxy `connector-gateway.lovable.dev`.

Todas as chamadas usam:
- `x-api-key: ANTHROPIC_API_KEY` + `anthropic-version: 2023-06-01`
- Sistema movido para o campo `system` de nível superior (não mais `role: "system"` em `messages`)
- Tools no formato `{name, description, input_schema}` (sem o wrapper `{type:"function", function:{...}}`)
- `tool_choice` forçado: `{type: "tool", name: "..."}` (sem `{type:"function", function:{name}}`)
- Resposta lida de `data.content` (array de blocos), nunca `choices[0].message`

A variável de ambiente `ANTHROPIC_API_KEY` precisa ser configurada no Supabase
self-hosted; `LOVABLE_API_KEY` não é mais necessária em nenhuma das 15 funções listadas
abaixo (confirmado via `grep -ri "lovable" supabase/functions/` — nenhuma ocorrência).

> **Depois (épico 3 do plano de IA por cliente):** as 13 funções de IA deixaram de
> chamar a Anthropic direto. Todas passam pela camada `_shared/ai/` (`gerar`), que
> escolhe a credencial da organização (OpenAI, Gemini ou Anthropic), aplica as
> guardas e mede o uso. `ANTHROPIC_API_KEY` não é mais lida por nenhuma função; a
> chave do ambiente é a semente `AI_DEFAULT_PROVIDER` + `AI_DEFAULT_API_KEY`. As
> seções abaixo desta nota descrevem a migração anterior (Lovable → Anthropic) e
> ficam como histórico. O estado atual está em
> [Camada de IA multi-fornecedor](#camada-de-ia-multi-fornecedor).

## Funções migradas e modelo escolhido

| Função | Modelo | Por quê |
|---|---|---|
| `ai-assistant` | `claude-sonnet-5` | Assistente principal do CRM, uso mais frequente, precisa de boa qualidade de raciocínio para orquestrar 9 tools em loop multi-turno. |
| `brandtrack-detect-image` | `claude-sonnet-5` | Visão computacional (detecção de marcas em imagem/frame) com tool forçada — tarefa que exige boa capacidade de análise visual. |
| `generate-proposal-ai` | `claude-sonnet-5` | Geração de proposta comercial estruturada (texto + itens) via tool forçada. |
| `generate-proposal-wizard` | `claude-sonnet-5` | Geração de proposta multi-canal completa (conceito, ativações, deck, e-mail, whatsapp) — saída rica, mantido o "raciocínio" de nível mais alto usado antes (`gemini-2.5-pro`). |
| `summarize-contract` | `claude-sonnet-5` | Resumo jurídico-comercial e chat sobre contrato — tarefa de compreensão de texto longo. |
| `suggest-next-steps` | `claude-sonnet-5` | Geração de próximos passos acionáveis via tool forçada, para 6 contextos diferentes (oportunidade/patrocinador/contrato/dashboard/entrega/proposta). |
| `prepare-meeting-ai` | `claude-sonnet-5` | Preparação de reunião com JSON estruturado complexo (agenda, riscos, perguntas etc). |
| `sponsor-executive-summary` | `claude-sonnet-5` | Resumo executivo curto, mas usado por decisores (C-level) — mantida qualidade mais alta. |
| `ticket-benchmark-ai` | `claude-sonnet-5` | Estimativa de benchmark de mercado (números realistas) — tarefa que se beneficia de melhor "conhecimento" do modelo. |
| `task-insights` | `claude-sonnet-5` | Copiloto de tarefa com JSON estruturado rico (passos, argumentos, riscos, mensagem sugerida). |
| `score-leads` | `claude-haiku-4-5-20251001` | Scoring de leads é uma tarefa de classificação relativamente simples e de alto volume (a função original já usava o modelo mais barato/rápido disponível, `gemini-2.5-flash`, para essa mesma finalidade). |
| `detect-churn-risk` | `claude-haiku-4-5-20251001` | Geração de 1 recomendação curta (≤15 palavras) por contrato — tarefa simples; a função original já usava explicitamente o modelo "lite" (`gemini-2.5-flash-lite`). |
| `generate-sellout-report` | `claude-sonnet-5` | Relatório executivo em markdown (300-500 palavras) — geração de texto longo e coeso. |

Observação: as funções `prepare-meeting-ai` e `task-insights` usavam `google/gemini-3.5-flash`
no código original (aparentemente um nome de modelo específico do gateway Lovable, não um
modelo "lite"/"flash-lite" explícito de baixo custo); por isso foram tratadas como tarefas
"normais" e migradas para `claude-sonnet-5`, não para o Haiku.

## Migrações não relacionadas a IA

- **`manage-team-access/index.ts`**: a função `sendEmail` chamava
  `https://connector-gateway.lovable.dev/resend/emails` autenticando com
  `Authorization: Bearer ${LOVABLE_API_KEY}` e repassando a chave real do Resend no header
  `X-Connection-Api-Key`. Foi reescrita para chamar `https://api.resend.com/emails`
  diretamente com `Authorization: Bearer ${RESEND_API_KEY}` (mesmo padrão já usado em
  `check-notifications/index.ts` e em `manage-portal-access/index.ts`). A constante
  `LOVABLE_API_KEY` foi removida do arquivo; a função não depende mais dela.
- **`manage-portal-access/index.ts`**: a função `safePortalUrl` tinha uma allowlist de
  domínio que aceitava hosts terminados em `.lovable.app`, `.lovableproject.com` e
  `.lovable.dev`, além do host de `PORTAL_URL_ENV` (variável `PORTAL_URL`) ou do
  `Origin` da requisição. As três entradas específicas do Lovable foram removidas; a
  allowlist agora aceita apenas: (1) o host de `PORTAL_URL_ENV`, (2) o host do `Origin`
  da requisição, e (3) `localhost`/`127.0.0.1` para desenvolvimento local (nesse caso o
  requisito de `protocol === "https:"` é dispensado, já que dev local normalmente usa
  `http://localhost:...`). O nome da variável de ambiente foi mantido como `PORTAL_URL`
  (não `APP_URL`) porque é um valor conceitualmente diferente: `APP_URL` (usado em
  `check-notifications/index.ts`) aponta para o app principal, enquanto `PORTAL_URL` é
  especificamente a URL do Portal do Patrocinador — variável dedicada já existente no
  projeto antes desta migração. `sendEmail` nessa função já chamava a API do Resend
  diretamente (não usava o proxy do Lovable) e não precisou de alteração.
- **Depois (ADR-0008, fase F):** as três funções deixaram de chamar o Resend
  direto. O envio passou para `_shared/email.ts` (`sendEmail`, com adaptador
  Resend, remetente de `EMAIL_FROM`/`RESEND_FROM_DOMAIN` e base dos links de
  `APP_URL`) — operação em `docs/runbooks/email.md`.

## Suposições sobre formato de resposta / JSON

- **`extractJson` duplicado por arquivo**: não existe uma pasta `_shared/` com utilitários
  reaproveitáveis entre Edge Functions neste projeto (`supabase/functions/_shared/`
  contém apenas `logo.ts`, não relacionado). A função utilitária `extractJson(text)`
  (que remove eventuais fences ```` ```json ... ``` ```` antes do `JSON.parse`) foi
  duplicada nos arquivos que precisam de JSON "livre" sem tool forçada:
  `detect-churn-risk`, `prepare-meeting-ai`, `ticket-benchmark-ai`, `task-insights`.
- **Funções que já usavam `response_format: {type:"json_object"}` ou
  `{type:"json_schema", ...}`** (`detect-churn-risk`, `prepare-meeting-ai`,
  `task-insights`) não têm equivalente direto na API da Anthropic usada via HTTP puro
  (sem a beta de "structured outputs" / `output_config.format`, que não fazia parte do
  escopo pedido). A solução aplicada foi: manter/reforçar a instrução explícita no
  `system` pedindo "responda APENAS com um objeto JSON válido, sem markdown, sem crases"
  — em `prepare-meeting-ai` e `task-insights` o próprio JSON Schema (`schema`) foi
  embutido no texto do `system` para orientar o formato exato — e fazer o parse do texto
  retornado com `extractJson` + `try/catch`. Isso é funcionalmente equivalente ao pedido,
  mas não tem a mesma garantia "hard" de schema que o `strict: true` do
  `json_schema` do gateway antigo; validar em produção se a taxa de JSON malformado é
  aceitável.
- **`brandtrack-detect-image`**: as imagens eram enviadas como
  `{type:"image_url", image_url:{url: dataUrl}}` (data URLs em base64) no formato
  OpenAI. Foram convertidas para blocos `{type:"image", source:{type:"base64",
  media_type, data}}` do formato Anthropic — foi adicionada uma função utilitária
  `dataUrlToBase64Source` que separa o `data:<mime>;base64,<payload>` em `media_type` e
  `data` (o payload puro, sem o prefixo `data:...;base64,`).
- **`ai-assistant`** (loop multi-turno com tools): o histórico de mensagens é persistido
  na tabela `ai_messages` com as colunas já existentes (`role`, `content`, `tool_calls`,
  `tool_call_id`, `tool_name`) — nenhuma migração de schema foi feita (fora do escopo).
  Para caber no formato Anthropic dentro dessas colunas:
  - Ao salvar uma resposta do assistente que fez tool calls, a coluna `tool_calls` agora
    guarda o array bruto de blocos de conteúdo retornado pela Anthropic (`data.content`,
    incluindo blocos `text` e `tool_use`), em vez do array `tool_calls` no formato OpenAI.
  - Ao reconstruir o histórico para uma nova chamada, cada linha `role: "tool"` (resultado
    de execução, uma por chamada de ferramenta) é agrupada com as linhas `tool` adjacentes
    em uma única mensagem `{role:"user", content:[{type:"tool_result", tool_use_id,
    content}, ...]}`, conforme exigido/recomendado pela Anthropic para tool calls
    paralelas.
  - **Gap conhecido**: conversas antigas cujas linhas de `ai_messages.tool_calls` foram
    gravadas no formato OpenAI (antes desta migração) não serão reconstruídas
    corretamente pelo novo código (o array não terá blocos `type: "tool_use"`/`text`
    válidos no formato Anthropic). Isso só afeta o *histórico* de conversas iniciadas
    antes do deploy desta migração; novas mensagens funcionam normalmente. Se for
    necessário preservar essas conversas antigas, será preciso um script de
    backfill/conversão fora do escopo desta tarefa.
  - O modelo usado no loop era `google/gemini-2.5-flash`; foi migrado para
    `claude-sonnet-5` (não Haiku), pois é a função de uso mais intenso e crítico
    (orquestra 9 ferramentas e decide ações que gravam dados).

## Pontos sem equivalência 100% direta (limitações conhecidas)

- **Tratamento de erro HTTP 402 ("créditos esgotados")**: o gateway do Lovable retornava
  `402` quando os créditos do workspace acabavam. A API da Anthropic não tem esse
  conceito/código — cobra diretamente por token da chave configurada. O código de
  tratamento de `status === 402` foi **mantido** em todas as funções (para não remover
  lógica de tratamento de erro existente e por segurança caso algum proxy/gateway futuro
  reintroduza esse código), mas na prática ele deve se tornar código morto contra a API
  da Anthropic direta — o cenário real de "sem crédito"/limite de billing da Anthropic
  tende a vir como `400`/`401` com uma mensagem de erro no corpo
  (`{type:"error", error:{type, message}}`), não como `402`. Não foi adicionado
  tratamento específico para esse caso porque não fazia parte do comportamento original
  a ser preservado; considerar revisitar isso com testes reais contra a chave de produção.
  **Atualização (2026-10-07):** os ramos de `402` foram removidos das 11 funções. Eram
  código morto contra a Anthropic, e as mensagens mandavam o usuário à tela de créditos
  do workspace do Lovable, que não existe neste produto. Falta de saldo continua caindo
  no erro genérico de cada função, como já caía.
- **`response_format`/`json_schema` com `strict: true`**: ver seção acima — trocado por
  instrução no prompt + parse defensivo, sem garantia "hard" de schema.
- **Forçar uma única tool (`tool_choice`)**: mapeado 1:1 para
  `{type:"tool", name:"..."}`, sem perda de funcionalidade.

## Camada de IA multi-fornecedor

Plano em `docs/architecture/plano-ia-por-cliente.md`, histórias em
`docs/architecture/backlog-ia-por-cliente.md` (épico 3, IA-14 a IA-21).

Toda função de IA segue o mesmo roteiro, com o apoio de `_shared/ai/funcao.ts`:

1. `autenticar`: usuário do JWT e client com o JWT dele (consultas sob RLS);
2. organização: a do recurso lido sob RLS (patrocinador, oportunidade,
   contrato, conversa, mídia) ou, nas funções que trabalham sobre listas, a
   organização ativa enviada pelo portal (`organization_id`);
3. `exigirModulo`: membro ativo da organização e com acesso ao módulo — vale
   também quando a organização veio do recurso (usuário do portal do
   patrocinador lê o próprio patrocinador pelo RLS, mas não usa a IA interna);
4. todas as consultas filtram por essa organização;
5. `gerar` com o **nível** (`rapido`, `padrao`, `visao`) — nunca um nome de
   modelo; saída estruturada pelo modo `json` da camada, com esquema;
6. `respostaDeFalha`: erro de IA vira `{ error, codigo }` (o portal trata com
   `portal/src/lib/erroDeIA.ts`); falha inesperada vira 500 sem detalhe, e o
   log nunca leva prompt, resposta ou chave.

| Função | Nível | Organização | Módulo |
|---|---|---|---|
| `sponsor-executive-summary` | padrao | do patrocinador | crm |
| `generate-sellout-report` | padrao | da propriedade | crm |
| `detect-churn-risk` | rapido | ativa do portal | crm |
| `ticket-benchmark-ai` | padrao | ativa do portal | crm |
| `prepare-meeting-ai` | padrao | do patrocinador | crm |
| `task-insights` | padrao | da tarefa / item | crm ou operacional |
| `score-leads` | rapido | ativa do portal | crm (escrita) |
| `generate-proposal-ai` | padrao | ativa do portal | crm |
| `generate-proposal-wizard` | padrao | ativa do portal | crm |

### Lote 2 (IA-17, IA-18)

- **`score-leads`**: lia patrocinadores, oportunidades, propriedades e o
  histórico de propostas de **todas** as organizações do usuário e gravava
  `lead_scores` sem `organization_id` (o gatilho preenchia com `get_user_org`,
  a organização mais antiga). Agora recebe a organização ativa, filtra tudo por
  ela e grava `organization_id` explícito. Exige escrita no CRM antes da
  chamada, porque o resultado só vale gravado. Só aceita na resposta os alvos
  que foram no prompt (id inventado não vira linha); nota limitada a 0–100 e
  classificação recalculada pela nota quando vem fora da lista. `maxTokens`
  subiu de 4.096 para 16.000: até 200 leads com razões e argumento não cabiam.
  Gravação que falha volta `saved: false` e a tela avisa.
- **`generate-proposal-ai`** e **`generate-proposal-wizard`**: a proposta é
  gravada pela tela na organização ativa, então é ela que a função recebe e
  valida. Patrocinador e propriedade escolhidos precisam ser dessa organização
  (senão 404); cotas, alocações e ativos do contexto também. Antes, os ativos
  vinham de todas as organizações do usuário. A ferramenta obrigatória virou o
  modo `json` da camada, e a resposta volta normalizada (itens com nome,
  quantidade ≥ 1 e valor ≥ 0; campos de texto sempre string), porque a tela
  soma os itens e lê cada campo.
