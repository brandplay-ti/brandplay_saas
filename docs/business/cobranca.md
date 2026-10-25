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

Fonte: tabela `billing_plans`, editada pelo superadmin em `/admin/planos`
(ADR-0008). Os valores abaixo são os da migration `0024`.

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
- O superadmin pode **estender** o teste de uma organização (1 a 90 dias por
  vez, com comentário), a partir do fim atual ou de agora, o que for mais
  tarde.
- Começa quando a organização é criada. As organizações que já existiam quando
  a cobrança entrou ganharam os 14 dias a partir daquele momento.
- Organização importada sem passar pelos gatilhos ganha o teste no primeiro
  acesso.

## Acesso ao painel

A organização tem acesso quando:

- tem assinatura `ativa`, `trialing` ou `inadimplente`; **ou**
- está dentro do teste grátis; **ou**
- tem uma liberação provisória vigente (abaixo).

Sem acesso, os dados da organização ficam **bloqueados no banco** para os
membros dela — pela tela e pela API. Continuam acessíveis só o necessário para
regularizar: a própria organização, a equipe e os convites, o plano, a
assinatura e as faturas. Na tela, owner/admin são levados à tela de plano; os
demais membros veem "Acesso suspenso".

O bloqueio é por organização: quem é membro de outra organização com acesso
continua usando aquela normalmente. Não são afetados o **portal do
patrocinador** (o patrocinador não é membro) nem o **Media Kit público**.

Os limites de cadastro valem em qualquer caso, inclusive com acesso.

| Status da assinatura | Significado                                            | Acesso |
| -------------------- | ------------------------------------------------------ | ------ |
| `incompleta`         | contratada, primeiro pagamento ainda não confirmado    | não\*  |
| `ativa`              | paga                                                   | sim    |
| `inadimplente`       | cobrança recusada, o Stripe está tentando de novo      | sim    |
| `nao_paga`           | o Stripe desistiu de cobrar                            | não    |
| `cancelada`          | encerrada                                              | não    |

\* Enquanto o teste estiver valendo, o acesso continua pelo teste; depois
dele, pela liberação provisória, se houver.

## Liberação provisória (boleto compensando)

O boleto compensa em até 1 dia útil depois de pago. Para a equipe não ficar
parada nesse intervalo:

- **Pelo cliente (em confiança):** owner/admin anexam o comprovante e
  declaram que pagaram. Vale só quando há uma contratação aguardando pagamento
  cuja fatura em aberto é um **boleto**, e **uma vez por fatura**. Dura 72
  horas (`billing_settings.provisional_access_hours`).
- **Pelo superadmin** (`/admin/clientes/<organização>`, ADR-0008): de 1 a
  720 horas, com comentário obrigatório, sem o limite de uma por fatura — para
  quando o prazo do cliente acabou e a compensação ainda não chegou, ou por
  decisão comercial. Pode ser revogada antes do fim, também com comentário.
- **Pela equipe, por SQL (manual):** o mesmo, pelo runbook, quando a tela não
  serve.

Liberações do superadmin, revogações e extensões de teste ficam no histórico
administrativo (`platform_admin_audit_log`), com autor e motivo.

A liberação nunca muda a assinatura: quando o boleto compensa, ela fica ativa
sozinha; quando o prazo passa sem compensar, o acesso cai. Durante a
liberação valem os limites do plano contratado.

Cancelar uma assinatura paga **não** corta o acesso na hora: ela segue ativa até
o fim do período pago e não renova. Cancelar uma contratação `incompleta`
encerra na hora, para permitir contratar de novo com outra forma de pagamento.

## Pagamento

- **Cartão ou boleto**, pelo Checkout do Stripe. O boleto vence em 3 dias e
  compensa em até 1 dia útil depois de pago.
- **Pix não é recorrente**: recorrência em Pix no Stripe exige Pix
  Automático, que não existe para contas brasileiras. Uma **fatura em aberto**
  pode ser paga por Pix, num pagamento avulso, pela aba Cobranças; a cada ciclo
  o cliente precisa pagar de novo. Depende de o Pix estar habilitado na conta
  do Stripe.
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

## Desconto e isenção

O superadmin registra, na ficha do cliente, um percentual de 1 a 100 por 1 a
12 meses. 100% isenta a cobrança nesse prazo. O motivo fica na auditoria.

- Com assinatura vigente, o cupom entra nela na hora.
- Sem assinatura, o cupom entra no próximo checkout.
- Um desconto vigente por organização. Outro percentual começa pela revogação
  do atual, que tira o cupom da assinatura. Fatura já emitida permanece.
- Estender o teste e liberar acesso provisório destrancam o painel. Eles não
  alteram o valor cobrado no Stripe.

## Faturamento da plataforma

Como a área administrativa apura (ADR-0008, `0028`):

- **Realizado** é caixa: soma das faturas `paga`, no mês em que foram pagas.
  Fatura em aberto não entra.
- **MRR** soma o preço atual do catálogo das assinaturas `ativa` e
  `inadimplente`. `trialing` e `incompleta` ficam fora. Assinatura antiga num
  preço já arquivado entra pelo preço de hoje — o valor exato de cada uma está
  no Stripe.
- **Cliente** num mês = organização com assinatura criada até o fim do mês e
  não cancelada até lá. Contratação abandonada (cancelada sem nenhuma fatura
  paga) não é cliente nem cancelamento.
- **Projeção**: parte do MRR de hoje e aplica crescimento e churn observados
  nos últimos 6 meses fechados. Sem histórico, as taxas são zero e a projeção
  repete o MRR.
