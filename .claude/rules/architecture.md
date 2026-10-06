# Arquitetura

## Objetivo

Manter a arquitetura simples, previsível e consistente com o que já existe em
`portal/src/`.

## Estrutura de pastas

Respeite a estrutura atual — não crie uma organização paralela:

```
portal/src/pages/          rotas (uma pasta por área: dashboard/, portal/, field/, onboarding/)
portal/src/components/ui/  shadcn/ui — não editar para necessidades de uma tela só;
                     compor por cima
portal/src/components/*/   componentes de feature (sponsors/, contracts/, pipeline/, ...)
portal/src/hooks/          hooks de domínio e integração (useAuth, useOrganization, ...)
portal/src/lib/            utilitários e helpers puros, sem estado de React
```

## Antes de criar

Antes de criar um componente, hook, util ou context novo, procure uma
implementação existente equivalente em `portal/src/components/`, `portal/src/hooks/` ou
`portal/src/lib/`. Não crie abstrações duplicadas.

## Camadas

- Componentes de UI não devem conter regra de negócio complexa nem acesso
  direto a tabelas sensíveis sem passar por um hook.
- O acesso ao Supabase deve passar por `portal/src/integrations/supabase/client.ts` —
  nunca instancie um client novo.
- Regra de negócio reutilizável (cálculo, validação, transformação) vai para
  `portal/src/lib/` ou para um hook em `portal/src/hooks/`, não duplicada em várias telas.

## Estado e busca de dados

O projeto já tem `@tanstack/react-query` instalado, mas a maior parte das
telas hoje busca dados via `useEffect` + `useState` direto contra o Supabase
(ex.: `useOrganization.tsx`, várias páginas em `portal/src/pages/dashboard/`). Isso é
dívida técnica **conhecida e aceita por ora** — não é bloqueante para código
novo, mas:

- Em código **novo**, prefira `@tanstack/react-query` para dados vindos do
  Supabase (cache, invalidação, estados de loading/error consistentes) em vez
  de replicar o padrão manual de `useEffect`/`useState`.
- Ao tocar significativamente em uma tela que já usa o padrão manual, avalie
  migrar para react-query como parte da mesma tarefa — mas não faça isso de
  forma oportunista em uma tarefa que não pediu isso, para não inflar o diff.
- Não introduza Redux, Zustand, Jotai ou outra lib de state management global
  sem justificar a necessidade e confirmar que react-query e o Context API
  (já usados em `useAuth`, `useOrganization`) não resolvem o caso.

## Hooks

Hooks devem encapsular comportamento reutilizável (autenticação, organização
ativa, acesso do patrocinador, notificações). Não crie um hook só para
remover algumas linhas de um componente — se o comportamento não é
reutilizável, deixe inline.

## Dependências

Dependências devem seguir a direção arquitetural existente: `pages` depende de
`components`/`hooks`/`lib`, nunca o inverso. Não introduza uma dependência
externa nova sem justificar a necessidade e avaliar se algo já instalado
resolve o problema.
