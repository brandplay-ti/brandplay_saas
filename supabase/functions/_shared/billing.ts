// Cobrança: o que `billing-webhook` e `manage-billing` compartilham (ADR-0007).
//
// As tabelas billing_* são PROJEÇÃO do Stripe. Toda gravação aqui parte de um
// objeto lido do Stripe na hora — e não do payload do evento —, então
// reprocessar é seguro e a ordem de entrega dos eventos não importa.
//
// A versão da API é fixada no cliente: o formato dos objetos lidos daqui não
// depende da versão configurada no endpoint do webhook.

import Stripe from "https://esm.sh/stripe@14.25.0";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export { Stripe };

export const STRIPE_API_VERSION = "2023-10-16";

/** Status em que a assinatura ainda está em jogo: no máximo uma por organização. */
export const VIGENTES = ["incompleta", "trialing", "ativa", "inadimplente"];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Cliente do Stripe, ou null quando o ambiente não tem a chave. */
export function stripeClient(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// ─── Vocabulário do Stripe → do domínio ──────────────────────────────
const STATUS_ASSINATURA: Record<string, string> = {
  incomplete: "incompleta",
  incomplete_expired: "cancelada",
  trialing: "trialing",
  active: "ativa",
  past_due: "inadimplente",
  unpaid: "nao_paga",
  canceled: "cancelada",
  paused: "nao_paga",
};

const STATUS_FATURA: Record<string, string> = {
  draft: "rascunho",
  open: "aberta",
  paid: "paga",
  uncollectible: "nao_paga",
  void: "cancelada",
};

const METODO: Record<string, string> = {
  card: "cartao",
  boleto: "boleto",
  pix: "pix",
};

function iso(segundos: number | null | undefined): string | null {
  return segundos ? new Date(segundos * 1000).toISOString() : null;
}

export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// ─── Organização e plano ─────────────────────────────────────────────

/**
 * Organização dona do customer do Stripe.
 *
 * O vínculo gravado em `billing_accounts` vale primeiro. Sem ele — o evento
 * chegou antes de o checkout gravar o customer —, usa `hint` (metadata da
 * assinatura/sessão, posta pela manage-billing) ou a metadata do próprio
 * customer, e grava o vínculo que faltava.
 */
export async function organizationOfCustomer(
  db: SupabaseClient,
  stripe: Stripe,
  customerId: string,
  hint: string | null = null,
): Promise<string | null> {
  const { data: conta } = await db
    .from("billing_accounts")
    .select("organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (conta?.organization_id) return conta.organization_id as string;

  let orgId = hint;
  if (!orgId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!("deleted" in customer && customer.deleted)) {
      orgId = (customer as Stripe.Customer).metadata?.organization_id ?? null;
    }
  }
  if (!orgId) return null;

  const { data: org } = await db.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (!org) return null;

  await db.rpc("billing_ensure_account", { _org_id: orgId });
  await db
    .from("billing_accounts")
    .update({ stripe_customer_id: customerId })
    .eq("organization_id", orgId)
    .is("stripe_customer_id", null);

  return orgId;
}

/**
 * Plano da assinatura no catálogo. A metadata do produto (gravada ao criar o
 * produto) é a ligação confiável; depois a da assinatura; por fim o preço.
 */
async function planOfSubscription(db: SupabaseClient, sub: Stripe.Subscription): Promise<string | null> {
  const price = sub.items.data[0]?.price;
  const product = price?.product;
  const doProduto =
    product && typeof product === "object" && !("deleted" in product && product.deleted)
      ? (product as Stripe.Product).metadata?.plan_id
      : null;

  for (const candidato of [doProduto, sub.metadata?.plan_id]) {
    if (!candidato) continue;
    const { data } = await db.from("billing_plans").select("id").eq("id", candidato).maybeSingle();
    if (data) return data.id as string;
  }

  if (price?.id) {
    const { data } = await db.from("billing_plans").select("id").eq("stripe_price_id", price.id).maybeSingle();
    if (data) return data.id as string;
  }
  return null;
}

// ─── Espelhamento ────────────────────────────────────────────────────

/**
 * Lê a assinatura no Stripe e grava a projeção. Devolve a organização, ou null
 * quando a assinatura não é desta plataforma (sem organização ou plano
 * reconhecível) — nesse caso não grava nada.
 */
export async function mirrorSubscription(
  db: SupabaseClient,
  stripe: Stripe,
  subscriptionId: string,
): Promise<string | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product", "default_payment_method"],
  });

  const customerId = idOf(sub.customer);
  const orgId = customerId
    ? await organizationOfCustomer(db, stripe, customerId, sub.metadata?.organization_id ?? null)
    : null;
  if (!orgId) {
    console.warn(`[billing] assinatura ${sub.id} sem organização — não espelhada`);
    return null;
  }

  const planId = await planOfSubscription(db, sub);
  if (!planId) {
    console.warn(`[billing] assinatura ${sub.id} sem plano do catálogo — não espelhada`);
    return null;
  }

  const pm = sub.default_payment_method;
  const aceitos = sub.payment_settings?.payment_method_types ?? [];
  const tipo = pm && typeof pm === "object" ? pm.type : aceitos.length === 1 ? aceitos[0] : null;

  const { error } = await db.from("billing_subscriptions").upsert(
    {
      organization_id: orgId,
      plan_id: planId,
      status: STATUS_ASSINATURA[sub.status] ?? "incompleta",
      payment_method: tipo ? METODO[tipo] ?? null : null,
      current_period_start: iso(sub.current_period_start),
      current_period_end: iso(sub.current_period_end),
      cancel_at_period_end: !!sub.cancel_at_period_end,
      canceled_at: iso(sub.canceled_at),
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (error) throw new Error(`billing_subscriptions (${sub.id}): ${error.message}`);

  return orgId;
}

/** Método com que a fatura foi (ou está sendo) paga — o real, não o primeiro aceito. */
export function methodOfInvoice(inv: Stripe.Invoice): string | null {
  // Pix avulso dá baixa "fora do Stripe" (paid_out_of_band): a fatura não tem
  // cobrança própria, e a marca fica na metadata (ver settlePixPayment).
  if (inv.metadata?.paid_with === "pix") return "pix";

  const pi = inv.payment_intent;
  if (pi && typeof pi === "object") {
    const charge = pi.latest_charge;
    const doCharge = charge && typeof charge === "object" ? charge.payment_method_details?.type : null;
    if (doCharge) return METODO[doCharge] ?? null;

    const acao = pi.next_action?.type ?? "";
    if (acao.startsWith("boleto")) return "boleto";
    if (acao.startsWith("pix")) return "pix";

    if (pi.payment_method_types?.length === 1) return METODO[pi.payment_method_types[0]] ?? null;
  }
  const aceitos = inv.payment_settings?.payment_method_types ?? [];
  return aceitos.length === 1 ? METODO[aceitos[0]] ?? null : null;
}

/** Lê a fatura no Stripe e grava a projeção. Devolve a organização, ou null. */
export async function mirrorInvoice(
  db: SupabaseClient,
  stripe: Stripe,
  invoiceId: string,
): Promise<string | null> {
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ["payment_intent.latest_charge"],
  });

  const customerId = idOf(inv.customer);
  const orgId = customerId
    ? await organizationOfCustomer(
        db,
        stripe,
        customerId,
        inv.subscription_details?.metadata?.organization_id ?? null,
      )
    : null;
  if (!orgId) {
    console.warn(`[billing] fatura ${inv.id} sem organização — não espelhada`);
    return null;
  }

  const stripeSubId = idOf(inv.subscription);
  let subscriptionRowId: string | null = null;
  if (stripeSubId) {
    const { data } = await db
      .from("billing_subscriptions")
      .select("id")
      .eq("stripe_subscription_id", stripeSubId)
      .maybeSingle();
    subscriptionRowId = (data?.id as string | undefined) ?? null;
  }

  const { error } = await db.from("billing_invoices").upsert(
    {
      organization_id: orgId,
      subscription_id: subscriptionRowId,
      stripe_invoice_id: inv.id,
      number: inv.number ?? null,
      status: STATUS_FATURA[inv.status ?? "draft"] ?? "rascunho",
      payment_method: methodOfInvoice(inv),
      amount_cents: inv.total ?? inv.amount_due ?? 0,
      currency: inv.currency ?? "brl",
      due_at: iso(inv.due_date),
      paid_at: iso(inv.status_transitions?.paid_at),
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf_url: inv.invoice_pdf ?? null,
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (error) throw new Error(`billing_invoices (${inv.id}): ${error.message}`);

  return orgId;
}

/**
 * Pix avulso pago: dá baixa na fatura da assinatura (ADR-0007).
 *
 * O Pix é cobrado num Checkout `mode=payment` separado, criado pela
 * manage-billing com `stripe_invoice_id` na metadata. Pago, a fatura original
 * é quitada com `paid_out_of_band` — o dinheiro entrou por outra cobrança — e
 * marcada com `paid_with = pix`. Idempotente: fatura já paga não é tocada.
 */
export async function settlePixPayment(
  db: SupabaseClient,
  stripe: Stripe,
  sessao: Stripe.Checkout.Session,
): Promise<void> {
  const faturaId = sessao.metadata?.stripe_invoice_id;
  if (!faturaId) return;
  if (sessao.payment_status !== "paid") {
    console.log(`[billing] Pix da fatura ${faturaId} ainda não pago — sem baixa`);
    return;
  }

  const fatura = await stripe.invoices.retrieve(faturaId);
  if (idOf(fatura.customer) !== idOf(sessao.customer)) {
    throw new Error(`sessão ${sessao.id} não é do customer da fatura ${faturaId}`);
  }

  if (fatura.status === "open") {
    await stripe.invoices.update(faturaId, { metadata: { ...fatura.metadata, paid_with: "pix" } });
    await stripe.invoices.pay(faturaId, { paid_out_of_band: true });
    console.log(`[billing] fatura ${faturaId} quitada por Pix avulso (${sessao.id})`);
  }

  const subId = idOf(fatura.subscription);
  if (subId) await mirrorSubscription(db, stripe, subId);
  await mirrorInvoice(db, stripe, faturaId);
}
