# Frontend React

## TypeScript

O código deve usar TypeScript de maneira estrita.

Evite:

- `any`;
- casts desnecessários;
- `@ts-ignore` / `@ts-expect-error`.

Quando um tipo precisar ser ignorado, explique o motivo em comentário.

**Dívida técnica conhecida**: `supabase/functions/*.ts` hoje tem uso extensivo
de `any` (respostas de API externas, payloads de webhook, dados vindos do
gateway de IA). Isso não é uma licença para introduzir `any` em código novo —
é um ponto a **não piorar**. Ao tocar significativamente numa Edge Function
existente, tipar o que for razoável tipar na mesma tarefa; não é obrigatório
sanear o arquivo inteiro de uma vez se isso não for o escopo pedido.

## React

Preferir componentes funcionais pequenos, com responsabilidade única.

Evitar:

- efeitos desnecessários;
- chamada assíncrona direta dentro do JSX;
- lógica de negócio extensa dentro do componente (mover para `portal/src/lib/` ou um
  hook);
- prop drilling excessivo (usar Context quando já existir um, como
  `useOrganization`/`useAuth`, em vez de criar um novo caminho paralelo);
- componentes com responsabilidades múltiplas.

## Busca de dados

O projeto tem `@tanstack/react-query` instalado. Em código novo, prefira
react-query a `useEffect` + `useState` manual contra o Supabase — é mais fácil
de testar, já resolve cache/loading/error, e é o padrão para onde o projeto
está migrando (ver `.claude/rules/architecture.md`). Não é obrigatório
reescrever telas existentes que já usam o padrão manual fora do escopo da
tarefa.

## Performance

Não otimizar prematuramente. Antes de usar `useMemo`, `useCallback` ou
`memo`, confirme que existe um problema de performance real a resolver.

## Acessibilidade

Elementos interativos devem ter label adequado, suportar teclado, ter estado
visual de foco/hover/disabled e semântica apropriada. Não usar `div` como
botão quando um `<button>` (ou o `Button` do shadcn/ui) resolve.

## UI

Respeitar o shadcn/ui existente em `portal/src/components/ui/`. Não introduzir uma
nova biblioteca de componentes (Material UI, Chakra, Ant Design etc.) sem
necessidade clara e sem antes confirmar que o componente equivalente não
existe ou não pode ser composto a partir do que já está instalado (Radix +
Tailwind).

## Autorização

Verificações no frontend (esconder botão, desabilitar ação, redirecionar em
`ProtectedRoute`) são experiência de usuário, nunca fronteira de segurança. A
decisão de acesso real é sempre reforçada por RLS e, quando aplicável, por
validação em Edge Function.
