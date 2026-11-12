// Registra uma falha de banco vista pelo portal (`logBackendDbError`).
//
// O registro vai para `backend_error_logs`, que só o superadmin lê (0045, tela
// /admin/logs-falhas). O usuário vem do JWT; a organização enviada só fica se
// ele for membro ativo dela; texto livre tem teto (`_shared/logs_de_falha.ts`).
// O log do processo leva só o contexto (`logContexto`) e o código do erro:
// e-mail e o erro bruto ficam na tabela, não no stdout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logContexto } from "../_shared/observabilidade.ts";
import {
  acaoNormalizada,
  chavesNormalizadas,
  LIMITES,
  linhaNormalizada,
  organizacaoConfirmada,
  textoLimitado,
} from "../_shared/logs_de_falha.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_TABLES = new Set([
  "organizations",
  "organization_members",
  "opportunities",
  "sports_properties",
  "sponsors",
  "profiles",
]);

type PolicyDebugRow = {
  policyname?: string;
  cmd?: string;
  roles?: string[];
  qual?: string;
  with_check?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return json({ error: "Não autenticado" }, 401);
    }
    const user = userData.user;

    const lido = await req.json().catch(() => ({}));
    const body = lido && typeof lido === "object" ? lido : {};
    const erro = typeof body.error === "object" && body.error !== null ? body.error : {};
    const table = typeof body.table === "string" ? body.table : "unknown";
    const safeTable = ALLOWED_TABLES.has(table) ? table : "unknown";
    const action = acaoNormalizada(body.action);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const organizacao = await organizacaoConfirmada(body.organizationId, user.id, async (orgId, userId) => {
      const { data, error } = await admin
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .eq("status", "ativo")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    });

    logContexto(req, { user_id: user.id, organization_id: organizacao.organizationId, code: "log_db_error" });

    const { data: policies, error: policiesError } = safeTable !== "unknown"
      ? await admin.rpc("debug_table_policies", { _table_name: safeTable })
      : { data: null, error: null };

    const relatedPolicies = (Array.isArray(policies) ? policies as PolicyDebugRow[] : []).filter((policy) => {
      const cmd = String(policy.cmd ?? "").toUpperCase();
      return cmd === "ALL" || cmd === action;
    });

    const errorCode = textoLimitado(erro.code, LIMITES.codigo);
    console.error("DB_OPERATION_FAILURE", JSON.stringify({ table: safeTable, action, error_code: errorCode }));

    const { error: insertError } = await admin.from("backend_error_logs").insert({
      user_id: user.id,
      user_email: user.email ?? null,
      organization_id: organizacao.organizationId,
      table_name: safeTable,
      action,
      client_file: textoLimitado(body.clientFile, LIMITES.arquivo),
      client_line: linhaNormalizada(body.clientLine),
      attempted_row_keys: chavesNormalizadas(body.attemptedRowKeys),
      error_code: errorCode,
      error_message: textoLimitado(erro.message, LIMITES.mensagem),
      error_details: textoLimitado(erro.details, LIMITES.detalhe),
      error_hint: textoLimitado(erro.hint, LIMITES.dica),
      matching_policies: relatedPolicies,
      metadata: {
        policies_lookup_error: policiesError?.message ?? null,
        organizacao_descartada: organizacao.descartada,
      },
    });

    if (insertError) {
      console.error("DB_ERROR_LOG_INSERT_FAILURE", insertError.code ?? "sem-codigo");
    }

    return json({ ok: true });
  } catch (error) {
    console.error("DB_ERROR_LOGGER_FAILURE", error instanceof Error ? error.name : "erro desconhecido");
    return json({ error: "Falha ao registrar log" }, 500);
  }
});
