# Tipo de cliente: agência e marca

Regras de negócio do tipo de cliente da organização. Decisão na ADR-0013;
análise e decisões D1–D14 em `docs/architecture/plano-visao-de-marca.md`.

## Os dois tipos

| Tipo | Quem é | O que muda |
|---|---|---|
| **Agência** | Agência ou detentor de direitos (clube, federação, organizador): vende patrocínio | Tudo o que o BrandPlay tinha até aqui |
| **Marca** | Quem compra patrocínio | Sem captação e sem funil de vendas; o resto é igual |

Uma organização tem um tipo só. Quem precisar dos dois usa duas
organizações (D14).

## O que a marca não tem

- Pipeline, oportunidades, atividades e comentários de oportunidade.
- Propostas (inclusive o assistente e a IA de proposta).
- Lead scoring e o formulário de lead.
- Media kit público (`/p/:slug`).
- Renovação pelo funil ("Gerar renovação" cria uma oportunidade).
- IA do funil: lead scoring, proposta, previsão de receita, preparação de
  reunião e as ferramentas de oportunidade do assistente.
- Na tela: risco de churn, mapa de ocupação de cotas e sell-out (visão de
  quem vende), win rate, ciclo de venda, conversão e motivos de perda.

O bloqueio é no banco, para qualquer papel, e não só no menu.

## O que a marca tem, igual à agência

Patrocinadores (na tela, **"Marcas"**: a própria marca ou as marcas do grupo),
projetos (o que a marca patrocina), cotas (a cota comprada), ativos,
contratos, parcelas, entregas e aprovação, App de Campo, BrandTrack,
relatórios de resultado (`/r/:slug`), relatório de entregas, portal do
patrocinador, ROI, benchmark de ticket, resumo executivo, equipe e
permissões.

Na marca, parcela é pagamento feito: a tela diz **"Pago"** e **"A pagar"** em
vez de "Recebido" e "Previsto" (D6).

## Escolha e troca do tipo

- **Cadastro**: a pessoa escolhe Agência ou Marca. Organização criada sem a
  escolha (versões antigas, importação) é Agência.
- **Contratação**: a tela de plano mostra o tipo. O **proprietário** corrige
  enquanto a organização **nunca teve assinatura**. Depois disso, só o suporte
  (superadmin) troca (D10).
- **Superadmin** (`/admin/clientes/:id`): troca com motivo obrigatório,
  registrado no histórico administrativo. Antes de confirmar, vê quantas
  oportunidades abertas, propostas, leads e media kits publicados ficam
  ocultos.

## O que acontece com os dados na troca

Nada é apagado nem alterado (D11).

| | Agência → Marca | Marca → Agência |
|---|---|---|
| Oportunidades, propostas, leads, lead scores, funis | ficam guardados e ocultos | voltam como estavam |
| Media kit publicado | sai do ar, sem perder slug nem conteúdo | volta ao ar |
| Contratos ligados a oportunidade | continuam, com o vínculo guardado | iguais |
| Permissões do funil | guardadas; o tipo as desliga | voltam a valer |

## Cobrança

Mesmos planos, preços e limites para os dois tipos (D9). "Projetos" no
limite do plano são, para a marca, os projetos que ela patrocina.

## Permissões

A matriz de permissões tem o módulo **Funil e captação** (`vendas`), separado
de **Patrocinadores e CRM**. Na agência, ele começa com o mesmo acesso que
cada papel tinha no CRM. Na marca, ele não aparece.
