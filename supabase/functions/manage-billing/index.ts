// Gestão da cobrança da organização pelo portal (ADR-0007).
//
//   POST { action: "checkout",    organization_id, plan_id }  → { url }
//   POST { action: "change_plan", organization_id, plan_id }  → { ok }
//   POST { action: "cancel",      organization_id }           → { ok, current_period_end }
//   POST { action: "resume",      organization_id }           → { ok }
//   POST { action: "portal",      organization_id }           → { url }
//   POST { action: "sync",        organization_id }           → { ok, subscriptions, invoices }
//   POST { action: "pay_pix",     organization_id, invoice_id } → { url }
//   POST { action: "request_provisional_access", organization_id, receipt_path, confirm_paid }
//                                                              → { ok, expires_at }
//
// Quem chama vem do JWT; o `organization_id` do corpo só diz QUAL organização,
// e é conferido contra `organization_members`: precisa ser owner/admin ativo.
// As URLs de retorno do Stripe vêm de APP_URL, nunca do corpo — quem chama não
// escolhe para onde o checkout devolve.
//
// Erros que a tela trata têm `code`: assinatura_vigente, uso_excede_plano,
// sem_assinatura, cobranca_nao_configurada, portal_nao_configurado,
// pix_indisponivel, nao_elegivel, ja_utilizado.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  adminClient,
  corsHeaders,
  cupomDeDescontoVigente,
  ensurePlanPrice,
  idOf,
  json,
  methodOfInvoice,
  mirrorInvoice,
  mirrorSubscription,
  Stripe,
  stripeClient,
  VIGENTES,
} from "../_shared/billing.ts";

const BUCKET_COMPROVANTES = "billing-receipts";

// Dias até o vencimento do boleto. O padrão do Stripe é 3; explícito porque o
// prazo aparece para o cliente e define quando a fatura expira.
const BOLETO_EXPIRA_EM_DIAS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Acao =
  | "checkout"
  | "change_plan"
  | "cancel"
  | "resume"
  | "portal"
  | "sync"
  | "pay_pix"
  | "request_provisional_access";
const ACOES: Acao[] = [
  "checkout",
  "change_plan",
  "cancel",
  "resume",
  "portal",
  "sync",
  "pay_pix",
  "request_provisional_access",
];

interface Corpo {
  action?: string;
  organization_id?: string;
  plan_id?: string;
  invoice_id?: string;
  receipt_path?: string;
  confirm_paid?: boolean;
}

interface Plano {
  id: string;
  name: string;
  description: string;
  price_cents: number | null;
  max_properties: number | null;
  max_users: number | null;
  active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
}

interface Assinatura {
  id: string;
  plan_id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  stripe_subscription_id: string;
}

class ErroDeNegocio extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

// ─── Leituras ────────────────────────────────────────────────────────
async function planoAVenda(db: SupabaseClient, planId: string | undefined): Promise<Plano> {
  if (!planId) throw new ErroDeNegocio("Informe o plano.", 400);
  const { data } = await db.from("billing_plans").select("*").eq("id", planId).eq("active", true).maybeSingle();
  if (!data) throw new ErroDeNegocio("Plano inválido ou fora de venda.", 400);
  if (data.price_cents == null) {
    throw new ErroDeNegocio("Este plano é contratado com o time comercial.", 400);
  }
  return data as Plano;
}

async function assinaturaVigente(db: SupabaseClient, orgId: string): Promise<Assinatura | null> {
  const { data } = await db
    .from("billing_subscriptions")
    .select("id, plan_id, status, cancel_at_period_end, current_period_end, stripe_subscription_id")
    .eq("organization_id", orgId)
    .in("status", VIGENTES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Assinatura | null) ?? null;
}

/** Recusa contratar ou trocar para um plano menor que o uso atual. */
async function exigirQueOPlanoComporte(db: SupabaseClient, orgId: string, plano: Plano) {
  const { data, error } = await db.rpc("billing_usage", { _org_id: orgId }).single();
  if (error || !data) throw new Error(`billing_usage: ${error?.message ?? "sem dados"}`);
  const uso = data as { properties: number; users_active: number; invites_pending: number };

  const excessos: string[] = [];
  if (plano.max_properties != null && uso.properties > plano.max_properties) {
    excessos.push(`${uso.properties} propriedades (o plano permite ${plano.max_properties})`);
  }
  const usuarios = uso.users_active + uso.invites_pending;
  if (plano.max_users != null && usuarios > plano.max_users) {
    excessos.push(`${usuarios} usuários, contando convites pendentes (o plano permite ${plano.max_users})`);
  }
  if (excessos.length > 0) {
    throw new ErroDeNegocio(
      `O plano ${plano.name} não comporta o uso atual: ${excessos.join(" e ")}.`,
      409,
      "uso_excede_plano",
    );
  }
}

// ─── Stripe: customer ────────────────────────────────────────────────

/** Customer da organização no Stripe, criado na primeira contratação. */
async function garantirCustomer(
  db: SupabaseClient,
  stripe: Stripe,
  orgId: string,
  emailDeQuemContrata: string | undefined,
): Promise<string> {
  await db.rpc("billing_ensure_account", { _org_id: orgId });
  const { data: conta } = await db
    .from("billing_accounts")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .single();

  const atual = conta?.stripe_customer_id as string | null;
  if (atual) {
    try {
      const customer = await stripe.customers.retrieve(atual);
      if (!("deleted" in customer && customer.deleted)) return atual;
    } catch {
      // Customer que não existe mais nesta conta do Stripe (troca de chave,
      // ambiente de teste refeito): cria outro abaixo e substitui.
    }
  }

  const { data: org } = await db
    .from("organizations")
    .select("name, legal_name, email")
    .eq("id", orgId)
    .single();

  const customer = await stripe.customers.create(
    {
      name: org?.legal_name || org?.name || undefined,
      email: org?.email || emailDeQuemContrata,
      metadata: { organization_id: orgId },
    },
    // Duas abas contratando ao mesmo tempo recebem o mesmo customer.
    atual ? undefined : { idempotencyKey: `brandplay-customer-${orgId}` },
  );

  await db.from("billing_accounts").update({ stripe_customer_id: customer.id }).eq("organization_id", orgId);
  return customer.id;
}

// ─── Ações ───────────────────────────────────────────────────────────
async function checkout(
  db: SupabaseClient,
  stripe: Stripe,
  orgId: string,
  planId: string | undefined,
  email: string | undefined,
  appUrl: string,
) {
  const plano = await planoAVenda(db, planId);

  // Uma assinatura vigente por organização. O banco garante por índice, mas
  // lá o cliente já teria pago quando a duplicidade fosse recusada.
  const vigente = await assinaturaVigente(db, orgId);
  if (vigente) {
    throw new ErroDeNegocio(
      vigente.status === "incompleta"
        ? "Já existe uma contratação aguardando pagamento. Pague o boleto ou cancele a tentativa antes de contratar de novo."
        : "Esta organização já tem uma assinatura. Para mudar de plano, use a troca de plano.",
      409,
      "assinatura_vigente",
    );
  }

  await exigirQueOPlanoComporte(db, orgId, plano);

  const customerId = await garantirCustomer(db, stripe, orgId, email);
  const priceId = await ensurePlanPrice(db, stripe, plano);
  const cupom = await cupomDeDescontoVigente(db, orgId);

  // Cartão e boleto. Pix recorrente no Stripe exige Pix Automático, que não
  // está disponível para contas brasileiras (ADR-0007).
  // O cupom, quando existe, é o desconto do superadmin (0035). Não combina
  // com código promocional digitado pelo cliente.
  const sessao = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: orgId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_types: ["card", "boleto"],
    payment_method_options: { boleto: { expires_after_days: BOLETO_EXPIRA_EM_DIAS } },
    // Boleto exige CPF/CNPJ e endereço completo do pagador.
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    // Obrigatório ao coletar tax id e endereço de um customer que já existe.
    customer_update: { name: "auto", address: "auto" },
    locale: "pt-BR",
    metadata: { organization_id: orgId, plan_id: plano.id },
    subscription_data: { metadata: { organization_id: orgId, plan_id: plano.id } },
    ...(cupom ? { discounts: [{ coupon: cupom }] } : {}),
    success_url: `${appUrl}/dashboard/plano?checkout=sucesso`,
    cancel_url: `${appUrl}/dashboard/plano?checkout=cancelado`,
  });

  return { url: sessao.url };
}

async function trocarPlano(db: SupabaseClient, stripe: Stripe, orgId: string, planId: string | undefined) {
  const plano = await planoAVenda(db, planId);
  const vigente = await assinaturaVigente(db, orgId);
  if (!vigente || vigente.status !== "ativa") {
    throw new ErroDeNegocio("A troca de plano exige uma assinatura ativa.", 409, "sem_assinatura");
  }
  if (vigente.plan_id === plano.id) throw new ErroDeNegocio("Este já é o plano atual.", 400);

  await exigirQueOPlanoComporte(db, orgId, plano);

  const priceId = await ensurePlanPrice(db, stripe, plano);
  const atual = await stripe.subscriptions.retrieve(vigente.stripe_subscription_id);
  const item = atual.items.data[0];
  if (!item) throw new Error(`assinatura ${atual.id} sem item`);

  // Proporcional: a diferença entra na próxima fatura (padrão do Stripe).
  await stripe.subscriptions.update(atual.id, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { ...atual.metadata, organization_id: orgId, plan_id: plano.id },
  });
  await mirrorSubscription(db, stripe, atual.id);
  return { ok: true };
}

async function cancelar(db: SupabaseClient, stripe: Stripe, orgId: string) {
  const vigente = await assinaturaVigente(db, orgId);
  if (!vigente) throw new ErroDeNegocio("Não há assinatura para cancelar.", 409, "sem_assinatura");

  if (vigente.status === "incompleta") {
    // Contratação que não chegou a ser paga: cancela já, para liberar uma nova
    // tentativa (com outro método, por exemplo).
    await stripe.subscriptions.cancel(vigente.stripe_subscription_id);
  } else {
    // Assinatura paga: o acesso segue até o fim do período já pago.
    await stripe.subscriptions.update(vigente.stripe_subscription_id, { cancel_at_period_end: true });
  }
  await mirrorSubscription(db, stripe, vigente.stripe_subscription_id);

  const depois = await assinaturaVigente(db, orgId);
  return { ok: true, current_period_end: depois?.current_period_end ?? null };
}

async function retomar(db: SupabaseClient, stripe: Stripe, orgId: string) {
  const vigente = await assinaturaVigente(db, orgId);
  if (!vigente || !vigente.cancel_at_period_end) {
    throw new ErroDeNegocio("Não há cancelamento agendado para desfazer.", 409, "sem_assinatura");
  }
  await stripe.subscriptions.update(vigente.stripe_subscription_id, { cancel_at_period_end: false });
  await mirrorSubscription(db, stripe, vigente.stripe_subscription_id);
  return { ok: true };
}

async function portal(db: SupabaseClient, stripe: Stripe, orgId: string, appUrl: string) {
  const { data: conta } = await db
    .from("billing_accounts")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!conta?.stripe_customer_id) {
    throw new ErroDeNegocio("Esta organização ainda não tem cobrança no Stripe.", 409, "sem_assinatura");
  }
  try {
    const sessao = await stripe.billingPortal.sessions.create({
      customer: conta.stripe_customer_id as string,
      return_url: `${appUrl}/dashboard/plano`,
      locale: "pt-BR",
    });
    return { url: sessao.url };
  } catch (e) {
    // O portal do cliente precisa ser configurado uma vez no Dashboard.
    if (e instanceof Error && /configuration/i.test(e.message)) {
      throw new ErroDeNegocio("O portal de pagamento ainda não foi configurado no Stripe.", 503, "portal_nao_configurado");
    }
    throw e;
  }
}

/**
 * Relê no Stripe as assinaturas e faturas da organização e regrava a
 * projeção. Corrige o que um webhook perdido deixou para trás — é o "Verificar
 * pagamento" da tela.
 */
async function sincronizar(db: SupabaseClient, stripe: Stripe, orgId: string) {
  const { data: conta } = await db
    .from("billing_accounts")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  const customerId = conta?.stripe_customer_id as string | null;
  if (!customerId) return { ok: true, subscriptions: 0, invoices: 0 };

  const assinaturas = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  // Mais antigas primeiro: a vigente é gravada por último e não esbarra no
  // índice de "uma vigente por organização".
  for (const sub of [...assinaturas.data].reverse()) {
    await mirrorSubscription(db, stripe, sub.id);
  }

  const faturas = await stripe.invoices.list({ customer: customerId, limit: 12 });
  for (const fatura of faturas.data) {
    await mirrorInvoice(db, stripe, fatura.id);
  }

  return { ok: true, subscriptions: assinaturas.data.length, invoices: faturas.data.length };
}

/**
 * Pix avulso de uma fatura em aberto (ADR-0007). A assinatura cobra em cartão
 * ou boleto; pagar no Pix é um Checkout `mode=payment` à parte, e o webhook dá
 * baixa na fatura quando ele é pago (`settlePixPayment`).
 */
async function pagarComPix(
  db: SupabaseClient,
  stripe: Stripe,
  orgId: string,
  invoiceId: string | undefined,
  appUrl: string,
) {
  if (!invoiceId || !UUID.test(invoiceId)) throw new ErroDeNegocio("Informe a fatura.", 400);

  // A fatura precisa ser da própria organização: o id vem da tela.
  const { data: linha } = await db
    .from("billing_invoices")
    .select("stripe_invoice_id")
    .eq("id", invoiceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!linha) throw new ErroDeNegocio("Fatura não encontrada.", 404);

  const fatura = await stripe.invoices.retrieve(linha.stripe_invoice_id as string);
  if (fatura.status !== "open") throw new ErroDeNegocio("Esta fatura não está em aberto.", 409);
  if (!fatura.amount_due || fatura.amount_due <= 0) throw new ErroDeNegocio("Fatura sem valor a pagar.", 409);

  try {
    const sessao = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: idOf(fatura.customer) ?? undefined,
      client_reference_id: orgId,
      payment_method_types: ["pix"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: fatura.currency || "brl",
            unit_amount: fatura.amount_due,
            product_data: { name: `Fatura ${fatura.number ?? fatura.id} — BrandPlay` },
          },
        },
      ],
      locale: "pt-BR",
      // O webhook usa esta metadata para dar baixa na fatura certa.
      metadata: { organization_id: orgId, stripe_invoice_id: fatura.id },
      payment_intent_data: { metadata: { organization_id: orgId, stripe_invoice_id: fatura.id } },
      success_url: `${appUrl}/dashboard/plano?pix=sucesso`,
      cancel_url: `${appUrl}/dashboard/plano?pix=cancelado`,
    });
    return { url: sessao.url };
  } catch (e) {
    // Pix precisa ser habilitado na conta do Stripe (para contas brasileiras,
    // por convite). Sem isso a API recusa o método.
    if (e instanceof Error && /pix is invalid|type provided: pix/i.test(e.message)) {
      throw new ErroDeNegocio("Pix não está disponível nesta conta de pagamento.", 503, "pix_indisponivel");
    }
    throw e;
  }
}

/**
 * Liberação provisória em confiança enquanto o boleto compensa (0025).
 *
 * Regras: a organização está sem acesso; há uma contratação aguardando
 * pagamento cuja fatura em aberto é de boleto (conferido NO STRIPE, que é a
 * fonte — a projeção pode estar atrasada justamente agora); o comprovante já
 * foi enviado ao bucket; quem pede declara que pagou; uma vez por fatura.
 */
async function liberarProvisoriamente(
  db: SupabaseClient,
  stripe: Stripe,
  orgId: string,
  userId: string,
  receiptPath: string | undefined,
  confirmouPagamento: boolean | undefined,
) {
  if (confirmouPagamento !== true) {
    throw new ErroDeNegocio("Confirme que o boleto já foi pago.", 400);
  }
  if (!receiptPath || !receiptPath.startsWith(`${orgId}/`) || receiptPath.includes("..")) {
    throw new ErroDeNegocio("Anexe o comprovante de pagamento.", 400);
  }

  const pasta = receiptPath.slice(0, receiptPath.lastIndexOf("/"));
  const arquivo = receiptPath.slice(receiptPath.lastIndexOf("/") + 1);
  const { data: encontrados } = await db.storage.from(BUCKET_COMPROVANTES).list(pasta, { search: arquivo });
  if (!encontrados?.some((o) => o.name === arquivo)) {
    throw new ErroDeNegocio("Comprovante não encontrado. Envie o arquivo de novo.", 400);
  }

  const { data: plano } = await db.rpc("billing_access_plan", { _org_id: orgId });
  if (plano && (plano as { id: string | null }).id) {
    throw new ErroDeNegocio("A organização já tem acesso.", 409, "nao_elegivel");
  }

  const vigente = await assinaturaVigente(db, orgId);
  if (!vigente || vigente.status !== "incompleta") {
    throw new ErroDeNegocio(
      "A liberação provisória vale só para contratação por boleto aguardando compensação.",
      409,
      "nao_elegivel",
    );
  }

  const sub = await stripe.subscriptions.retrieve(vigente.stripe_subscription_id, {
    expand: ["latest_invoice.payment_intent.latest_charge"],
  });
  const fatura = sub.latest_invoice;
  if (!fatura || typeof fatura !== "object" || fatura.status !== "open" || methodOfInvoice(fatura) !== "boleto") {
    throw new ErroDeNegocio(
      "A liberação provisória vale só quando a fatura em aberto é um boleto.",
      409,
      "nao_elegivel",
    );
  }

  const { data: parametros } = await db.from("billing_settings").select("provisional_access_hours").single();
  const horas = (parametros?.provisional_access_hours as number | undefined) ?? 72;
  const expiraEm = new Date(Date.now() + horas * 3_600_000).toISOString();

  const { error } = await db.from("billing_access_grants").insert({
    organization_id: orgId,
    kind: "confianca",
    stripe_invoice_id: fatura.id,
    receipt_path: receiptPath,
    granted_by: userId,
    expires_at: expiraEm,
  });
  if (error) {
    if (error.code === "23505") {
      throw new ErroDeNegocio(
        "A liberação provisória desta fatura já foi usada. Aguarde a compensação do boleto.",
        409,
        "ja_utilizado",
      );
    }
    throw new Error(`billing_access_grants: ${error.message}`);
  }

  await mirrorInvoice(db, stripe, fatura.id);
  console.log(`[manage-billing] liberação provisória até ${expiraEm} — org ${orgId}, fatura ${fatura.id}`);
  return { ok: true, expires_at: expiraEm };
}

// ─── Entrada ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado." }, 401);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Não autenticado." }, 401);
  const user = userData.user;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  const acao = corpo.action as Acao;
  if (!ACOES.includes(acao)) return json({ error: "Ação inválida." }, 400);
  const orgId = corpo.organization_id ?? "";
  if (!UUID.test(orgId)) return json({ error: "organization_id inválido." }, 400);

  const db = adminClient();

  // Escopo: a organização é a do corpo, mas só vale se quem chama for
  // owner/admin ativo nela.
  const { data: membro } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "ativo")
    .maybeSingle();
  if (!membro || !["owner", "admin"].includes(membro.role as string)) {
    return json({ error: "Só o proprietário ou um administrador gerencia a cobrança." }, 403);
  }

  const stripe = stripeClient();
  if (!stripe) {
    return json(
      { error: "Cobrança não configurada neste ambiente.", code: "cobranca_nao_configurada" },
      503,
    );
  }

  const appUrl = (Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "").replace(/\/+$/, "");
  if (!appUrl && (acao === "checkout" || acao === "portal" || acao === "pay_pix")) {
    console.error("[manage-billing] APP_URL/SITE_URL ausente");
    return json({ error: "Cobrança não configurada neste ambiente.", code: "cobranca_nao_configurada" }, 503);
  }

  try {
    let resultado: unknown;
    switch (acao) {
      case "checkout":
        resultado = await checkout(db, stripe, orgId, corpo.plan_id, user.email, appUrl);
        break;
      case "change_plan":
        resultado = await trocarPlano(db, stripe, orgId, corpo.plan_id);
        break;
      case "cancel":
        resultado = await cancelar(db, stripe, orgId);
        break;
      case "resume":
        resultado = await retomar(db, stripe, orgId);
        break;
      case "portal":
        resultado = await portal(db, stripe, orgId, appUrl);
        break;
      case "sync":
        resultado = await sincronizar(db, stripe, orgId);
        break;
      case "pay_pix":
        resultado = await pagarComPix(db, stripe, orgId, corpo.invoice_id, appUrl);
        break;
      case "request_provisional_access":
        resultado = await liberarProvisoriamente(db, stripe, orgId, user.id, corpo.receipt_path, corpo.confirm_paid);
        break;
    }
    console.log(`[manage-billing] ${acao} ok — org ${orgId}, usuário ${user.id}`);
    return json(resultado);
  } catch (e) {
    if (e instanceof ErroDeNegocio) {
      return json({ error: e.message, code: e.code }, e.status);
    }
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[manage-billing] ${acao} falhou — org ${orgId}:`, mensagem);
    return json({ error: "Não foi possível concluir a operação de cobrança. Tente de novo em instantes." }, 500);
  }
});
