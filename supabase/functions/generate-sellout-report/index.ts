import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { property_id, event_id } = await req.json();
    if (!property_id) return new Response(JSON.stringify({ error: "property_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [propRes, deliveriesRes, tiersRes, salesRes, eventRes, mediaRes] = await Promise.all([
      supabase.from("sports_properties").select("*").eq("id", property_id).maybeSingle(),
      supabase.from("deliveries").select("*").eq("property_id", property_id),
      supabase.from("sponsorship_tiers").select("id,name,level,total_slots,value").eq("property_id", property_id),
      supabase.from("tier_sales").select("tier_id,brand,status").in("tier_id", []),
      event_id ? supabase.from("property_events").select("*").eq("id", event_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("property_media").select("storage_path,caption").eq("property_id", property_id).limit(8),
    ]);

    const property = propRes.data;
    if (!property) return new Response(JSON.stringify({ error: "Property not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tierIds = (tiersRes.data ?? []).map(t => t.id);
    const sales = tierIds.length
      ? (await supabase.from("tier_sales").select("tier_id,brand,status").in("tier_id", tierIds)).data ?? []
      : [];

    const tiers = (tiersRes.data ?? []).map(t => {
      const sold = sales.filter((s: any) => s.tier_id === t.id && s.status !== "cancelada").length;
      return {
        nome: t.name,
        nivel: t.level,
        cotas_vendidas: sold,
        cotas_totais: t.total_slots,
        sellout_pct: t.total_slots > 0 ? Math.round((sold / t.total_slots) * 100) : 0,
        receita: sold * Number(t.value || 0),
      };
    });

    const dels = deliveriesRes.data ?? [];
    const delsByStatus = {
      entregue: dels.filter((d: any) => d.status === "entregue" || d.status === "aprovada").length,
      pendente: dels.filter((d: any) => d.status === "pendente").length,
      atrasada: dels.filter((d: any) => d.status === "atrasada").length,
    };

    const totalReceita = tiers.reduce((s, t) => s + t.receita, 0);
    const cotasVendidas = tiers.reduce((s, t) => s + t.cotas_vendidas, 0);
    const cotasTotais = tiers.reduce((s, t) => s + t.cotas_totais, 0);
    const selloutGeral = cotasTotais > 0 ? Math.round((cotasVendidas / cotasTotais) * 100) : 0;

    const metrics = {
      sellout_pct: selloutGeral,
      cotas_vendidas: cotasVendidas,
      cotas_totais: cotasTotais,
      receita_total: totalReceita,
      tiers,
      entregas: delsByStatus,
      audiencia_estimada: property.audience_estimate,
    };

    const ctx = {
      propriedade: property.name,
      categoria: property.category,
      evento: eventRes?.data?.title,
      ...metrics,
      patrocinadores: [...new Set(sales.map((s: any) => s.brand).filter(Boolean))],
    };

    const prompt = `Você é um especialista em marketing esportivo. Gere um relatório executivo de sell-out pós-temporada/evento (300-500 palavras, em português brasileiro, formato markdown com seções: Resumo Executivo, Performance Comercial, Performance Operacional, Insights e Recomendações). Use os dados:\n\n${JSON.stringify(ctx, null, 2)}`;

    const AI_MODEL = "claude-sonnet-5";
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 4096,
        system: "Responda em markdown limpo, sem ```markdown wrappers.",
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiResp.ok) throw new Error(`AI error: ${await aiResp.text()}`);

    const data = await aiResp.json();
    const content = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    const title = `Sell-out Report — ${property.name}${eventRes?.data?.title ? ` · ${eventRes.data.title}` : ""}`;

    const { data: report } = await supabase.from("sellout_reports").insert({
      property_id,
      event_id: event_id ?? null,
      title,
      content,
      metrics,
      model: AI_MODEL,
      owner_id: user.id,
    }).select().single();

    return new Response(JSON.stringify({ report }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
