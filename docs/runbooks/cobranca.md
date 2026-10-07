# Runbook — Cobrança

Regras de negócio: `docs/business/cobranca.md`. Decisão: ADR-0007.

Fonte da verdade dos preços e limites: tabela `billing_plans`. Fonte da verdade
do estado financeiro: Stripe. `billing_subscriptions` e `billing_invoices` são
projeções gravadas pelo webhook e pela `manage-billing`.

## Configurar o Stripe num ambiente

Uma vez por ambiente. Homologação usa a conta em **modo de teste**; produção, o
modo live. Nunca reaproveite chaves entre ambientes.

1. **Boleto**: Dashboard → Settings → Payment methods → ative **Boleto**.
   Cartão já vem ativo.
2. **Chave secreta**: Developers → API keys → `sk_test_...` (homologação) ou
   `sk_live_...` (produção). No Dockploy, no serviço **Compose do Supabase**
   do ambiente, variável `STRIPE_SECRET_KEY`.
3. **Webhook**: Developers → Webhooks → Add endpoint:
   - URL: `https://api.<dominio do ambiente>/functions/v1/billing-webhook`
   - Eventos (mínimo):

     | Evento                                                   | Para quê                                        |
     | -------------------------------------------------------- | ----------------------------------------------- |
     | `checkout.session.completed`                             | liga o customer à organização                   |
     | `checkout.session.async_payment_succeeded` / `_failed`   | boleto da contratação compensado ou vencido     |
     | `customer.subscription.created` / `updated` / `deleted`  | projeção da assinatura                          |
     | `customer.subscription.paused` / `resumed`               | projeção da assinatura                          |
     | `invoice.finalized` / `paid` / `payment_failed`          | projeção da fatura **e** do status da assinatura |
     | `invoice.voided` / `marked_uncollectible`                | projeção da fatura                              |

   - Copie o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` no
     mesmo serviço do Dockploy.
4. **Portal do cliente** (botão "Gerenciar pagamento"): Settings → Billing →
   Customer portal → ative **atualizar forma de pagamento** e **histórico de
   faturas**. Deixe a **troca de plano desligada** — ela é feita pela tela do
   BrandPlay, que confere o uso antes. Sem essa configuração o botão responde
   "portal de pagamento ainda não foi configurado".
5. **Redeploy** do serviço do Supabase para o container `functions` ler as
   variáveis novas.
6. Conferir: o envio de teste do Dashboard (Webhooks → endpoint → Send test
   event) deve responder `200` — eventos de tipo não tratado são registrados e
   ignorados.

Sem as duas variáveis a cobrança fica desligada: a tela de plano responde
"cobrança não configurada", e o webhook recusa todo evento com `503`. O teste
grátis e os limites continuam valendo, porque são do banco.

### Ambiente local

```bash
stripe listen --forward-to localhost:8010/functions/v1/billing-webhook
```

O `stripe listen` imprime um `whsec_...` próprio da sessão. Coloque-o, com a
`sk_test_...`, em `docker/supabase/.env` e recrie o container `functions`.
Cartão de teste: `4242 4242 4242 4242`, qualquer validade futura e CVC. Boleto
de teste: qualquer CPF válido; o Stripe simula a compensação em alguns minutos.

## Alterar preço ou limite de um plano

Migration de dados, nunca edição manual:

```sql
update public.billing_plans set price_cents = 59000 where id = 'starter';
```

- **Preço**: o próximo checkout cria um preço novo no Stripe e arquiva o
  antigo. **Assinaturas em curso continuam no preço antigo** — migrar quem já
  assina é decisão comercial e se faz no Stripe, assinatura a assinatura.
- **Limite**: vale na hora. Quem já está acima do novo limite mantém o que tem,
  mas não cresce.
- Depois de mudar preço, ajuste a Landing (`portal/src/pages/Landing.tsx`), que
  ainda tem os preços no código.

## Plano novo

Migration de dados com `id` estável (é a chave do checkout e da metadata do
produto no Stripe). `price_cents` nulo = "sob consulta" (sem checkout).

## Contrato Enterprise

Fechado pelo comercial, criado no Stripe pelo Dashboard:

1. Customer: use o da organização (`billing_accounts.stripe_customer_id`) ou
   crie um com metadata `organization_id = <uuid da organização>`.
2. Produto com metadata `plan_id = enterprise` e o preço negociado.
3. Assinatura para esse customer, com metadata `organization_id` e
   `plan_id = enterprise`.

O webhook espelha a assinatura e a organização passa a ter acesso, sem limites.

## Estender o teste de uma organização

```sql
update public.billing_accounts
   set trial_ends_at = now() + interval '7 days'
 where organization_id = '<uuid>';
```

Registre quem pediu e por quê. Para mudar a duração do teste das organizações
**novas**: `update public.billing_settings set trial_days = 21;`.

## Cliente pagou e continua sem acesso

1. No Dashboard do Stripe, confira se a fatura está `paid` e a assinatura
   `active`. Boleto só fica pago quando o banco compensa (até 1 dia útil depois
   do pagamento).
2. Se está paga no Stripe: owner/admin clica em **Verificar pagamento** na tela
   de plano. A `manage-billing` relê assinaturas e faturas e regrava a projeção.
3. Se não resolver: Developers → Webhooks → endpoint, veja se os eventos
   chegaram com `2xx`; e a coluna `error` em `billing_stripe_events`.

## Reprocessar um evento

O webhook é idempotente por `billing_stripe_events.event_id`:

- Evento que **falhou** (`error` preenchido) é reprocessado sozinho no próximo
  reenvio automático do Stripe, ou pelo botão **Resend** do Dashboard.
- Evento **processado** (`processed_at` preenchido) é ignorado no reenvio.
- Linha sem `processed_at` e sem `error` (a função caiu no meio): apague a
  linha e use **Resend** no Dashboard.

```sql
delete from public.billing_stripe_events where event_id = 'evt_...';
```

Reprocessar é seguro: o processamento relê o objeto no Stripe e regrava a
projeção.

## Carga de dados (seed, importação)

A importação do corte roda com `session_replication_role = replica`: nenhum
gatilho dispara, então nem limites nem contas de cobrança. As organizações
importadas ganham a conta (e os 14 dias de teste) no primeiro acesso.

Outra carga que precise passar dos limites, na mesma transação:

```sql
set local brandplay.ignorar_limites = 'on';
```

Nunca no caminho da aplicação.
