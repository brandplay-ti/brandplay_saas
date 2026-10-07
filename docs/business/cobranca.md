# Cobrança e planos

Regras de negócio da cobrança da plataforma. Decisão e alternativas na
ADR-0007; operação no `docs/runbooks/cobranca.md`.

## Quem paga

A **organização**. Cada organização tem o próprio plano, teste, assinatura e
faturas. Um usuário em várias organizações vê cada uma separadamente.

Só **owner** e **admin** contratam, trocam de plano, cancelam, abrem o portal
de pagamento e veem as faturas. Os demais membros veem o plano e o uso, sem
ações.

O portal do patrocinador não é afetado pela cobrança.

## Catálogo

Fonte: tabela `billing_plans`. Os valores abaixo são os da migration `0024`.

| Plano      | Preço/mês    | Propriedades | Usuários   | Contratação        |
| ---------- | ------------ | ------------ | ---------- | ------------------ |
| Starter    | R$ 490,00    | 3            | 1          | online             |
| Pro        | R$ 1.490,00  | ilimitadas   | 10         | online             |
| Enterprise | sob consulta | ilimitadas   | ilimitados | com o comercial    |

- **Propriedades** contam só as raízes: uma edição/temporada de uma propriedade
  (`parent_property_id`) é a mesma propriedade em outro ano e não ocupa vaga.
- **Usuários** = membros ativos (incluindo o owner) + convites pendentes. O
  convite reserva a vaga quando é feito; por isso aceitar um convite nunca é
  bloqueado.
- A lista de recursos de cada plano (`features`) é texto comercial: nenhum
  módulo é bloqueado por plano. Só os limites acima são aplicados.

## Teste grátis

- **14 dias, sem cartão, com os limites do Pro** (`billing_settings`).
- Começa quando a organização é criada. As organizações que já existiam quando
  a cobrança entrou ganharam os 14 dias a partir daquele momento.
- Organização importada sem passar pelos gatilhos ganha o teste no primeiro
  acesso.

## Acesso ao painel

A organização tem acesso quando:

- tem assinatura `ativa`, `trialing` ou `inadimplente`; **ou**
- está dentro do teste grátis.

Sem acesso, owner/admin são levados à tela de plano; os demais membros veem
"Acesso suspenso". Os limites de cadastro valem em qualquer caso, inclusive com
acesso: uma organização sem plano não cria propriedades nem convida.

| Status da assinatura | Significado                                            | Acesso |
| -------------------- | ------------------------------------------------------ | ------ |
| `incompleta`         | contratada, primeiro pagamento ainda não confirmado    | não\*  |
| `ativa`              | paga                                                   | sim    |
| `inadimplente`       | cobrança recusada, o Stripe está tentando de novo      | sim    |
| `nao_paga`           | o Stripe desistiu de cobrar                            | não    |
| `cancelada`          | encerrada                                              | não    |

\* Enquanto o teste estiver valendo, o acesso continua pelo teste.

Cancelar uma assinatura paga **não** corta o acesso na hora: ela segue ativa até
o fim do período pago e não renova. Cancelar uma contratação `incompleta`
encerra na hora, para permitir contratar de novo com outra forma de pagamento.

## Pagamento

- **Cartão ou boleto**, pelo Checkout do Stripe. O boleto vence em 3 dias e
  compensa em até 1 dia útil depois de pago.
- **Pix** não está disponível: recorrência em Pix no Stripe exige Pix
  Automático, que não existe para contas brasileiras.
- Uma assinatura vigente por organização. Com uma contratação aguardando
  pagamento, não dá para contratar de novo até pagar ou cancelar a tentativa.

## Troca de plano

- Só com a assinatura `ativa`.
- Vale na hora; a diferença proporcional ao período já pago entra na próxima
  fatura (crédito, se o plano novo for mais barato).
- É recusada se o uso atual não couber no plano novo (ex.: 5 propriedades e
  troca para o Starter).

## Limite atingido

O cadastro que passaria do limite falha no banco. A tela mostra a mensagem e o
plano mais barato que comporta o uso, com atalho para a tela de plano (para
owner/admin).

Se o limite de um plano diminuir, quem já está acima continua com o que tem,
mas não cresce até voltar para baixo do limite.
