# ADR-0003: IA via Anthropic API

Status: Accepted

## Contexto

O BrandPlay tem várias funcionalidades de IA implementadas como Edge
Functions: `ai-assistant`, `score-leads`, `generate-proposal-ai`,
`generate-proposal-wizard`, `prepare-meeting-ai`, `sponsor-executive-summary`,
`suggest-next-steps`, `summarize-contract`, `task-insights`,
`ticket-benchmark-ai`, `generate-sellout-report`, `brandtrack-detect-image`,
entre outras. Todas foram implementadas originalmente contra o gateway de IA
proprietário do Lovable Cloud, autenticado por `LOVABLE_API_KEY`.

Como o projeto está saindo do Lovable Cloud por completo (ADR-0001), esse
gateway deixa de existir como opção — não é possível manter essas funções
apontando para ele depois da migração de infraestrutura.

## Decisão

Migrar as Edge Functions de IA do gateway do Lovable para a **Anthropic API**
diretamente, autenticadas por `ANTHROPIC_API_KEY`.

Essa migração é conduzida como uma frente de trabalho própria (em paralelo à
reconstrução do schema e à criação da stack Docker), tocando exclusivamente
os arquivos em `supabase/functions/`. Este documento registra a decisão; os
detalhes de implementação (mapeamento de modelo, formato de prompt, tratamento
de streaming quando aplicável) ficam no código de cada função e, se
necessário, em uma ADR de acompanhamento.

`ANTHROPIC_API_KEY` segue a mesma regra de qualquer credencial privilegiada do
projeto: existe apenas no ambiente das Edge Functions, nunca no client, nunca
com prefixo `VITE_` (ver `SECURITY.md` e `.claude/rules/security.md`).

## Consequências

Positivas:

- Elimina a dependência do gateway proprietário do Lovable, removida junto
  com o restante da plataforma.
- Acesso direto aos modelos e recursos da Anthropic (incluindo os mais
  recentes), sem intermediário controlando disponibilidade ou custo.
- Consistente com a stack de IA já usada nas ferramentas de desenvolvimento
  deste projeto.

Negativas / pontos de atenção:

- Cada Edge Function precisa ser revisada individualmente: formato de request/
  response, tratamento de erro e eventual streaming não são idênticos entre o
  gateway antigo e a Anthropic API — não é um simples "trocar a URL e a
  chave".
- Durante a transição, é possível que nem todas as Edge Functions de IA
  tenham sido convertidas ainda. Antes de assumir que uma função já usa
  `ANTHROPIC_API_KEY`, confira o arquivo correspondente em
  `supabase/functions/`.
- Custos de uso de IA passam a ser cobrados diretamente pela Anthropic, sem o
  possível subsídio/agregação que o gateway do Lovable oferecia.

## Relacionadas

- ADR-0001 (sair do Lovable Cloud)
- `.claude/rules/security.md`
- `SECURITY.md`
