# Testes

Toda alteração deve considerar seu impacto nos testes existentes.

## Unitários (Vitest + Testing Library)

Utilizar para:

- regras de negócio (`portal/src/lib/*.ts` — cálculo de parcelas, validação de CNPJ,
  templates de cláusula, etc.);
- hooks (`portal/src/hooks/*`);
- transformações e formatações;
- validações de formulário (schemas zod).

Não acessam rede: faça mock de `@/integrations/supabase/client` e de
qualquer chamada a Edge Function.

## E2E (Playwright)

Utilizar para os fluxos críticos do produto:

- login e recuperação de senha;
- onboarding/criação de organização;
- pipeline comercial (criar oportunidade, mover estágio, gerar proposta);
- fechamento de contrato e geração de parcelas/entregas;
- acesso ao portal do patrocinador;
- media kit público (`/p/:slug`) e envio de lead.

Os testes E2E usam o Supabase **local** (`docker/supabase`), nunca dados de
produção, e devem instanciar/limpar os dados que criam. Hoje existe apenas 1
spec de e2e — expandir a cobertura é bem-vindo, mas priorize os fluxos acima
antes de casos de borda.

## Regra

Não alterar um teste apenas para fazer o CI passar.

Se o comportamento esperado mudou de propósito:

1. altere a implementação;
2. altere o teste;
3. explique a mudança no commit/PR.

Se um teste falhar inesperadamente:

1. investigue a causa antes de tocar no teste;
2. não remova o teste;
3. não reduza a cobertura apenas para obter sucesso no CI.

## Validação mínima antes de finalizar uma tarefa

```bash
npm run lint
npm run type-check
npm test
npm run build
```

Execute `npm run test:e2e` quando a alteração tocar um fluxo crítico coberto
por e2e. Execute `npm run supabase:test` quando a alteração tocar RLS ou
policies.
