import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const months = 12;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    // Build list of months
    const buckets: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    const startISO = start.toISOString().slice(0, 10);
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + months);
    const endISO = endDate.toISOString().slice(0, 10);

    // Probabilities per stage
    const { data: probs } = await supabase
      .from("user_stage_probabilities")
      .select("stage, probability")
      .eq("user_id", user.id);
    const probMap: Record<string, number> = {
      prospect: 0.1, reuniao: 0.25, proposta_enviada: 0.5, negociacao: 0.7, fechado: 1, perdido: 0,
    };
    (probs ?? []).forEach((p: any) => { probMap[p.stage] = Number(p.probability); });

    // Confirmed: installments (pendente/atrasado) by due_date
    const { data: installments } = await supabase
      .from("installments")
      .select("amount, due_date, status")
      .gte("due_date", startISO)
      .lt("due_date", endISO)
      .in("status", ["pendente", "atrasado"]);

    // Pipeline: open opportunities with expected_close_date in window
    const { data: opps } = await supabase
      .from("opportunities")
      .select("value, stage, expected_close_date")
      .gte("expected_close_date", startISO)
      .lt("expected_close_date", endISO)
      .not("stage", "in", "(fechado,perdido)");

    const series = buckets.map((b) => {
      const confirmed = (installments ?? [])
        .filter((i: any) => {
          const d = new Date(i.due_date);
          return d.getFullYear() === b.year && d.getMonth() === b.month;
        })
        .reduce((s, i: any) => s + Number(i.amount || 0), 0);

      const weighted = (opps ?? [])
        .filter((o: any) => {
          const d = new Date(o.expected_close_date);
          return d.getFullYear() === b.year && d.getMonth() === b.month;
        })
        .reduce((s, o: any) => s + Number(o.value || 0) * (probMap[o.stage] ?? 0.3), 0);

      return {
        key: b.key,
        label: b.label,
        confirmado: Math.round(confirmed),
        ponderado: Math.round(weighted),
        total: Math.round(confirmed + weighted),
      };
    });

    const totals = series.reduce(
      (acc, m) => ({
        confirmado: acc.confirmado + m.confirmado,
        ponderado: acc.ponderado + m.ponderado,
        total: acc.total + m.total,
      }),
      { confirmado: 0, ponderado: 0, total: 0 }
    );

    return new Response(JSON.stringify({ series, totals, probabilities: probMap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("revenue-forecast error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
