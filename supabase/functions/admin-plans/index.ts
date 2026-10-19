// Gestão do catálogo de planos pelo superadmin (ADR-0008, fase C).
//
//   POST { action: "create", plan: {...}, comment? }            → { plan, stripe }
//   POST { action: "update", plan_id, plan: {...}, comment? }   → { plan, stripe }
//   POST { action: "sync",   plan_id }                          → { plan, stripe }
//
// A leitura do catálogo não passa por aqui: `billing_plans` é de leitura
// pública (0024). Escrever só por aqui, porque o Stripe acompanha o catálogo.
//
// Ordem: JWT → superadmin ativo (`platform_admins`) → valida → grava
// `billing_plans` → sincroniza o Stripe → audita. O banco é a fonte da regra
// comercial (ADR-0007); o Stripe só espelha produto e preço. Se o Stripe
// falhar depois da gravação, a resposta diz, e "Sincronizar" ou o próximo
// checkout refazem — `ensurePlanPrice` confere o preço a cada uso.
//
// Preço no Stripe é imutável: preço novo cria outro e arquiva o anterior.
// Assinaturas em curso continuam no preço antigo. Plano fora de venda arquiva
// o produto; quem já assina continua nele.
//
// Plano não é apagado: assinaturas e faturas apontam para ele. Tirar de venda
// é `active = false`.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  adminClient,
  archivePlanProduct,
  type CatalogPlan,
  corsHeaders,
  ensurePlanPrice,
  json,
  stripeClient,
} from "../_shared/billing.ts";

const ID_DO_PLANO = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const PRECO_MAXIMO = 100_000_000; // R$ 1 milhão por mês: acima disso é erro de digitação.

type Acao = "create" | "update" | "sync";
const ACOES: Acao[] = ["create", "update", "sync"];

interface PlanoRow extends CatalogPlan {
  features: string[];
  highlight: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type CamposEditaveis = Pick<
  PlanoRow,
  "name" | "description" | "price_cents" | "max_properties" | "max_users" | "features" | "highlight" | "active" | "sort_order"
>;

interface Corpo {
  action?: string;
  plan_id?: string;
  plan?: Record<string, unknown>;
  comment?: string;
}

interface ResultadoStripe {
  status: "sincronizado" | "inalterado" | "arquivado" | "sem_preco" | "nao_configurado" | "falhou";
  message?: string;
}

class ErroDeNegocio extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

// ─── Validação ───────────────────────────────────────────────────────
function inteiroOuNulo(valor: unknown, campo: string, min: number, max: number): number | null {
  if (valor === null) return null;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErroDeNegocio(`${campo}: informe um inteiro entre ${min} e ${max}, ou vazio para sem limite.`, 400);
  }
  return valor;
}

/**
 * Valida os campos recebidos. Em `create`, nome é obrigatório e os demais têm
 * padrão; em `update`, só o que veio é validado e alterado.
 */
function validarCampos(entrada: Record<string, unknown>, criando: boolean): Partial<CamposEditaveis> {
  const campos: Partial<CamposEditaveis> = {};

  if ("name" in entrada || criando) {
    const nome = typeof entrada.name === "string" ? entrada.name.trim() : "";
    if (nome.length < 2 || nome.length > 60) throw new ErroDeNegocio("Nome: de 2 a 60 caracteres.", 400);
    campos.name = nome;
  }
  if ("description" in entrada) {
    const descricao = typeof entrada.description === "string" ? entrada.description.trim() : "";
    if (descricao.length > 300) throw new ErroDeNegocio("Descrição: até 300 caracteres.", 400);
    campos.description = descricao;
  }
  if ("price_cents" in entrada) {
    // Nulo = "sob consulta": aparece no catálogo, sem checkout.
    campos.price_cents = inteiroOuNulo(entrada.price_cents, "Preço (centavos)", 100, PRECO_MAXIMO);
  }
  if ("max_properties" in entrada) {
    campos.max_properties = inteiroOuNulo(entrada.max_properties, "Propriedades", 0, 100_000);
  }
  if ("max_users" in entrada) {
    campos.max_users = inteiroOuNulo(entrada.max_users, "Usuários", 1, 100_000);
  }
  if ("features" in entrada) {
    const lista = entrada.features;
    if (
      !Array.isArray(lista) ||
      lista.length > 20 ||
      lista.some((f) => typeof f !== "string" || f.trim().length === 0 || f.trim().length > 80)
    ) {
      throw new ErroDeNegocio("Recursos: até 20 itens, cada um com até 80 caracteres.", 400);
    }
    campos.features = (lista as string[]).map((f) => f.trim());
  }
  for (const campo of ["highlight", "active"] as const) {
    if (campo in entrada) {
      if (typeof entrada[campo] !== "boolean") throw new ErroDeNegocio(`${campo}: verdadeiro ou falso.`, 400);
      campos[campo] = entrada[campo] as boolean;
    }
  }
  if ("sort_order" in entrada) {
    const ordem = entrada.sort_order;
    if (typeof ordem !== "number" || !Number.isInteger(ordem) || ordem < 0 || ordem > 10_000) {
      throw new ErroDeNegocio("Ordem: inteiro entre 0 e 10000.", 400);
    }
    campos.sort_order = ordem;
  }
  return campos;
}

// ─── Banco ───────────────────────────────────────────────────────────
async function lerPlano(db: SupabaseClient, planId: string): Promise<PlanoRow> {
  const { data, error } = await db.from("billing_plans").select("*").eq("id", planId).maybeSingle();
  if (error) throw new Error(`billing_plans: ${error.message}`);
  if (!data) throw new ErroDeNegocio("Plano não encontrado.", 404);
  return data as PlanoRow;
}

async function auditar(
  db: SupabaseClient,
  adminId: string,
  acao: string,
  planId: string,
  antes: PlanoRow | null,
  depois: PlanoRow,
  comentario: string | undefined,
) {
  const { error } = await db.from("platform_admin_audit_log").insert({
    admin_user_id: adminId,
    action: acao,
    target_type: "billing_plan",
    target_id: planId,
    before: antes,
    after: depois,
    comment: comentario?.trim() || null,
  });
  // A alteração já foi gravada; auditoria que falha precisa aparecer no log.
  if (error) console.error(`[admin-plans] auditoria de ${acao} (${planId}) falhou: ${error.message}`);
}

// ─── Stripe ──────────────────────────────────────────────────────────
async function sincronizarStripe(db: SupabaseClient, plano: PlanoRow): Promise<ResultadoStripe> {
  const stripe = stripeClient();
  if (!stripe) return { status: "nao_configurado" };
  try {
    if (!plano.active) {
      await archivePlanProduct(stripe, plano.stripe_product_id);
      return { status: "arquivado" };
    }
    if (plano.price_cents == null) return { status: "sem_preco" };
    await ensurePlanPrice(db, stripe, plano);
    return { status: "sincronizado" };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[admin-plans] Stripe do plano ${plano.id} falhou: ${mensagem}`);
    return {
      status: "falhou",
      message: "O plano foi salvo, mas o Stripe não foi atualizado. Use Sincronizar; o próximo checkout também refaz.",
    };
  }
}

// ─── Ações ───────────────────────────────────────────────────────────
async function criar(db: SupabaseClient, adminId: string, corpo: Corpo) {
  const entrada = corpo.plan ?? {};
  const id = typeof entrada.id === "string" ? entrada.id.trim() : "";
  if (!ID_DO_PLANO.test(id)) {
    throw new ErroDeNegocio(
      "Identificador: de 2 a 40 caracteres, minúsculas, números, - ou _. É a chave do plano no checkout e no Stripe, e não muda depois.",
      400,
    );
  }
  const campos = validarCampos(entrada, true);

  const { data, error } = await db
    .from("billing_plans")
    .insert({ id, ...campos })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") throw new ErroDeNegocio("Já existe um plano com este identificador.", 409, "plano_existente");
    throw new Error(`billing_plans: ${error.message}`);
  }

  const stripe = await sincronizarStripe(db, data as PlanoRow);
  const plano = await lerPlano(db, id);
  await auditar(db, adminId, "plano_criado", id, null, plano, corpo.comment);
  return { plan: plano, stripe };
}

async function alterar(db: SupabaseClient, adminId: string, corpo: Corpo) {
  const planId = corpo.plan_id ?? "";
  if (!ID_DO_PLANO.test(planId)) throw new ErroDeNegocio("Informe o plano.", 400);
  const antes = await lerPlano(db, planId);
  const campos = validarCampos(corpo.plan ?? {}, false);
  if (Object.keys(campos).length === 0) throw new ErroDeNegocio("Nada para alterar.", 400);

  if (campos.active === false && antes.active) {
    // O teste grátis usa os limites deste plano (billing_settings). Tirá-lo de
    // venda deixaria quem está em teste num plano que não pode contratar.
    const { data: parametros } = await db.from("billing_settings").select("trial_plan_id").maybeSingle();
    if (parametros?.trial_plan_id === planId) {
      throw new ErroDeNegocio(
        "Este é o plano do teste grátis. Troque o plano do teste antes de tirá-lo de venda.",
        409,
        "plano_do_teste",
      );
    }
  }

  const { data, error } = await db.from("billing_plans").update(campos).eq("id", planId).select("*").single();
  if (error) throw new Error(`billing_plans: ${error.message}`);

  // Só vai ao Stripe o que ele espelha: nome, descrição, preço, limites e
  // se está à venda.
  const espelhados: (keyof CamposEditaveis)[] = ["name", "description", "price_cents", "max_properties", "max_users", "active"];
  const mudouNoStripe = espelhados.some((c) => c in campos && campos[c] !== antes[c]);
  const stripe: ResultadoStripe = mudouNoStripe
    ? await sincronizarStripe(db, data as PlanoRow)
    : { status: "inalterado" };

  const plano = await lerPlano(db, planId);
  await auditar(db, adminId, "plano_alterado", planId, antes, plano, corpo.comment);
  return { plan: plano, stripe };
}

async function sincronizar(db: SupabaseClient, adminId: string, corpo: Corpo) {
  const planId = corpo.plan_id ?? "";
  if (!ID_DO_PLANO.test(planId)) throw new ErroDeNegocio("Informe o plano.", 400);
  const antes = await lerPlano(db, planId);
  const stripe = await sincronizarStripe(db, antes);
  const plano = await lerPlano(db, planId);
  await auditar(db, adminId, "plano_sincronizado", planId, antes, plano, corpo.comment);
  return { plan: plano, stripe };
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

  const db = adminClient();

  // O papel vem do banco, para o usuário do JWT — nunca do corpo.
  const { data: vinculo } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!vinculo) return json({ error: "Acesso restrito ao superadmin da plataforma." }, 403);

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  const acao = corpo.action as Acao;
  if (!ACOES.includes(acao)) return json({ error: "Ação inválida." }, 400);
  if (corpo.plan !== undefined && (typeof corpo.plan !== "object" || corpo.plan === null || Array.isArray(corpo.plan))) {
    return json({ error: "Plano inválido." }, 400);
  }

  try {
    let resultado: unknown;
    switch (acao) {
      case "create":
        resultado = await criar(db, user.id, corpo);
        break;
      case "update":
        resultado = await alterar(db, user.id, corpo);
        break;
      case "sync":
        resultado = await sincronizar(db, user.id, corpo);
        break;
    }
    console.log(`[admin-plans] ${acao} ok — plano ${corpo.plan_id ?? corpo.plan?.id ?? "?"}, superadmin ${user.id}`);
    return json(resultado);
  } catch (e) {
    if (e instanceof ErroDeNegocio) return json({ error: e.message, code: e.code }, e.status);
    const mensagem = e instanceof Error ? e.message : String(e);
    console.error(`[admin-plans] ${acao} falhou:`, mensagem);
    return json({ error: "Não foi possível salvar o plano. Tente de novo em instantes." }, 500);
  }
});
