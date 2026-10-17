# Runbook — Cobrança

Regras de negócio: `docs/business/cobranca.md`. Decisão: ADR-0007.

Fonte da verdade dos preços e limites: tabela `billing_plans`. Fonte da verdade
do estado financeiro: Stripe. `billing_subscriptions` e `billing_invoices` são
projeções gravadas pelo webhook e pela `manage-billing`.

## Configurar o Stripe num ambiente

Uma vez por ambiente. Homologação usa a conta em **modo de teste**; produção, o
modo live. Nunca reaproveite chaves entre ambientes.

1. **Boleto**: Dashboard → Settings → Payment methods → ative **Boleto**.
   Cartão já vem ativo. **Pix** (pagamento avulso de fatura): ative também. Em
   contas brasileiras o Stripe libera o Pix **por convite** — enquanto não
   liberar, o botão "Pix" da aba Cobranças responde que o Pix não está
   disponível, e o resto da cobrança funciona normalmente.
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

Pela área administrativa: `/admin/planos` → Editar (superadmin,
`docs/runbooks/superadmin.md`). A Edge Function `admin-plans` grava o
catálogo, sincroniza o Stripe e registra na auditoria.

Sem acesso à tela (ou para versionar um catálogo inicial de ambiente novo),
migration de dados — nunca edição manual no Studio:

```sql
update public.billing_plans set price_cents = 59000 where id = 'starter';
```

- **Preço**: o próximo checkout cria um preço novo no Stripe e arquiva o
  antigo. **Assinaturas em curso continuam no preço antigo** — migrar quem já
  assina é decisão comercial e se faz no Stripe, assinatura a assinatura.
- **Limite**: vale na hora. Quem já está acima do novo limite mantém o que tem,
  mas não cresce.
- A página pública lê o catálogo do banco: não há preço no código para
  ajustar.

## Plano novo

`/admin/planos` → Novo plano, ou migration de dados. O `id` é estável (é a
chave do checkout e da metadata do produto no Stripe) e não muda depois.
`price_cents` nulo = "sob consulta" (sem checkout).

## Contrato Enterprise

Fechado pelo comercial, criado no Stripe pelo Dashboard:

1. Customer: use o da organização (`billing_accounts.stripe_customer_id`) ou
   crie um com metadata `organization_id = <uuid da organização>`.
2. Produto com metadata `plan_id = enterprise` e o preço negociado.
3. Assinatura para esse customer, com metadata `organization_id` e
   `plan_id = enterprise`.

O webhook espelha a assinatura e a organização passa a ter acesso, sem limites.

## Estender o teste de uma organização

Pela área administrativa: `/admin/clientes/<organização>` → Estender teste,
com o motivo (fica na auditoria). Por SQL, só se a tela não servir:

```sql
update public.billing_accounts
   set trial_ends_at = now() + interval '7 days'
 where organization_id = '<uuid>';
```

Por SQL não há auditoria: registre quem pediu e por quê. Para mudar a duração do teste das organizações
**novas**: `update public.billing_settings set trial_days = 21;`.

## Liberação provisória de acesso

Enquanto o boleto compensa, o acesso pode ser liberado **sem mudar a
assinatura** (`billing_access_grants`). A API não grava nessa tabela direto: o
cliente libera pela `manage-billing`, o superadmin pela área administrativa
(`admin_liberar_acesso`), e a equipe, em último caso, por SQL.

- **Pelo cliente:** tela de plano → "Já pagou o boleto?" → comprovante +
  declaração. Uma vez por fatura, 72 h.
- **Pelo superadmin:** `/admin/clientes/<organização>` → Liberar acesso (1 a
  720 h, motivo obrigatório). Revogar pela mesma tela. Tudo vai para a
  auditoria (`platform_admin_audit_log`).
- **Pela equipe, por SQL (manual)**, com comentário obrigatório:

  ```sql
  insert into public.billing_access_grants (organization_id, kind, comment, expires_at)
  values ('<uuid da organização>', 'manual',
          'Boleto pago em <data>, compensação atrasada — pedido de <quem>',
          now() + interval '48 hours');
  ```

- **Revogar** (nunca `delete`):

  ```sql
  update public.billing_access_grants set revoked_at = now() where id = '<id>';
  ```

- **Prazo padrão** do cliente: `update public.billing_settings set provisional_access_hours = 72;`

Os comprovantes ficam no bucket privado `billing-receipts`, em
`<uuid da organização>/<arquivo>`. Abra pelo Studio (Storage) ao revisar
clientes com boleto em aberto. Ninguém é avisado automaticamente quando um
cliente se libera.

## Pix pago em duplicidade

Se o cliente pagar a fatura por Pix **e** o boleto/cartão da mesma fatura,
o segundo pagamento entra no Stripe sem fatura em aberto para quitar (o
webhook só dá baixa em fatura `open`). Reembolse pelo Dashboard do Stripe o
pagamento a mais.

## Organização bloqueada

Sem assinatura com acesso, teste ou liberação, os dados da organização ficam
inacessíveis aos membros **no banco** (policies `billing_access_restrictive`,
`0026`) — telas vazias e a tela de plano no lugar do painel. Para conferir o
motivo:

```sql
select public.billing_access_plan('<uuid>');   -- nulo = sem acesso
select status, plan_id, created_at from public.billing_subscriptions where organization_id = '<uuid>' order by created_at desc;
select trial_ends_at from public.billing_accounts where organization_id = '<uuid>';
select kind, expires_at, revoked_at from public.billing_access_grants where organization_id = '<uuid>' order by created_at desc;
```

Tabela nova com `organization_id` precisa da policy restritiva (mesmo formato
da `0026`); o teste `(m)` de `supabase/tests/cobranca.sql` falha se faltar.

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
