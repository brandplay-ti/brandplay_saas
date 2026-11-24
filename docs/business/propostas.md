# Propostas: ativações como itens (BP-9)

Regras de negócio das **ativações** da proposta e de como elas viram itens.
Código em `portal/src/lib/propostaAtivacoes.ts`,
`portal/src/components/proposals/` e na Edge Function
`supabase/functions/estimate-activation-values/`.

## O que é uma ativação

A ativação é uma ação tática da proposta (blitz, sampling, meet & greet...). Ela
nasce na versão **Conceito** da aba **Versões IA**: a IA do assistente
"Proposta Inteligente" sugere de 4 a 7, e o usuário cria, edita ou remove à mão.
Não tem tabela própria: fica em `proposal_versions.metadata.activations`
(jsonb), com `title`, `description` e, opcionalmente, `value`, `value_source`
(`manual` ou `ia`) e `overlaps_with`.

## Valor da ativação

- O valor é **manual por padrão**: o campo começa vazio e o usuário digita.
- A IA só entra se o usuário pedir ("Sugerir valores com IA"). Gerar a proposta
  com o assistente **não** estima valor de ativação.
- A sugestão usa **a base da própria organização**: projetos, propostas
  **enviadas e aceitas** (com os itens) e o catálogo de ativos. Rascunhos e
  recusadas ficam fora; proposta em valor geral entra só com o total, porque o
  valor unitário dos itens dela não é referência. Não é uma avaliação de
  mercado: a tela diz isso antes de gerar e ao mostrar o resultado.
- Sem nada parecido na base, a ativação volta **sem valor** ("Sem referência
  na sua base"), em vez de um número inventado. Organização sem propostas
  enviadas/aceitas e sem ativos com valor nem chama a IA.
- Nada é aplicado sem confirmação: no modal, cada sugestão tem "Usar este
  valor" e pode ser editada; só as marcadas vão para a ativação, com o selo
  "Sugestão da IA". Digitar o valor depois troca a origem para manual.

## Duplicidade

A IA pode apontar que uma ativação entrega o mesmo que um item que a proposta
já tem (`overlaps_with`, só aceito se for o nome de um item que existe). Quem
decide é o usuário:

- no modal de sugestão, a ativação com esse aviso vem com o valor
  **desmarcado**;
- ao incluir nos itens, uma ativação com aviso, ou cujo nome já está nos itens,
  pede confirmação, mostrando o que entra, o acréscimo no total e os avisos.

## Ativação virando item

- Cada ativação vira um **item livre** (`proposal_items` sem `asset_id`):
  nome = título (até 200 caracteres; vazio vira "Ativação"), descrição =
  descrição, quantidade 1, valor unitário = valor da ativação (0 se vazio).
- **Aba Versões IA**: "Adicionar aos itens" em cada ativação e "Adicionar todas
  aos itens" (pula as que já estão nos itens, pelo nome). Uma ativação sem
  risco entra direto; várias, ou com aviso, pedem confirmação. Usa o que está
  na tela, mesmo antes de salvar o Conceito.
- **Assistente (preview)**: "Incluir nos itens" em cada ativação, nenhuma
  marcada por padrão. Proposta nova: as marcadas entram em Entregas e no total
  e são gravadas com a proposta. Proposta existente: viram itens depois de
  salvar as versões. Em ambos, salvar com ativações marcadas pede confirmação.
- Ao incluir pela aba Versões IA, o `total_value` da proposta é regravado com a
  soma dos itens, exceto quando ela está em **valor geral**.

## Quem pode

As mesmas regras dos itens: quem escreve no módulo de vendas
(`can_access_module(..., 'vendas', true)`, policies de `proposal_items`). A
sugestão de valor exige leitura de vendas e lê só a organização ativa, sob RLS.

Quem só **lê** o módulo de vendas (na matriz padrão, operacional e financeiro;
ou qualquer papel com "Lê" em Funil e captação) abre a tela de propostas, vê as
propostas, os itens e as versões e baixa o PDF já gerado, mas não cria, altera,
gera com IA nem exclui (BP-2):

- a tela esconde "Proposta Inteligente", "Gerar com IA", "Nova proposta",
  "Funil" e "Excluir", desabilita os campos e mostra o aviso de somente
  leitura (`canWrite("vendas")` em `useOrganization`);
- `generate-proposal-ai` e `generate-proposal-wizard` exigem **escrita** em
  vendas, como a `score-leads`: o resultado só serve gravado, então não se
  gasta IA com quem não poderia salvar;
- a fronteira continua sendo a RLS. Se a gravação for recusada (`42501`), a
  tela mostra o aviso de permissão, não a mensagem do Postgres.

## Modelo de IA registrado

As versões geradas pelo assistente gravam em `proposal_versions.model` o
`fornecedor/modelo` que a camada de IA usou de fato (ADR-0010), devolvido pela
`generate-proposal-wizard`. Antes, a tela gravava um nome fixo.
