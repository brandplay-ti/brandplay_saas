# Avaliação de fornecedores de IA (IA-22)

Script operacional para medir **conectividade**, latência do teste mínimo e
(opcionalmente) amostras das Edge Functions de IA no stack **local** com seed.

## Pré-requisitos

- Stack local: `npm run supabase:up`, `npm run supabase:migrate`, `npm run supabase:seed`
- Portal opcional (só para E2E); este script fala direto com Auth + Functions
- Variáveis lidas de `docker/supabase/.env` quando existir, ou do ambiente:

| Variável | Uso |
|----------|-----|
| `API_EXTERNAL_URL` ou `SUPABASE_URL` | Base da API (ex.: `http://localhost:8010`) |
| `ANON_KEY` | Login |
| `AVALIAR_IA_GEMINI_KEY` | Chave Gemini (ou `AI_DEFAULT_API_KEY` se `AI_DEFAULT_PROVIDER=gemini`) |
| `AVALIAR_IA_OPENAI_KEY` | OpenAI (opcional) |
| `AVALIAR_IA_ANTHROPIC_KEY` | Anthropic (opcional) |

Credenciais de login (seed):

- Superadmin: `superadmin@brandplay.local` / `brandplay-dev`
- Owner: `owner@brandplay.local` / `brandplay-dev`

## Uso

```bash
node supabase/tools/avaliar-ia/rodar.mjs
node supabase/tools/avaliar-ia/rodar.mjs --funcoes   # inclui smoke de funções de IA
```

O relatório Markdown sai em `saida/relatorio-<timestamp>.md` (pasta gitignored).

## O que não faz

- Não grava chaves no repositório
- Não substitui revisão humana da qualidade em português (amostra do backlog)
- Não roda em homologação/produção sem autorização explícita
