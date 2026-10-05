// Generate proposal draft from briefing using Lovable AI
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um especialista em propostas comerciais para patrocínio esportivo no Brasil.
Receba o contexto do patrocinador, da propriedade esportiva, dos ativos disponíveis e o briefing do usuário.
Gere uma proposta enxuta e persuasiva em português do Brasil, conectando os objetivos do patrocinador aos ativos disponíveis.
Use SEMPRE a tool "create_proposal" para responder. Não responda em texto livre.
- title: título curto (máx 80 chars), incluindo a marca quando souber.
- message: mensagem comercial em 2-4 parágrafos, tom profissional e direto.
- items: 3 a 8 itens; cada um com name (obrigatório), description (curta), quantity (int >=1), unit_value (R$ em number, sem símbolo).
- Se houver ativos sugeridos no contexto, priorize usá-los e mantenha valores compatíveis.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const briefing: string = (body.briefing ?? "").toString().slice(0, 4000);
    const sponsorId: string | null = body.sponsor_id ?? null;
    const propertyId: string | null = body.property_id ?? null;
    const objective: string = (body.objective ?? "").toString().slice(0, 500);

    if (!briefing && !objective) {
      return new Response(JSON.stringify({ error: "Briefing ou objetivo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch context
    const ctx: string[] = [];

    if (sponsorId) {
      const { data: s } = await supabase
        .from("sponsors")
        .select("name, segment, notes, tags, score")
        .eq("id", sponsorId).maybeSingle();
      if (s) ctx.push(`PATROCINADOR: ${s.name}${s.segment ? ` (${s.segment})` : ""}${s.notes ? `\nNotas: ${s.notes}` : ""}${s.tags?.length ? `\nTags: ${s.tags.join(", ")}` : ""}`);
    }

    if (propertyId) {
      const { data: p } = await supabase
        .from("sports_properties")
        .select("name, category, description, audience_estimate, season_year")
        .eq("id", propertyId).maybeSingle();
      if (p) ctx.push(`PROPRIEDADE: ${p.name} (${p.category})${p.audience_estimate ? `\nAudiência estimada: ${p.audience_estimate}` : ""}${p.description ? `\nSobre: ${p.description}` : ""}`);

      const { data: tiers } = await supabase
        .from("sponsorship_tiers")
        .select("name, level, value, benefits")
        .eq("property_id", propertyId)
        .order("position");
      if (tiers?.length) {
        ctx.push(`COTAS DISPONÍVEIS:\n${tiers.map((t) => `- ${t.name} (${t.level}) — R$ ${t.value}${t.benefits ? ` | ${t.benefits}` : ""}`).join("\n")}`);
      }
    }

    // Owner assets as fallback
    const { data: assets } = await supabase
      .from("assets")
      .select("name, category, unit_value, quantity")
      .eq("status", "ativo")
      .limit(20);
    if (assets?.length) {
      ctx.push(`ATIVOS DISPONÍVEIS:\n${assets.map((a) => `- ${a.name} (${a.category}) — R$ ${a.unit_value} x ${a.quantity}`).join("\n")}`);
    }

    const userPrompt = [
      objective ? `OBJETIVO: ${objective}` : null,
      briefing ? `BRIEFING:\n${briefing}` : null,
      ctx.length ? `CONTEXTO:\n${ctx.join("\n\n")}` : null,
    ].filter(Boolean).join("\n\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_proposal",
            description: "Cria a proposta comercial",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                message: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      description: { type: "string" },
                      quantity: { type: "integer", minimum: 1 },
                      unit_value: { type: "number", minimum: 0 },
                    },
                    required: ["name", "quantity", "unit_value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["title", "message", "items"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_proposal" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Uso." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha ao gerar proposta" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Resposta da IA inválida" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-proposal-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
