# Primeiros passos

Guia de orientação do primeiro acesso: o card **Primeiros passos** no topo do
Dashboard (`/dashboard`). Diz por onde começar e em que ordem cadastrar.

Não confundir com `/onboarding/organizacao`, a etapa técnica pela qual todo
login passa (confere a organização, mostra convites e pede cores e logo uma
vez). O guia começa depois dela, já dentro do painel.

Código: regras em `portal/src/lib/primeirosPassos.ts` (com testes), contagens
em `portal/src/hooks/usePrimeirosPassos.ts`, card em
`portal/src/components/dashboard/PrimeirosPassosWidget.tsx`.

## Ordem dos passos

**Agência** (monta o que vende antes de vender):

1. Cores e logo da organização
2. Projeto
3. Cotas de patrocínio do projeto
4. Patrocinador
5. Oportunidade no pipeline
6. Proposta
7. Contrato (gera as parcelas)
8. Entregas

**Marca** (cadastra a si mesma, o que patrocina e o que comprou; sem funil,
proposta nem portal, ver `tipo-de-cliente.md`):

1. Cores e logo da organização
2. A própria marca (tela "Marcas")
3. Projeto que patrocina
4. Cota comprada
5. Contrato (gera as parcelas a pagar)
6. Entregas

**Quando quiser** (opcionais, fora do progresso): convidar a equipe e, na
agência, abrir o portal ao patrocinador.

A ordem é sugestão, não trava: qualquer passo pode ser feito antes do
anterior. A única dependência do banco é a cota, que só existe dentro de um
projeto.

## Quem vê o quê

Todos os membros veem o guia, cada um com os passos dos módulos que acessa
(os mesmos do menu):

| Passo | Quem vê |
|---|---|
| Cores e logo | owner/admin |
| Projeto, cotas | módulo `crm` ou `operacional` |
| Patrocinador / marca | `crm` |
| Oportunidade, proposta | `vendas` (nunca a marca) |
| Contrato | `crm` ou `financeiro` |
| Entregas | `operacional` ou `crm` |
| Equipe, portal do patrocinador | `team` |

Esconder um passo é experiência, como no menu: o acesso real continua na RLS.

## Quando um passo está concluído

Pelos dados: o passo se marca quando existe ao menos um registro daquele
cadastro na organização (equipe: mais de um membro ativo). Ninguém marca à
mão, então todo membro vê o mesmo progresso e ele nunca fica desatualizado.
O guia só conta linhas que o membro já pode ler pela RLS. Se uma contagem
falhar, o guia não aparece, para não mostrar progresso errado.

## Quando o guia some

- **Sozinho**, quando todos os passos obrigatórios **daquele membro** estão
  feitos. Por isso uma organização que já opera nunca o vê.
- **Pelo usuário**, em "Ocultar guia" ou no "Personalizar" do Dashboard. A
  escolha fica na preferência de widgets já existente
  (`user_dashboard_preferences`, por usuário e organização), sem tabela nova.
  "Restaurar padrão" traz o guia de volta enquanto houver passo pendente.

## Suposições registradas

- A ordem da marca (marca → projeto → cota) foi definida por analogia à da
  agência, na mesma decisão. Revisar se o uso real mostrar outro caminho.
- Acesso ao portal revogado ainda conta como passo feito: o passo ensina a
  abrir o portal, não acompanha quem tem acesso hoje.
