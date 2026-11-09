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

## Filtros de listagem

Filtro de tela de listagem (busca, status, ordenação, "mostrar arquivados")
usa o `useFiltroSalvo` (`portal/src/hooks/useFiltroSalvo.ts`, issue #51), não
`useState` nem `localStorage` direto. Ele tem a assinatura do `useState`,
guarda o valor por organização ativa (`brandplay:filtros:<org>:<tela>`) e
descarta valor salvo de tipo errado ou fora de `permitidos`. Nomeie a tela em
PT-BR (`"propostas"`, `"brandtrack-uploads"`); na área `/admin`, passe
`{ escopo: "plataforma" }`. Para select de opções fixas, passe o tipo e
`permitidos`. Preferência de visualização (modo kanban/lista) não é filtro e
fica fora.

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

## Campos de senha

Todo campo de senha usa o `PasswordInput`
(`portal/src/components/PasswordInput.tsx`), nunca `<Input type="password">`
direto nem `type="text"`:

- o padrão é **oculto**;
- há sempre um botão para mostrar e ocultar a senha, acessível por teclado e
  com `aria-label` ("Mostrar senha" / "Ocultar senha");
- vale para qualquer senha: login, cadastro, definição de senha e senha
  temporária definida por outra pessoa (ex.: criação de membro em
  `TeamManagement`).

Campo de senha nova ou temporária usa `autoComplete="new-password"`. Sem isso,
o navegador pode preencher nele a senha salva de quem está logado.

Em E2E, localize o campo com `getByLabel("Senha", { exact: true })`: sem o
`exact`, o Playwright também encontra o botão "Mostrar senha".

## Campos de valor e de data

Todo campo de dinheiro em reais usa o `CurrencyInput`
(`portal/src/components/CurrencyInput.tsx`) e todo campo de data ou de data e
hora usa o `DateInput` (`portal/src/components/DateInput.tsx`), nunca
`<Input type="number">` para dinheiro nem `<Input type="date">` ou
`type="datetime-local"`, que mostram o formato do idioma do navegador:

- `CurrencyInput` mostra `R$ 1.234,56`, preenche da direita para a esquerda e
  entrega em `onValueChange` o decimal com ponto (`"1234.56"`) ou `""`;
- `DateInput` mostra `dd/mm/aaaa` (`withTime`: `dd/mm/aaaa hh:mm`), tem
  calendário em português e entrega em `onValueChange` o ISO (`2026-03-12`,
  `2026-03-12T14:30`) ou `""` enquanto a data estiver incompleta ou inválida;
- gravar ao sair do campo de data é `onCommit`, não `onBlur`: o `onCommit`
  também dispara ao escolher no calendário e não dispara com data inválida;
- número sem teto que não é dinheiro (quantidade, vagas, público, seguidores,
  visualizações) usa o `NumberInput` (`portal/src/components/NumberInput.tsx`):
  mostra `1.234` e entrega em `onValueChange` só os dígitos, com ponto se `casas`
  liberar decimais;
- `type="number"` fica para ano e para faixa fixa abaixo de mil (porcentagem, dia
  do mês, prioridade), onde o marcador de milhar atrapalha ou nunca aparece.

Em tela, data pura vinda do banco é exibida com `isoParaData`
(`portal/src/lib/mascaras.ts`), nunca crua nem com `new Date("aaaa-mm-dd")`, e
número que pode passar de mil, com `formatarNumero`.

Em E2E, `fill` no `CurrencyInput` recebe os dígitos: `"150000"` é `R$ 1.500,00`.

## Autorização

Verificações no frontend (esconder botão, desabilitar ação, redirecionar em
`ProtectedRoute`) são experiência de usuário, nunca fronteira de segurança. A
decisão de acesso real é sempre reforçada por RLS e, quando aplicável, por
validação em Edge Function.
