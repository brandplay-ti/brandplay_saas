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

    const { data: contracts } = await supabase
      .from("contracts")
      .select("id,title,brand,sponsor_id,status,end_date,total_value")
      .eq("status", "ativo");

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ risks: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const contractIds = contracts.map(c => c.id);
    const sponsorIds = [...new Set(contracts.map(c => c.sponsor_id).filter(Boolean))];

    const [installmentsRes, deliveriesRes, sponsorsRes] = await Promise.all([
      supabase.from("installments").select("contract_id,status,due_date").in("contract_id", contractIds),
      supabase.from("deliveries").select("brand,status,approval,due_date").in("brand", contracts.map(c => c.brand)),
      sponsorIds.length ? supabase.from("sponsors").select("id,last_contact_at,name").in("id", sponsorIds) : Promise.resolve({ data: [] }),
    ]);

    const today = new Date();
    const risks: any[] = [];

    for (const c of contracts) {
      const ins = (installmentsRes.data ?? []).filter((i: any) => i.contract_id === c.id);
      const overdue = ins.filter((i: any) => i.status === "atrasado").length;
      const dels = (deliveriesRes.data ?? []).filter((d: any) => d.brand === c.brand);
      const reproved = dels.filter((d: any) => d.approval === "reprovada").length;
      const lateDels = dels.filter((d: any) => d.status === "atrasada" || (d.due_date && new Date(d.due_date) < today && d.status !== "entregue" && d.status !== "aprovada")).length;
      const sp = (sponsorsRes.data ?? []).find((s: any) => s.id === c.sponsor_id);
      const daysSinceContact = sp?.last_contact_at ? Math.floor((today.getTime() - new Date(sp.last_contact_at).getTime()) / 86400000) : 999;
      const daysToEnd = c.end_date ? Math.floor((new Date(c.end_date).getTime() - today.getTime()) / 86400000) : null;

      let score = 0;
      const signals: string[] = [];
      if (overdue > 0) { score += overdue * 20; signals.push(`${overdue} parcela(s) em atraso`); }
      if (reproved > 0) { score += reproved * 15; signals.push(`${reproved} entrega(s) reprovada(s)`); }
      if (lateDels > 0) { score += lateDels * 10; signals.push(`${lateDels} entrega(s) atrasada(s)`); }
      if (daysSinceContact > 30) { score += 15; signals.push(`${daysSinceContact}d sem contato`); }
      if (daysSinceContact > 60) { score += 10; }
      if (daysToEnd !== null && daysToEnd < 60 && daysToEnd > 0) { score += 20; signals.push(`Vence em ${daysToEnd}d`); }

      if (score === 0) continue;

      const level = score >= 60 ? "critico" : score >= 40 ? "alto" : score >= 20 ? "medio" : "baixo";

      risks.push({
        contract_id: c.id,
        contract_title: c.title,
        sponsor_name: sp?.name ?? c.brand,
        sponsor_id: c.sponsor_id,
        risk_level: level,
        risk_score: score,
        signals,
        total_value: c.total_value,
      });
    }

    risks.sort((a, b) => b.risk_score - a.risk_score);

    // Recomendação IA para top 5
    const topRisks = risks.slice(0, 5);
    if (topRisks.length > 0) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "Você é consultor de retenção de patrocinadores. Para cada contrato, gere 1 recomendação curta (máx 15 palavras) em português brasileiro." },
            { role: "user", content: `Contratos em risco:\n${JSON.stringify(topRisks, null, 2)}\n\nResponda em JSON: {"recommendations":[{"contract_id":"...","recommendation":"..."}]}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (aiResp.ok) {
        const data = await aiResp.json();
        try {
          const parsed = JSON.parse(data.choices[0].message.content);
          for (const rec of parsed.recommendations ?? []) {
            const r = risks.find(r => r.contract_id === rec.contract_id);
            if (r) r.recommendation = rec.recommendation;
          }
        } catch (_) {}
      }
    }

    // Cache
    for (const r of risks) {
      await supabase.from("contract_churn_risk").upsert({
        contract_id: r.contract_id,
        owner_id: user.id,
        risk_level: r.risk_level,
        risk_score: r.risk_score,
        signals: r.signals,
        recommendation: r.recommendation ?? null,
        model: "google/gemini-2.5-flash-lite",
        generated_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ risks }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
