import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const table = typeof body.table === "string" ? body.table : "unknown";
    const action = typeof body.action === "string" ? body.action : "unknown";
    const safeTable = ALLOWED_TABLES.has(table) ? table : "unknown";

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: policies, error: policiesError } = safeTable !== "unknown"
      ? await admin.rpc("debug_table_policies", { _table_name: safeTable })
      : { data: null, error: null };

    const relatedPolicies = (Array.isArray(policies) ? policies as PolicyDebugRow[] : []).filter((policy) => {
      const cmd = String(policy.cmd ?? "").toUpperCase();
      const expected = action.toUpperCase();
      return cmd === "ALL" || cmd === expected;
    });

    const logEntry = {
      timestamp: new Date().toISOString(),
      user: {
        id: userData.user.id,
        email: userData.user.email,
      },
      table: safeTable,
      action,
      organization_id: body.organizationId ?? null,
      client_location: {
        file: body.clientFile ?? null,
        line: body.clientLine ?? null,
      },
      attempted_row_keys: Array.isArray(body.attemptedRowKeys) ? body.attemptedRowKeys : [],
      db_error: body.error ?? null,
      matching_policies: relatedPolicies,
      policies_lookup_error: policiesError?.message ?? null,
    };

    console.error("DB_OPERATION_FAILURE", JSON.stringify(logEntry));

    const { error: insertError } = await admin.from("backend_error_logs").insert({
      user_id: userData.user.id,
      user_email: userData.user.email ?? null,
      organization_id: body.organizationId ?? null,
      table_name: safeTable,
      action,
      client_file: body.clientFile ?? null,
      client_line: typeof body.clientLine === "number" ? body.clientLine : null,
      attempted_row_keys: Array.isArray(body.attemptedRowKeys) ? body.attemptedRowKeys : [],
      error_code: body.error?.code ?? null,
      error_message: body.error?.message ?? null,
      error_details: body.error?.details ?? null,
      error_hint: body.error?.hint ?? null,
      matching_policies: relatedPolicies,
      metadata: {
        policies_lookup_error: policiesError?.message ?? null,
      },
    });

    if (insertError) {
      console.error("DB_ERROR_LOG_INSERT_FAILURE", insertError.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("DB_ERROR_LOGGER_FAILURE", error);
    return new Response(JSON.stringify({ error: "Falha ao registrar log" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});