// Cadastro de Suporte pelo superadmin (0046, BP-4).
//
//   POST { action: "add", email, full_name, password, comment }
//
// Ordem: JWT → superadmin ativo (`platform_admins`, role superadmin) → valida →
// pré-cadastro (a conta nova não ganha organização pessoal) → cria a conta,
// se ainda não existe → concede o perfil Suporte.
//
// O pré-cadastro e a concessão rodam com o JWT de quem chama: as funções SQL
// (`admin_equipe_pre_cadastro`, `admin_equipe_conceder_suporte`) recusam quem
// não é superadmin e nunca gravam superadmin. A service role só cria a conta.
//
// Conta que já existe mantém a senha dela: a senha temporária só vale para
// conta nova. Revogar e reativar não passam por aqui (RPC direta).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminClient, corsHeaders, json } from "../_shared/billing.ts";
import { logContexto } from "../_shared/observabilidade.ts";
import { contaJaExiste, EntradaInvalida, papelNaPlataforma, validarNovoSuporte } from "../_shared/plataforma.ts";

interface Corpo {
  action?: string;
  email?: unknown;
  full_name?: unknown;
  password?: unknown;
  comment?: unknown;
}

/** Erro das funções SQL: SQLSTATE → status HTTP, com a mensagem delas. */
function erroDoBanco(erro: { code?: string; message?: string }): Response {
  const status = erro.code === "42501" ? 403 : erro.code === "P0002" ? 404 : erro.code === "23514" ? 409 : 500;
  if (status === 500) {
    console.error("[admin-team] banco:", erro.message ?? "erro");
    return json({ error: "Não foi possível concluir o cadastro." }, 500);
  }
  return json({ error: erro.message ?? "Não foi possível concluir o cadastro.", code: erro.code }, status);
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
    console.error("[admin-team] papel:", e instanceof Error ? e.message : String(e));
    return json({ error: "Não foi possível verificar o acesso." }, 500);
  }
  if (papel !== "superadmin") return json({ error: "Acesso restrito ao superadmin da plataforma." }, 403);
  logContexto(req, { user_id: user.id, code: "admin_team" });

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (corpo.action !== "add") return json({ error: "Ação inválida." }, 400);

  let novo: ReturnType<typeof validarNovoSuporte>;
  try {
    novo = validarNovoSuporte(corpo);
  } catch (e) {
    if (e instanceof EntradaInvalida) return json({ error: e.message, code: "entrada_invalida" }, 400);
    throw e;
  }

  const pre = await userClient.rpc("admin_equipe_pre_cadastro", { _email: novo.email });
  if (pre.error) return erroDoBanco(pre.error);

  let conta: "nova" | "existente" = "nova";
  const { error: createErr } = await db.auth.admin.createUser({
    email: novo.email,
    password: novo.senha,
    email_confirm: true,
    user_metadata: { full_name: novo.nome },
  });
  if (createErr) {
    if (!contaJaExiste(createErr as { status?: number; code?: string; message?: string })) {
      console.error("[admin-team] createUser:", createErr.message);
      return json({ error: "Não foi possível criar a conta." }, 500);
    }
    conta = "existente";
  }

  const concessao = await userClient.rpc("admin_equipe_conceder_suporte", {
    _email: novo.email,
    _comentario: novo.motivo,
  });
  if (concessao.error) return erroDoBanco(concessao.error);

  return json({ user_id: concessao.data, conta });
});
