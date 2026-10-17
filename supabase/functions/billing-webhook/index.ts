// Webhook do Stripe (ADR-0007, docs/runbooks/cobranca.md).
//
// Chamado pelo Stripe, sem sessão de usuário: a autenticação é a assinatura
// do payload (`stripe-signature` + STRIPE_WEBHOOK_SECRET). Sem o segredo, a
// função recusa tudo — processar payload não verificado deixaria qualquer um
// que descubra a URL mudar a assinatura de uma organização.
//
// Idempotência: `billing_stripe_events` guarda o event.id. Evento já
// processado é no-op. Evento que FALHOU fica com `error` preenchido e é
// reprocessado no reenvio automático do Stripe — o processamento só lê o
// estado atual no Stripe e regrava a projeção, então repetir é seguro.

import {
  adminClient,
  corsHeaders,
  idOf,
  json,
  mirrorInvoice,
  mirrorSubscription,
  organizationOfCustomer,
  settlePixPayment,
  Stripe,
  stripeClient,
} from "../_shared/billing.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Trava = "novo" | "reprocessar" | "duplicado";

async function travarEvento(db: SupabaseClient, event: Stripe.Event): Promise<Trava> {
  const { data, error } = await db
    .from("billing_stripe_events")
    .upsert({ event_id: event.id, type: event.type }, { onConflict: "event_id", ignoreDuplicates: true })
    .select("event_id");
  if (error) throw new Error(`billing_stripe_events: ${error.message}`);
  if (data && data.length > 0) return "novo";

  const { data: existente } = await db
    .from("billing_stripe_events")
    .select("processed_at, error")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existente?.processed_at || !existente?.error) {
    // Já processado, ou em processamento por outra entrega simultânea.
    return "duplicado";
  }

  // Falhou antes. Limpa o erro como compare-and-set: de duas entregas
  // simultâneas do reenvio, só uma reprocessa.
  const { data: retomado } = await db
    .from("billing_stripe_events")
    .update({ error: null })
    .eq("event_id", event.id)
    .not("error", "is", null)
    .select("event_id");
  return retomado && retomado.length > 0 ? "reprocessar" : "duplicado";
}

async function processar(db: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    // Contratação. Boleto é assíncrono: `completed` chega quando o boleto é
    // GERADO (assinatura `incomplete`); a compensação vem por
    // `async_payment_succeeded` e por `invoice.paid`. Qualquer um dos dois
    // basta, porque os dois releem a assinatura no Stripe.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const sessao = event.data.object as Stripe.Checkout.Session;

      // Pix avulso de fatura em aberto. Pix é assíncrono: a baixa acontece no
      // evento em que a sessão chega paga (completed ou async_payment_succeeded).
      if (sessao.mode === "payment") {
        if (event.type !== "checkout.session.async_payment_failed") {
          await settlePixPayment(db, stripe, sessao);
        }
        return;
      }

      if (sessao.mode !== "subscription") return;
      const customerId = idOf(sessao.customer);
      if (customerId) {
        await organizationOfCustomer(
          db,
          stripe,
          customerId,
          sessao.metadata?.organization_id ?? sessao.client_reference_id ?? null,
        );
      }
      const subId = idOf(sessao.subscription);
      if (subId) await mirrorSubscription(db, stripe, subId);
      return;
    }

    // Nem toda assinatura nasce de um checkout: uma criada no Dashboard
    // (Enterprise, por exemplo) só avisa por estes eventos.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      await mirrorSubscription(db, stripe, (event.data.object as Stripe.Subscription).id);
      return;
    }

    // Faturas. Pagamento ou falha mudam o status da assinatura (incomplete →
    // active, active → past_due): espelha a assinatura primeiro, para a
    // fatura já nascer ligada a ela.
    case "invoice.finalized":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      // Nas versões recentes da API a assinatura saiu do topo da fatura e foi
      // para `parent.subscription_details`; o payload segue a versão do endpoint.
      const fatura = event.data.object as Stripe.Invoice & {
        parent?: { subscription_details?: { subscription?: string } };
      };
      const subId = idOf(fatura.subscription) ?? fatura.parent?.subscription_details?.subscription ?? null;
      if (subId) await mirrorSubscription(db, stripe, subId);
      await mirrorInvoice(db, stripe, fatura.id);
      return;
    }

    default:
      console.log(`[billing-webhook] evento ignorado: ${event.type}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const stripe = stripeClient();
  const segredo = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripe || !segredo) {
    console.error("[billing-webhook] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET ausente — recusado");
    return json({ error: "Cobrança não configurada." }, 503);
  }

  let event: Stripe.Event;
  try {
    // Assíncrona: no Deno a verificação usa SubtleCrypto. A versão síncrona
    // (`constructEvent`) lança "SubtleCryptoProvider cannot be used in a
    // synchronous context".
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      segredo,
    );
  } catch {
    console.warn("[billing-webhook] assinatura inválida — recusado");
    return json({ error: "Assinatura inválida." }, 400);
  }

  const db = adminClient();

  let trava: Trava;
  try {
    trava = await travarEvento(db, event);
  } catch (e) {
    console.error(`[billing-webhook] falha ao registrar ${event.id}:`, e instanceof Error ? e.message : e);
    return json({ error: "Falha ao registrar o evento." }, 500);
  }

  if (trava === "duplicado") {
    console.log(`[billing-webhook] ${event.id} (${event.type}) já processado — ignorado`);
    return json({ received: true, duplicate: true });
  }

  try {
    await processar(db, stripe, event);
    await db
      .from("billing_stripe_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("event_id", event.id);
    console.log(`[billing-webhook] ${event.id} (${event.type}) processado${trava === "reprocessar" ? " no reenvio" : ""}`);
    return json({ received: true });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[billing-webhook] ${event.id} (${event.type}) falhou:`, mensagem);
    await db
      .from("billing_stripe_events")
      .update({ error: mensagem.slice(0, 500) })
      .eq("event_id", event.id);
    // 500 faz o Stripe reenviar; o reenvio cai em "reprocessar".
    return json({ error: "Falha ao processar o evento." }, 500);
  }
});
