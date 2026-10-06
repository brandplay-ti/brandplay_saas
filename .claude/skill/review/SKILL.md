---
name: review
description: Realiza revisão técnica completa das alterações atuais do BrandPlay.
---

# Code Review

Analise as alterações atuais do projeto.

## 1. Git

Verifique:

- `git status`;
- `git diff`;
- arquivos adicionados, removidos e modificados;
- se o commit segue o padrão de `.claude/rules/git.md`.

## 2. Arquitetura

Verifique:

- duplicação de componente/hook/util já existente;
- acoplamento entre `pages`, `components`, `hooks` e `lib`;
- abstrações desnecessárias;
- violação da estrutura de pastas existente (`.claude/rules/architecture.md`);
- introdução de lib de state management sem justificativa, quando react-query
  já resolveria.

## 3. React

Verifique:

- estado (local vs. compartilhado, uso desnecessário de Context);
- hooks (dependências corretas em `useEffect`, hooks condicionais);
- renders desnecessários;
- acessibilidade (labels, teclado, semântica);
- tratamento de erro e loading state;
- uso de `any`/`@ts-ignore` não justificado.

## 4. Supabase

Verifique:

- RLS habilitada e policy explícita para toda tabela nova/alterada;
- qual padrão de policy foi seguido (`.claude/rules/supabase.md`) e se está
  correto para o caso;
- migrations: nova (não edição de migration aplicada), nome descritivo,
  reversível quando possível;
- autorização: `organization_id`/`user_id` nunca aceitos crus do client;
- exposição de dado de outra organização ou de outro patrocinador;
- uso de `service_role` restrito a Edge Functions.

## 5. Segurança

Procure:

- secrets ou tokens no diff;
- chave privilegiada (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  `RESEND_API_KEY`) fora de Edge Functions, ou com prefixo `VITE_`;
- autorização feita só no frontend;
- XSS (uso de `dangerouslySetInnerHTML`, saída de `react-markdown` sem
  sanitização — o projeto já usa `dompurify` para isso, confirme que segue
  sendo usado onde necessário);
- SQL injection (RPCs/queries montadas por concatenação de string em vez de
  parâmetro);
- validação de entrada insuficiente (zod ausente num formulário novo).

## 6. Testes

Verifique se existem testes unitários para a regra de negócio alterada, e se
um fluxo crítico tocado (login, pipeline, contrato, portal do patrocinador,
media kit público) tem ou precisa de cobertura E2E.

## 7. CI/CD

Se houver alteração em Docker, Edge Functions, migrations ou infraestrutura,
verifique impacto no processo de deploy descrito em `.claude/rules/cicd.md`.

## Resultado

Classifique os problemas encontrados:

```
CRITICAL
HIGH
MEDIUM
LOW
INFO
```

Não altere o código automaticamente durante o review.

Apresente:

### Findings

Lista dos problemas encontrados, com severidade.

### Positive points

Pontos positivos da implementação.

### Recommendation

Recomendação final (aprovar, aprovar com ressalvas, solicitar mudanças).

Se não houver problemas relevantes, declare explicitamente:

"Nenhum problema CRITICAL, HIGH ou MEDIUM encontrado."
