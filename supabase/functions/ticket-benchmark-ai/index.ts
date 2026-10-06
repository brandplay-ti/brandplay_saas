import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extracts a JSON object from a Claude text response, stripping any ```json fences.
function extractJson(text: string): any {
  let cleaned = (text ?? "").trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return JSON.parse(cleaned);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { force } = await req.json().catch(() => ({}));

    // Get user's org
    const { data: orgRow } = await supabase.rpc("get_user_org", { _user_id: user.id });
    const orgId = orgRow as unknown as string | null;

    // Internal benchmark: avg ticket per segment (joining contracts + sponsors)
    const { data: contracts } = await supabase
      .from("contracts")
      .select("total_value, sponsor_id")
      .gt("total_value", 0)
      .in("status", ["ativo", "vencendo", "encerrado"]);

    const sponsorIds = Array.from(new Set((contracts ?? []).map((c: any) => c.sponsor_id).filter(Boolean)));
    const { data: sponsors } = sponsorIds.length
      ? await supabase.from("sponsors").select("id, segment").in("id", sponsorIds)
      : { data: [] as any[] };

    const segMap: Record<string, string> = {};
    (sponsors ?? []).forEach((s: any) => { segMap[s.id] = s.segment || "Outros"; });

    const grouped: Record<string, { sum: number; count: number; values: number[] }> = {};
    (contracts ?? []).forEach((c: any) => {
      const seg = segMap[c.sponsor_id] || "Outros";
      if (!grouped[seg]) grouped[seg] = { sum: 0, count: 0, values: [] };
      grouped[seg].sum += Number(c.total_value || 0);
      grouped[seg].count += 1;
      grouped[seg].values.push(Number(c.total_value || 0));
    });

    const internal = Object.entries(grouped).map(([segment, g]) => ({
      segment,
      internal_avg: Math.round(g.sum / g.count),
      contract_count: g.count,
      min: Math.round(Math.min(...g.values)),
      max: Math.round(Math.max(...g.values)),
    })).sort((a, b) => b.internal_avg - a.internal_avg);

    // Try to get cached market benchmarks (1 week TTL)
    let market: any[] = [];
    if (orgId && internal.length > 0) {
      if (!force) {
        const { data: cached } = await supabase
          .from("market_benchmarks")
          .select("*")
          .eq("organization_id", orgId);
        const fresh = (cached ?? []).filter((c: any) =>
          Date.now() - new Date(c.generated_at).getTime() < 7 * 24 * 3600 * 1000
        );
        if (fresh.length === internal.length) {
          market = fresh;
        }
      }

      if (market.length === 0) {
        // Generate via the Anthropic API
        const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
        const AI_MODEL = "claude-sonnet-5";
        if (ANTHROPIC_API_KEY) {
          try {
            const prompt = `Você é um analista do mercado brasileiro de patrocínio esportivo. Para cada segmento abaixo, estime o ticket médio anual realista de uma cota de patrocínio (em BRL) no mercado brasileiro de propriedades esportivas regionais/nacionais. Retorne JSON puro.

Segmentos: ${internal.map((i) => i.segment).join(", ")}

Formato exato (apenas JSON, sem markdown):
{"segments":[{"segment":"...","market_avg":120000,"market_min":50000,"market_max":300000,"notes":"breve justificativa"}]}`;

            const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: AI_MODEL,
                max_tokens: 2048,
                messages: [{ role: "user", content: prompt }],
              }),
            });

            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const content = aiData.content?.find((b: any) => b.type === "text")?.text || "{}";
              const parsed = extractJson(content);
              const segs = parsed.segments || [];
              market = segs;

              // Cache
              for (const s of segs) {
                await supabase.from("market_benchmarks").upsert({
                  organization_id: orgId,
                  segment: s.segment,
                  market_avg_ticket: s.market_avg || 0,
                  market_min: s.market_min,
                  market_max: s.market_max,
                  notes: s.notes,
                  model: AI_MODEL,
                  generated_at: new Date().toISOString(),
                }, { onConflict: "organization_id,segment" });
              }
            }
          } catch (e) {
            console.error("AI benchmark error", e);
          }
        }
      }
    }

    // Merge
    const result = internal.map((i) => {
      const m = market.find((x: any) => x.segment === i.segment);
      const marketAvg = m?.market_avg ?? m?.market_avg_ticket ?? null;
      const variance = marketAvg ? Math.round(((i.internal_avg - marketAvg) / marketAvg) * 100) : null;
      return {
        ...i,
        market_avg: marketAvg,
        market_min: m?.market_min ?? null,
        market_max: m?.market_max ?? null,
        market_notes: m?.notes ?? null,
        variance_percent: variance,
      };
    });

    return new Response(JSON.stringify({ items: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ticket-benchmark-ai error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
