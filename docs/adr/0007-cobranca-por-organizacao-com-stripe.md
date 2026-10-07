# ADR-0007: Cobrança por organização com Stripe

Status: Accepted

## Contexto

O BrandPlay precisa cobrar pelo uso da plataforma. A Landing já anuncia três
planos (Starter, Pro e Enterprise), teste grátis de 14 dias e "sem cartão de
crédito". O projeto de referência `central-check` já tem uma feature de
cobrança com Stripe (ADRs 0004, 0010, 0011 e 0012 de lá), que serviu de base.

Duas diferenças de modelo impedem copiar o central-check como está:

- **Quem paga.** No central-check o estado de cobrança ficava em `profiles`,
  por usuário, porque cada usuário tem uma única conta. No BrandPlay o tenant é
  a **organização**, e um usuário pode estar em várias (ADR-0002). A cobrança
  tem de ser da organização.
- **Teste grátis.** O central-check bloqueia tudo até a assinatura ser paga. O
  BrandPlay promete teste sem cartão.

## Decisão

1. **Stripe** cobra, e é a fonte da verdade do estado financeiro. As tabelas
   `billing_subscriptions` e `billing_invoices` são projeções, gravadas só pelo
   servidor (webhook e `manage-billing`) a partir de objetos relidos no Stripe.
2. **Os planos e seus limites ficam no banco** (`billing_plans`). O Stripe
   guarda preço e assinatura, não a regra comercial. Mudar um limite é
   migration; o produto e o preço no Stripe são criados ou atualizados no
   próximo checkout.
3. **A cobrança é da organização.** Um customer do Stripe por organização
   (`billing_accounts`), uma assinatura vigente por organização (índice
   parcial), e só owner/admin contratam, trocam, cancelam ou leem faturas.
4. **Teste grátis de 14 dias, sem cartão, com os limites do Pro**, por
   organização. As organizações que já existiam ganharam o mesmo teste, contado
   a partir da migration `0024`. Duração e plano do teste ficam em
   `billing_settings`.
5. **Acesso** = assinatura `ativa`/`trialing`/`inadimplente` **ou** teste
   vigente. `inadimplente` mantém o acesso enquanto o Stripe tenta cobrar de
   novo; quando ele desiste (`nao_paga`/`cancelada`) o acesso cai.
6. **Limites aplicados no banco**, por gatilho: propriedades raiz e usuários
   (membros ativos + convites pendentes). Exceder falha com
   `hint = 'limite_plano:<recurso>'` e o plano sugerido em `detail`. A tela só
   traduz a mensagem.
7. **Cartão e boleto** na assinatura. Pix recorrente no Stripe exige Pix
   Automático, indisponível para contas brasileiras (mesma conclusão da
   ADR-0012 do central-check). Pix avulso de fatura ficou fora desta entrega.
8. **Webhook assinado e idempotente.** Sem `STRIPE_WEBHOOK_SECRET` a função
   recusa tudo. O `event.id` é gravado antes de processar; evento que falha
   fica com o erro e é reprocessado no reenvio do Stripe — seguro porque o
   processamento só relê o Stripe e regrava a projeção.

## Consequências

Positivas:

- Um usuário em várias organizações vê e paga cada uma separadamente, sem
  confusão de conta.
- Limites valem também para quem usa a API direto: a anon key é pública e o
  gatilho é a fronteira, não a tela.
- Um webhook perdido não deixa a organização bloqueada para sempre: "Verificar
  pagamento" (`manage-billing` → `sync`) relê o Stripe.

Negativas / riscos:

- **O bloqueio do painel por falta de assinatura é aplicado na interface**
  (`BillingGate`). O banco barra o crescimento (novas propriedades e usuários),
  mas não a leitura nem a edição do que já existe. Uma organização sem plano
  que use a API diretamente continua lendo os próprios dados. Levar o bloqueio
  total para a RLS exigiria tocar as ~80 policies e foi deixado para depois.
- **Boleto é assíncrono**: compensa em até um dia útil depois de pago. Quem
  contrata com boleto no último dia do teste pode ficar sem acesso até a
  compensação. A tela avisa; a liberação provisória do central-check (P-46)
  ficou fora desta entrega.
- **Teste por organização**: um usuário pode criar uma organização nova para
  ganhar outro teste. Aceito por ora; monitorar.
- Downgrade não remove nada: se o uso passou do novo limite, a troca é
  recusada (`uso_excede_plano`). Se o limite do plano diminuir por migration,
  quem já está acima continua, mas não cresce.

## Fora desta entrega

Pix avulso de fatura em aberto, liberação provisória de acesso durante a
compensação do boleto, tela de administração do catálogo de planos (exigiria
criar o papel de administrador da plataforma) e leitura do catálogo pela
Landing (os preços dela ainda estão no código e precisam bater com
`billing_plans`).

## Relacionadas

ADR-0002 (tenant), `docs/business/cobranca.md`, `docs/runbooks/cobranca.md`,
`supabase/migrations/0024_cobranca_e_planos.sql`,
`supabase/functions/manage-billing/`, `supabase/functions/billing-webhook/`.
