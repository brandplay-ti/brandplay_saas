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

    const { sponsor_id } = await req.json().catch(() => ({}));

    const sponsorsQuery = supabase.from("sponsors").select("id,name,segment");
    const { data: sponsors } = sponsor_id
      ? await sponsorsQuery.eq("id", sponsor_id)
      : await sponsorsQuery;

    if (!sponsors?.length) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sponsorIds = sponsors.map((s: any) => s.id);
    const [contractsRes, installmentsRes, deliveriesRes, propertiesRes] = await Promise.all([
      supabase.from("contracts").select("id,sponsor_id,total_value,brand,property_id").in("sponsor_id", sponsorIds),
      supabase.from("installments").select("contract_id,amount,status,paid_at"),
      supabase.from("deliveries").select("brand,status,quantity,asset_type"),
      supabase.from("sports_properties").select("id,audience_estimate"),
    ]);

    const contracts = contractsRes.data ?? [];
    const installments = installmentsRes.data ?? [];
    const deliveries = deliveriesRes.data ?? [];
    const audienceMap: Record<string, number> = {};
    (propertiesRes.data ?? []).forEach((p: any) => { audienceMap[p.id] = Number(p.audience_estimate || 0); });

    const items = sponsors.map((s: any) => {
      const sContracts = contracts.filter((c: any) => c.sponsor_id === s.id);
      const contractIds = sContracts.map((c: any) => c.id);
      const investment = sContracts.reduce((sum: number, c: any) => sum + Number(c.total_value || 0), 0);
      const paid = installments
        .filter((i: any) => contractIds.includes(i.contract_id) && i.status === "pago")
        .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

      const sDeliveries = deliveries.filter((d: any) => d.brand === s.name);
      const delivered = sDeliveries.filter((d: any) => d.status === "entregue" || d.status === "aprovada");
      const totalDeliveryUnits = delivered.reduce((sum: number, d: any) => sum + Number(d.quantity || 1), 0);

      // Estimated audience reach: sum audience of properties tied to this sponsor's contracts
      const reachedAudience = sContracts.reduce((sum: number, c: any) => sum + (audienceMap[c.property_id] || 0), 0);

      // Estimated media value (CPM proxy R$30 per thousand exposures × delivery units / 100)
      const estimatedMediaValue = (reachedAudience * totalDeliveryUnits * 0.03);
      const roi = investment > 0 ? ((estimatedMediaValue - investment) / investment) * 100 : 0;

      return {
        sponsor_id: s.id,
        name: s.name,
        segment: s.segment,
        investment: Math.round(investment),
        paid: Math.round(paid),
        delivered_count: delivered.length,
        delivery_units: totalDeliveryUnits,
        reached_audience: reachedAudience,
        estimated_media_value: Math.round(estimatedMediaValue),
        roi_percent: Math.round(roi),
      };
    }).filter((i) => i.investment > 0)
      .sort((a, b) => b.roi_percent - a.roi_percent);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calculate-roi error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
