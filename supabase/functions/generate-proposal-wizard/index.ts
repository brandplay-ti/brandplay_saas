import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Body = {
  brand: string;
  objective: "branding" | "venda" | "esg" | string;
  budget?: number;
  sponsor_id?: string | null;
  property_id?: string | null;
  extra_context?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = (await req.json()) as Body;
    if (!body.brand || !body.objective) {
      return new Response(JSON.stringify({ error: "brand e objective são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch context
    let property: any = null;
    let assets: any[] = [];
    if (body.property_id) {
      const { data: p } = await supabase.from("sports_properties").select("*").eq("id", body.property_id).maybeSingle();
      property = p;
      const { data: alloc } = await supabase
        .from("asset_allocations")
        .select("asset:assets(id,name,category,unit_value)")
        .eq("property_id", body.property_id);
      assets = (alloc ?? []).map((a: any) => a.asset).filter(Boolean);
    }
    if (assets.length === 0) {
      const { data: a } = await supabase.from("assets").select("id,name,category,unit_value").limit(40);
      assets = a ?? [];
    }

    let sponsorInfo: any = null;
    if (body.sponsor_id) {
      const { data: s } = await supabase.from("sponsors").select("name,segment,tags,notes").eq("id", body.sponsor_id).maybeSingle();
      sponsorInfo = s;
    }

    const systemPrompt = `Você é especialista do método Scout em propriedades esportivas. Crie uma proposta de patrocínio completa e estruturada.
Padrão Scout: conceito inspirador (1 frase + storytelling curto), ativações concretas e mensuráveis, entregas formatadas como itens contratáveis.
Sempre escreva em português brasileiro, tom profissional e direto.

Você DEVE retornar via tool_call:
1. concept: conceito de marca de 2-4 parágrafos com storytelling
2. activations: array de 4-7 ativações táticas (título + descrição curta)
3. items: array de entregas estruturadas (name, description, quantity, unit_value) — usando os ativos disponíveis quando fizer sentido
4. deck: estrutura de slides como markdown (8-12 slides com título e bullets)
5. whatsapp: mensagem curta de 3-5 linhas com gancho + valor + CTA, máx 600 caracteres
6. email: { subject, body_html } — assunto curto + corpo HTML com saudação, conceito resumido, top 3 ativações, próximos passos, assinatura
7. title: título da proposta (curto, comercial)
8. summary_message: mensagem comercial de 2-3 parágrafos para o campo "mensagem" da proposta`;

    const userPrompt = `MARCA: ${body.brand}
OBJETIVO: ${body.objective}${body.budget ? `\nORÇAMENTO ALVO: R$ ${body.budget.toLocaleString("pt-BR")}` : ""}

${property ? `PROPRIEDADE: ${property.name} (${property.category})
Sobre: ${property.public_about ?? property.description ?? "—"}
Público estimado: ${property.audience_estimate ?? "n/d"}` : "Sem propriedade específica selecionada."}

${sponsorInfo ? `PATROCINADOR: ${sponsorInfo.name} | Segmento: ${sponsorInfo.segment ?? "n/d"} | Tags: ${(sponsorInfo.tags ?? []).join(", ")}
Notas: ${sponsorInfo.notes ?? "—"}` : ""}

ATIVOS DISPONÍVEIS: ${assets.map((a) => `${a.name} (${a.category}, R$ ${Number(a.unit_value).toLocaleString("pt-BR")})`).join("; ") || "nenhum cadastrado"}

${body.extra_context ? `CONTEXTO ADICIONAL: ${body.extra_context}` : ""}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "submit_proposal",
            description: "Submit complete multi-channel proposal",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary_message: { type: "string" },
                concept: { type: "string" },
                activations: {
                  type: "array",
                  items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" } }, required: ["title", "description"] },
                },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, unit_value: { type: "number" } },
                    required: ["name", "quantity", "unit_value"],
                  },
                },
                deck: { type: "string", description: "Markdown with slide structure" },
                whatsapp: { type: "string" },
                email: {
                  type: "object",
                  properties: { subject: { type: "string" }, body_html: { type: "string" } },
                  required: ["subject", "body_html"],
                },
              },
              required: ["title", "summary_message", "concept", "activations", "items", "deck", "whatsapp", "email"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_proposal" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de uso da IA atingido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return proposal");
    const proposal = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(proposal), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-proposal-wizard error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
