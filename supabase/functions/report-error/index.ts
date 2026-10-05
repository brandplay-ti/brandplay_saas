import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.3/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(12000).nullable().optional(),
  componentStack: z.string().max(12000).nullable().optional(),
  route: z.string().max(1000).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  source: z.string().max(80).default("frontend"),
  severity: z.enum(["error", "warning", "fatal"]).default("error"),
  metadata: z.record(z.unknown()).default({}),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = authHeader ? await userClient.auth.getUser() : { data: { user: null } };
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = parsed.data;

    const { error } = await admin.from("error_reports").insert({
      user_id: userData.user?.id ?? null,
      user_email: userData.user?.email ?? null,
      organization_id: body.organizationId ?? null,
      source: body.source,
      severity: body.severity,
      message: body.message,
      stack: body.stack ?? null,
      component_stack: body.componentStack ?? null,
      route: body.route ?? null,
      user_agent: req.headers.get("User-Agent"),
      metadata: body.metadata,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ERROR_REPORT_FAILURE", error);
    return new Response(JSON.stringify({ error: "Falha ao registrar report" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});