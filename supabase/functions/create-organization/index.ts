import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.103.3/cors";
import { z } from "https://esm.sh/zod@3.25.76";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  cnpj: z.string().max(32).nullable().optional(),
});

const diagnoseCreateOrganizationError = (message: string, code?: string) => {
  const normalized = message.toLowerCase();
  const isRls = code === "42501" || normalized.includes("row-level security") || normalized.includes("rls");

  if (!isRls) return null;

  return {
    type: "rls_create_organization",
    title: "Criação bloqueada por regra de segurança",
    probableCause: "A policy de criação da tabela organizations não aceitou a nova linha.",
    checks: [
      "Sessão expirada ou token ausente: o usuário autenticado não chegou ao banco.",
      "owner_id divergente: a organização precisa ser criada para o mesmo usuário da sessão.",
      "Policy INSERT ausente ou restritiva: a regra deve permitir criar quando auth.uid() corresponde ao owner.",
    ],
    suggestedFix: "Faça login novamente e tente criar a organização. Se persistir, revise a policy INSERT de organizations e garanta que ela permita o owner autenticado.",
  };
};

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({
      error: "Sessão inválida. Faça login novamente.",
      diagnostic: {
        type: "session_missing",
        title: "Sessão não encontrada",
        probableCause: "A requisição chegou sem token de autenticação.",
        suggestedFix: "Faça login novamente antes de criar a organização.",
      },
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({
      error: "Sessão inválida. Faça login novamente.",
      diagnostic: {
        type: "session_expired",
        title: "Sessão expirada ou inválida",
        probableCause: "O token do usuário não pôde ser validado.",
        suggestedFix: "Faça login novamente e repita a criação da organização.",
      },
    }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Dados inválidos", details: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("create_organization_with_owner", {
    _owner_id: claimsData.claims.sub,
    _name: parsed.data.name,
    _cnpj: parsed.data.cnpj ?? null,
  });

  if (error) {
    console.error("CREATE_ORGANIZATION_FAILURE", error);
    const diagnostic = diagnoseCreateOrganizationError(error.message, error.code);
    return new Response(JSON.stringify({ error: error.message, diagnostic }), {
      status: diagnostic ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ organizationId: data }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});