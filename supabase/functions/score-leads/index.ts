import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const { property_id } = await req.json().catch(() => ({}));

    // Fetch sponsors
    const { data: sponsors } = await supabase
      .from("sponsors")
      .select("id,name,segment,score,tags,notes,last_contact_at")
      .limit(100);

    // Fetch open opportunities (early stages)
    const { data: opps } = await supabase
      .from("opportunities")
      .select("id,brand,value,stage,sponsor_id,property_id,notes")
      .in("stage", ["prospect", "reuniao"])
      .limit(100);

    // Fetch property context if requested
    let property: any = null;
    if (property_id) {
      const { data: p } = await supabase
        .from("sports_properties")
        .select("id,name,category,description,audience_estimate,public_about,public_headline")
        .eq("id", property_id)
        .maybeSingle();
      property = p;
    }

    // Fetch all properties (for global context if no property selected)
    const { data: allProps } = await supabase
      .from("sports_properties")
      .select("id,name,category,audience_estimate")
      .limit(20);

    // History: count proposals/contracts per sponsor
    const sponsorIds = (sponsors ?? []).map((s) => s.id);
    const { data: history } = sponsorIds.length
      ? await supabase
          .from("proposals")
          .select("sponsor_id,status")
          .in("sponsor_id", sponsorIds)
      : { data: [] as any[] };

    const historyMap: Record<string, { sent: number; accepted: number; refused: number }> = {};
    (history ?? []).forEach((h: any) => {
      if (!h.sponsor_id) return;
      historyMap[h.sponsor_id] ??= { sent: 0, accepted: 0, refused: 0 };
      if (h.status === "enviada") historyMap[h.sponsor_id].sent++;
      if (h.status === "aceita") historyMap[h.sponsor_id].accepted++;
      if (h.status === "recusada") historyMap[h.sponsor_id].refused++;
    });

    const targets = [
      ...(sponsors ?? []).map((s) => ({
        target_type: "sponsor" as const,
        id: s.id,
        name: s.name,
        segment: s.segment,
        current_score: s.score,
        tags: s.tags,
        notes: s.notes,
        history: historyMap[s.id] ?? { sent: 0, accepted: 0, refused: 0 },
      })),
      ...(opps ?? []).map((o) => ({
        target_type: "opportunity" as const,
        id: o.id,
        name: o.brand,
        stage: o.stage,
        value: Number(o.value),
        notes: o.notes,
      })),
    ];

    if (targets.length === 0) {
      return new Response(JSON.stringify({ scored: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const propertyContext = property
      ? `Propriedade-foco: ${property.name} (${property.category}). Público: ${property.audience_estimate ?? "n/d"}. ${property.public_about ?? property.description ?? ""}`
      : `Propriedades disponíveis: ${(allProps ?? []).map((p) => `${p.name} (${p.category}, audiência ${p.audience_estimate ?? "n/d"})`).join("; ")}`;

    const systemPrompt = `Você é um especialista em prospecção de patrocínio esportivo no Brasil. Avalie cada lead e atribua nota de 0 a 100 baseada em:
- Fit de SEGMENTO: aderência da categoria do patrocinador com o público da propriedade (ex: bebidas, fintech, telco, varejo, automotivo, ESG-friendly)
- Fit de AUDIÊNCIA: tamanho/perfil da audiência vs orçamento típico do segmento
- HISTÓRICO: propostas anteriores aceitas (positivo), recusadas (negativo), engajamento recente
Para cada lead retorne: score (0-100), classificação (quente >=70, morno 40-69, frio <40), 3 razões curtas, e um argumento de abordagem personalizado de 2-3 frases mencionando ângulo concreto (ex: "ESG via Kids League", "share-of-voice em jogos do estadual").`;

    const userPrompt = `${propertyContext}\n\nLeads a avaliar (JSON):\n${JSON.stringify(targets, null, 2)}`;

    const AI_MODEL = "claude-haiku-4-5-20251001";
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "submit_scores",
          description: "Submit lead scoring results",
          input_schema: {
            type: "object",
            properties: {
              scored: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    target_type: { type: "string", enum: ["sponsor", "opportunity"] },
                    target_id: { type: "string" },
                    score: { type: "number" },
                    classification: { type: "string", enum: ["quente", "morno", "frio"] },
                    fit_segment: { type: "number" },
                    fit_audience: { type: "number" },
                    fit_history: { type: "number" },
                    reasons: { type: "array", items: { type: "string" } },
                    approach_argument: { type: "string" },
                  },
                  required: ["target_type", "target_id", "score", "classification", "reasons", "approach_argument"],
                },
              },
            },
            required: ["scored"],
          },
        }],
        tool_choice: { type: "tool", name: "submit_scores" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos na sua workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolUse = aiData.content?.find((b: any) => b.type === "tool_use");
    if (!toolUse) throw new Error("AI did not return scores");
    const scored = toolUse.input.scored as any[];

    // Persist: upsert per (target_type, target_id, property_id)
    for (const s of scored) {
      // Delete previous score for same target+property
      await supabase
        .from("lead_scores")
        .delete()
        .eq("target_type", s.target_type)
        .eq("target_id", s.target_id)
        .eq("owner_id", user.id)
        .is("property_id", property_id ?? null);

      await supabase.from("lead_scores").insert({
        owner_id: user.id,
        target_type: s.target_type,
        target_id: s.target_id,
        property_id: property_id ?? null,
        score: Math.max(0, Math.min(100, Math.round(s.score))),
        classification: s.classification,
        reasons: s.reasons ?? [],
        approach_argument: s.approach_argument ?? null,
        fit_segment: s.fit_segment ?? null,
        fit_audience: s.fit_audience ?? null,
        fit_history: s.fit_history ?? null,
        model: AI_MODEL,
      });
    }

    return new Response(JSON.stringify({ scored, count: scored.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-leads error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
