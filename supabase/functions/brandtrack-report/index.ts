import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { LOGO_BOX_CSS, logoFrameHtml, publicLogoUrl } from "../_shared/logo.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { event_id } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) throw new Error("Unauthorized");

    // Use userClient (respects RLS) so only the caller's org data is returned
    let mediaQuery = userClient.from("brandtrack_media").select("id, title, event_id");
    if (event_id) mediaQuery = mediaQuery.eq("event_id", event_id);
    const { data: medias } = await mediaQuery;
    const mediaIds = (medias ?? []).map((m: any) => m.id);

    let dets: any[] = [];
    if (mediaIds.length) {
      const { data } = await userClient
        .from("brandtrack_detections")
        .select("*")
        .in("media_id", mediaIds);
      dets = data ?? [];
    }

    const eventName = event_id
      ? (await userClient.from("brandtrack_events").select("name").eq("id", event_id).maybeSingle()).data?.name
      : "Todos os eventos";


    // Aggregate per brand
    const byBrand = new Map<string, { name: string; count: number; duration: number; bes: number; avgPct: number; types: Set<string> }>();
    for (const d of dets) {
      const key = d.brand_name;
      const e = byBrand.get(key) ?? { name: key, count: 0, duration: 0, bes: 0, avgPct: 0, types: new Set() };
      e.count += 1;
      e.duration += Number(d.duration ?? 0);
      e.bes += Number(d.bes_score ?? 0);
      e.avgPct += Number(d.screen_percentage ?? 0);
      e.types.add(d.exposure_type);
      byBrand.set(key, e);
    }
    const brandsAgg = [...byBrand.values()]
      .map((b) => ({ ...b, avgPct: b.avgPct / Math.max(b.count, 1), types: [...b.types] }))
      .sort((a, b) => b.bes - a.bes);

    // Logos (marca própria ou patrocinador) para exibição padronizada no relatório
    const [{ data: btBrands }, { data: sponsorRows }] = await Promise.all([
      userClient.from("brandtrack_brands").select("name, logo_path"),
      userClient.from("sponsors").select("name, logo_path"),
    ]);
    const logoByName = new Map<string, string>();
    for (const row of [...(sponsorRows ?? []), ...(btBrands ?? [])] as { name: string; logo_path: string | null }[]) {
      const url = publicLogoUrl(SUPABASE_URL, "sponsor-logos", row.logo_path);
      if (row?.name && url) logoByName.set(row.name.trim().toLowerCase(), url);
    }
    const logoFor = (name: string) => logoByName.get(String(name ?? "").trim().toLowerCase()) ?? null;


    const totalDetections = dets.length;
    const totalDuration = dets.reduce((s, d) => s + Number(d.duration ?? 0), 0);
    const totalBes = dets.reduce((s, d) => s + Number(d.bes_score ?? 0), 0);
    const generatedAt = new Date().toLocaleString("pt-BR");

    // HTML escape to prevent stored XSS from DB-sourced values
    const esc = (s: unknown) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");


    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" />
<title>Relatório BrandTrack</title>
<style>
@page { size: A4; margin: 24mm 18mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; margin: 0; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; color: #1f2937; }
.meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
.cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-top: 16px; }
.card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.card .label { font-size: 11px; text-transform: uppercase; color: #6b7280; letter-spacing: .04em; }
.card .value { font-size: 22px; font-weight: 700; margin-top: 4px; color: #111827; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
th { background: #f3f4f6; font-weight: 600; color: #374151; }
.bar { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
.footer { margin-top: 40px; font-size: 10px; color: #9ca3af; text-align: center; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 10px; margin-right: 4px; }
td.logo-cell { width: 56px; }
${LOGO_BOX_CSS}

</style></head>
<body>
  <h1>Relatório BrandTrack</h1>
  <div class="meta">Evento: <strong>${esc(eventName ?? "—")}</strong> · Gerado em ${esc(generatedAt)}</div>

  <h2>Resumo executivo</h2>
  <div class="cards">
    <div class="card"><div class="label">Marcas detectadas</div><div class="value">${brandsAgg.length}</div></div>
    <div class="card"><div class="label">Aparições</div><div class="value">${totalDetections}</div></div>
    <div class="card"><div class="label">Tempo total</div><div class="value">${totalDuration.toFixed(1)}s</div></div>
    <div class="card"><div class="label">BES total</div><div class="value">${Math.round(totalBes)}</div></div>
  </div>

  <h2>Ranking de marcas (Brand Exposure Score)</h2>
  <table>
    <thead><tr><th>#</th><th>Logo</th><th>Marca</th><th>Aparições</th><th>Tempo</th><th>% tela média</th><th>Tipos</th><th>BES</th></tr></thead>
    <tbody>
      ${brandsAgg.map((b, i) => {
        const max = brandsAgg[0]?.bes || 1;
        const w = Math.round((b.bes / max) * 100);
        return `<tr>
          <td>${i + 1}</td>
          <td class="logo-cell">${logoFrameHtml(logoFor(b.name), String(b.name ?? ""), "sm")}</td>
          <td><strong>${esc(b.name)}</strong></td>

          <td>${b.count}</td>
          <td>${b.duration.toFixed(1)}s</td>
          <td>${b.avgPct.toFixed(1)}%</td>
          <td>${b.types.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</td>
          <td><div class="bar"><span style="width:${w}%"></span></div><div style="font-size:10px;margin-top:2px;color:#6b7280">${Math.round(b.bes)}</div></td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <div class="footer">BrandPlay · BrandTrack — Análise de exposição de marca em mídias esportivas</div>
</body></html>`;

    return new Response(html, {
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
