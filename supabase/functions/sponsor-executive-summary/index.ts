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

    const { sponsor_id, force } = await req.json();
    if (!sponsor_id) return new Response(JSON.stringify({ error: "sponsor_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // cache (24h)
    if (!force) {
      const { data: cached } = await supabase
        .from("sponsor_executive_summaries")
        .select("*")
        .eq("sponsor_id", sponsor_id)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.generated_at).getTime() < 24 * 3600 * 1000) {
        return new Response(JSON.stringify({ summary: cached.summary, highlights: cached.highlights, generated_at: cached.generated_at, cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const [sp, contracts, opps, deliveries, installments, interactions] = await Promise.all([
      supabase.from("sponsors").select("*").eq("id", sponsor_id).maybeSingle(),
      supabase.from("contracts").select("title,status,total_value,start_date,end_date").eq("sponsor_id", sponsor_id),
      supabase.from("opportunities").select("brand,stage,value,expected_close_date").eq("sponsor_id", sponsor_id),
      supabase.from("deliveries").select("title,status,approval,due_date,delivered_at").eq("brand", ""),
      supabase.from("installments").select("amount,status,due_date,paid_at").in("contract_id", []),
      supabase.from("sponsor_interactions").select("type,title,occurred_at,description").eq("sponsor_id", sponsor_id).order("occurred_at", { ascending: false }).limit(20),
    ]);

    const sponsor = sp.data;
    if (!sponsor) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Buscar deliveries/installments via brand/contract_ids
    const contractList = contracts.data ?? [];
    const contractIds = (await supabase.from("contracts").select("id").eq("sponsor_id", sponsor_id)).data?.map((c: any) => c.id) ?? [];
    const realInstallments = contractIds.length
      ? (await supabase.from("installments").select("amount,status,due_date,paid_at").in("contract_id", contractIds)).data ?? []
      : [];
    const realDeliveries = (await supabase.from("deliveries").select("title,status,approval,due_date,delivered_at").eq("brand", sponsor.name)).data ?? [];

    const totalContracted = contractList.reduce((s, c: any) => s + Number(c.total_value || 0), 0);
    const totalPaid = realInstallments.filter((i: any) => i.status === "pago").reduce((s, i: any) => s + Number(i.amount || 0), 0);
    const overdue = realInstallments.filter((i: any) => i.status === "atrasado").length;
    const deliveredCount = realDeliveries.filter((d: any) => d.status === "entregue" || d.status === "aprovada").length;
    const pendingDeliveries = realDeliveries.filter((d: any) => d.status === "pendente" || d.status === "em_producao").length;

    const ctx = {
      patrocinador: sponsor.name,
      segmento: sponsor.segment,
      score: sponsor.score,
      ultimo_contato: sponsor.last_contact_at,
      contratos: contractList.length,
      valor_total_contratado: totalContracted,
      valor_pago: totalPaid,
      parcelas_atrasadas: overdue,
      entregas_realizadas: deliveredCount,
      entregas_pendentes: pendingDeliveries,
      oportunidades_ativas: (opps.data ?? []).filter((o: any) => o.stage !== "fechado" && o.stage !== "perdido").length,
      ultimas_interacoes: (interactions.data ?? []).slice(0, 8).map((i: any) => `${i.occurred_at?.slice(0, 10)}: ${i.title}`),
    };

    const prompt = `Você é um analista de patrocínios esportivos. Gere um resumo executivo conciso (máx 4 linhas, em português brasileiro) sobre a relação com este patrocinador, destacando saúde do relacionamento, situação financeira e próximos passos. Use linguagem direta de C-level.\n\nDados:\n${JSON.stringify(ctx, null, 2)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Responda apenas com o parágrafo executivo, sem títulos ou markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições. Tente novamente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos na sua workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!aiResp.ok) throw new Error(`AI error: ${await aiResp.text()}`);

    const data = await aiResp.json();
    const summary = data.choices?.[0]?.message?.content?.trim() ?? "";

    const highlights = [
      { label: "Contratado", value: `R$ ${totalContracted.toLocaleString("pt-BR")}` },
      { label: "Pago", value: `R$ ${totalPaid.toLocaleString("pt-BR")}` },
      { label: "Entregas OK", value: `${deliveredCount}/${realDeliveries.length}` },
      { label: "Atrasos", value: `${overdue}` },
    ];

    await supabase.from("sponsor_executive_summaries").upsert({
      sponsor_id,
      owner_id: user.id,
      summary,
      highlights,
      model: "google/gemini-2.5-flash",
      generated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ summary, highlights, generated_at: new Date().toISOString(), cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
