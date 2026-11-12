// Baixa manual de fatura pela equipe da plataforma (0046, BP-4).
//
//   POST { action: "settle", invoice_id, comment }
//
// `invoice_id` é o id da linha em `billing_invoices`. Só fatura `aberta`. O
// cliente pagou fora do Stripe; a fatura é quitada LÁ (`paid_out_of_band`) e a
// projeção é regravada a partir do Stripe — o banco nunca é editado à mão.
//
// Ordem: JWT → superadmin ou suporte ativo (`platform_admins`) → valida →
// Stripe → projeção → auditoria (`fatura_baixada`). Sem STRIPE_SECRET_KEY a
// baixa é recusada: não há fatura para quitar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, json, settleInvoiceManually, stripeClient } from "../_shared/billing.ts";
import { logContexto } from "../_shared/observabilidade.ts";
import { EntradaInvalida, papelNaPlataforma, validarMotivo, validarUuid } from "../_shared/plataforma.ts";

interface Corpo {
  action?: string;
  invoice_id?: unknown;
  comment?: unknown;
}

interface FaturaRow {
  id: string;
  organization_id: string;
  stripe_invoice_id: string;
  number: string | null;
  status: string;
  amount_cents: number;
  due_at: string | null;
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
  const user = userData.user;

  const db = adminClient();
  let papel: Awaited<ReturnType<typeof papelNaPlataforma>>;
  try {
    papel = await papelNaPlataforma(db, user.id);
  } catch (e) {
    console.error("[admin-invoices] papel:", e instanceof Error ? e.message : String(e));
    return json({ error: "Não foi possível verificar o acesso." }, 500);
  }
  if (!papel) return json({ error: "Acesso restrito à equipe da plataforma." }, 403);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (corpo.action !== "settle") return json({ error: "Ação inválida." }, 400);

  let faturaId: string;
  let motivo: string;
  try {
    faturaId = validarUuid(corpo.invoice_id, "Fatura inválida.");
    motivo = validarMotivo(corpo.comment);
  } catch (e) {
    if (e instanceof EntradaInvalida) return json({ error: e.message, code: "entrada_invalida" }, 400);
    throw e;
  }

  const { data, error } = await db
    .from("billing_invoices")
    .select("id, organization_id, stripe_invoice_id, number, status, amount_cents, due_at")
    .eq("id", faturaId)
    .maybeSingle();
  if (error) {
    console.error("[admin-invoices] leitura:", error.message);
    return json({ error: "Não foi possível ler a fatura." }, 500);
  }
  const fatura = data as FaturaRow | null;
  if (!fatura) return json({ error: "Fatura não encontrada." }, 404);
  logContexto(req, { user_id: user.id, organization_id: fatura.organization_id, code: "admin_invoices_baixa" });

  if (fatura.status !== "aberta") {
    return json({ error: "Só fatura em aberto recebe baixa.", code: "fatura_nao_aberta" }, 409);
  }

  const stripe = stripeClient();
  if (!stripe) return json({ error: "O Stripe não está configurado neste ambiente.", code: "sem_stripe" }, 503);

  let baixa: Awaited<ReturnType<typeof settleInvoiceManually>>;
  try {
    baixa = await settleInvoiceManually(db, stripe, fatura.stripe_invoice_id, user.id);
  } catch (e) {
    console.error("[admin-invoices] stripe:", e instanceof Error ? e.message : String(e));
    return json({ error: "O Stripe recusou a baixa. Nada foi alterado.", code: "stripe" }, 502);
  }
  if (baixa.resultado === "nao_aberta") {
    return json({ error: "No Stripe a fatura não está em aberto.", code: "fatura_nao_aberta" }, 409);
  }

  const { error: erroAuditoria } = await db.from("platform_admin_audit_log").insert({
    admin_user_id: user.id,
    action: "fatura_baixada",
    organization_id: fatura.organization_id,
    target_type: "billing_invoice",
    target_id: fatura.id,
    before: { status: fatura.status, number: fatura.number, amount_cents: fatura.amount_cents, due_at: fatura.due_at },
    after: { status: "paga", resultado: baixa.resultado, papel },
    comment: motivo,
  });
  if (erroAuditoria) console.error("[admin-invoices] auditoria falhou:", erroAuditoria.message);

  return json({ id: fatura.id, resultado: baixa.resultado });
});
