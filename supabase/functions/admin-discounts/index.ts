// Desconto e isenção do superadmin (0035).
//
//   POST { action: "apply",  organization_id, percent_off, duration_months, comment }
//   POST { action: "revoke", discount_id, comment }
//
// 100% no prazo é a isenção. O cupom no Stripe é recorrente pelo mesmo número
// de meses. Com assinatura vigente, entra nela; sem assinatura, o próximo
// checkout de `manage-billing` leva o cupom. Sem STRIPE_SECRET_KEY a linha
// fica registrada e a resposta diz que o Stripe não foi atualizado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  adminClient,
  corsHeaders,
  json,
  stripeClient,
  VIGENTES,
} from "../_shared/billing.ts";
import { DescontoInvalido, descontoAindaVigente, validarComentario, validarDesconto } from "../_shared/desconto.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErroDeNegocio extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "desconto",
  ) {
    super(message);
    this.name = "ErroDeNegocio";
  }
}

interface Corpo {
  action?: string;
  organization_id?: string;
  discount_id?: string;
  percent_off?: unknown;
  duration_months?: unknown;
  comment?: unknown;
}

interface DescontoRow {
  id: string;
  organization_id: string;
  percent_off: number;
  duration_months: number;
  stripe_coupon_id: string | null;
  stripe_status: string;
  revoked_at: string | null;
  created_at: string;
}

async function auditar(
  db: ReturnType<typeof adminClient>,
  adminId: string,
  action: string,
  organizationId: string,
  targetId: string,
  after: Record<string, unknown>,
  comment: string,
) {
  const { error } = await db.from("platform_admin_audit_log").insert({
    admin_user_id: adminId,
    action,
    organization_id: organizationId,
    target_type: "billing_discount",
    target_id: targetId,
    after,
    comment,
  });
  if (error) console.error("[admin-discounts] auditoria falhou:", error.message);
}

async function assinaturaParaCupom(db: ReturnType<typeof adminClient>, orgId: string) {
  const { data, error } = await db
    .from("billing_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", orgId)
    .in("status", [...VIGENTES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.stripe_subscription_id ?? null;
}

async function aplicar(db: ReturnType<typeof adminClient>, adminId: string, corpo: Corpo) {
  const orgId = corpo.organization_id ?? "";
  if (!UUID.test(orgId)) throw new ErroDeNegocio("Organização inválida.", 400);
  const campos = validarDesconto({
    percent_off: corpo.percent_off,
    duration_months: corpo.duration_months,
    comment: corpo.comment,
  });

  const { data: org } = await db.from("organizations").select("id").eq("id", orgId).maybeSingle();
  if (!org) throw new ErroDeNegocio("Organização não encontrada.", 404);

  const { data: existentes, error: erroLista } = await db
    .from("billing_discounts")
    .select("id, created_at, duration_months, stripe_status, revoked_at")
    .eq("organization_id", orgId)
    .is("revoked_at", null);
  if (erroLista) throw new Error(erroLista.message);

  const vigente = (existentes ?? []).find(
    (d) => d.stripe_status !== "falhou" && descontoAindaVigente(d.created_at, d.duration_months),
  );
  if (vigente) {
    throw new ErroDeNegocio("Já existe um desconto vigente. Revogue-o antes de aplicar outro.", 409, "desconto_vigente");
  }

  const { data: criado, error: erroInsert } = await db
    .from("billing_discounts")
    .insert({
      organization_id: orgId,
      percent_off: campos.percentOff,
      duration_months: campos.durationMonths,
      comment: campos.comment,
      stripe_status: "pendente",
    })
    .select("id")
    .single();
  if (erroInsert || !criado) throw new Error(erroInsert?.message ?? "insert");

  const stripe = stripeClient();
  if (!stripe) {
    await auditar(db, adminId, "desconto_registrado", orgId, criado.id, { stripe: "sem_chave" }, campos.comment);
    return { id: criado.id, stripe_status: "pendente", stripe: { status: "sem_chave" } };
  }

  try {
    const coupon = await stripe.coupons.create({
      percent_off: campos.percentOff,
      duration: "repeating",
      duration_in_months: campos.durationMonths,
      name: `BrandPlay ${campos.percentOff}% ${campos.durationMonths}m`.slice(0, 40),
      metadata: { organization_id: orgId, discount_id: criado.id },
    });

    const assinatura = await assinaturaParaCupom(db, orgId);
    let stripeStatus = "aguardando_checkout";
    if (assinatura) {
      await stripe.subscriptions.update(assinatura, { coupon: coupon.id });
      stripeStatus = "aplicado";
    }

    const { error: erroUpdate } = await db
      .from("billing_discounts")
      .update({ stripe_coupon_id: coupon.id, stripe_status: stripeStatus })
      .eq("id", criado.id);
    if (erroUpdate) throw new Error(erroUpdate.message);

    await auditar(
      db,
      adminId,
      "desconto_aplicado",
      orgId,
      criado.id,
      { percent_off: campos.percentOff, duration_months: campos.durationMonths, stripe_status: stripeStatus },
      campos.comment,
    );
    return { id: criado.id, stripe_status: stripeStatus, stripe: { status: stripeStatus } };
  } catch (e) {
    await db.from("billing_discounts").update({ stripe_status: "falhou" }).eq("id", criado.id);
    if (e instanceof ErroDeNegocio) throw e;
    console.error("[admin-discounts] stripe:", e instanceof Error ? e.message : String(e));
    throw new ErroDeNegocio("O desconto foi registrado, mas o Stripe não foi atualizado.", 502, "stripe");
  }
}

async function revogar(db: ReturnType<typeof adminClient>, adminId: string, corpo: Corpo) {
  const discountId = corpo.discount_id ?? "";
  if (!UUID.test(discountId)) throw new ErroDeNegocio("Desconto inválido.", 400);
  const comment = validarComentario(corpo.comment);

  const { data, error } = await db.from("billing_discounts").select("*").eq("id", discountId).maybeSingle();
  if (error) throw new Error(error.message);
  const desconto = data as DescontoRow | null;
  if (!desconto) throw new ErroDeNegocio("Desconto não encontrado.", 404);
  if (desconto.revoked_at) return { id: desconto.id, stripe_status: "revogado" };

  const stripe = stripeClient();
  if (stripe && desconto.stripe_coupon_id) {
    const assinatura = await assinaturaParaCupom(db, desconto.organization_id);
    if (assinatura) {
      try {
        await stripe.subscriptions.deleteDiscount(assinatura);
      } catch (e) {
        console.error("[admin-discounts] deleteDiscount:", e instanceof Error ? e.message : String(e));
      }
    }
  }

  const { error: erroUpdate } = await db
    .from("billing_discounts")
    .update({ revoked_at: new Date().toISOString(), stripe_status: "revogado" })
    .eq("id", desconto.id);
  if (erroUpdate) throw new Error(erroUpdate.message);

  await auditar(db, adminId, "desconto_revogado", desconto.organization_id, desconto.id, { stripe_status: "revogado" }, comment);
  return {
    id: desconto.id,
    stripe_status: "revogado",
    stripe: { status: stripe ? "revogado" : "sem_chave" },
  };
}

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

  const db = adminClient();
  const { data: vinculo } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!vinculo) return json({ error: "Acesso restrito ao superadmin da plataforma." }, 403);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  try {
    if (corpo.action === "apply") return json(await aplicar(db, userData.user.id, corpo));
    if (corpo.action === "revoke") return json(await revogar(db, userData.user.id, corpo));
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    if (e instanceof DescontoInvalido) return json({ error: e.message, code: "desconto_invalido" }, 400);
    if (e instanceof ErroDeNegocio) return json({ error: e.message, code: e.code }, e.status);
    console.error("[admin-discounts]", e instanceof Error ? e.message : String(e));
    return json({ error: "Não foi possível concluir o desconto." }, 500);
  }
});
