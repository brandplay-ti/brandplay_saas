import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { drawContainedLogo, fetchLogoBytes, publicLogoUrl } from "../_shared/logo.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { proposal_id } = await req.json();
    if (!proposal_id) {
      return new Response(JSON.stringify({ error: "proposal_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: proposal, error: pErr } = await supabase
      .from("proposals")
      .select("*, sponsor:sponsors(name,segment,logo_path), property:sports_properties(name)")
      .eq("id", proposal_id)
      .single();
    if (pErr || !proposal) throw pErr ?? new Error("proposal not found");


    const { data: items } = await supabase
      .from("proposal_items")
      .select("*, asset:assets(category)")
      .eq("proposal_id", proposal_id)
      .order("position");


    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    const { width, height } = page.getSize();
    const primary = rgb(0.18, 0.43, 0.95);
    const text = rgb(0.1, 0.12, 0.16);
    const muted = rgb(0.42, 0.45, 0.52);
    let y = height - 60;

    // Header
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: primary });
    page.drawText("PROPOSTA COMERCIAL", { x: 40, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    if (proposal.proposal_number) {
      page.drawText(`Nº ${proposal.proposal_number}`, { x: 40, y: height - 60, size: 10, font, color: rgb(0.9, 0.95, 1) });
    }

    // Sponsor logo — centered and proportional inside a fixed white frame
    const logoBytes = await fetchLogoBytes(
      publicLogoUrl(Deno.env.get("SUPABASE_URL")!, "sponsor-logos", proposal.sponsor?.logo_path),
    );
    const logoBox = { x: width - 40 - 96, y: height - 72, width: 96, height: 56 };
    if (logoBytes) {
      page.drawRectangle({ ...logoBox, color: rgb(1, 1, 1) });
      await drawContainedLogo(pdf, page, logoBytes, {
        x: logoBox.x + 6,
        y: logoBox.y + 6,
        width: logoBox.width - 12,
        height: logoBox.height - 12,
      });
    }



    y = height - 110;
    page.drawText(proposal.title, { x: 40, y, size: 16, font: fontBold, color: text });
    y -= 28;

    const meta = (label: string, value: string) => {
      page.drawText(label, { x: 40, y, size: 9, font, color: muted });
      page.drawText(value, { x: 40, y: y - 12, size: 11, font: fontBold, color: text });
      y -= 32;
    };
    meta("PATROCINADOR", proposal.sponsor?.name ?? proposal.brand ?? "—");
    if (proposal.property?.name) meta("PROPRIEDADE", proposal.property.name);
    meta("VÁLIDO ATÉ", proposal.valid_until ?? "—");

    if (proposal.message) {
      page.drawText("MENSAGEM", { x: 40, y, size: 9, font, color: muted });
      y -= 14;
      const lines = wrap(proposal.message, 90);
      for (const line of lines) {
        if (y < 200) { page = pdf.addPage([595, 842]); y = height - 60; }
        page.drawText(line, { x: 40, y, size: 10, font, color: text });
        y -= 14;
      }
      y -= 10;
    }

    // Tabela de itens agrupada por categoria
    page.drawText("ITENS", { x: 40, y, size: 9, font, color: muted });
    y -= 18;
    page.drawRectangle({ x: 40, y: y - 4, width: width - 80, height: 22, color: rgb(0.95, 0.96, 0.99) });
    const flat = !!(proposal as any).use_flat_value;
    page.drawText("Item", { x: 48, y, size: 10, font: fontBold, color: text });
    page.drawText("Qtd", { x: 340, y, size: 10, font: fontBold, color: text });
    if (!flat) {
      page.drawText("Valor un.", { x: 390, y, size: 10, font: fontBold, color: text });
      page.drawText("Total", { x: 490, y, size: 10, font: fontBold, color: text });
    }
    y -= 22;

    const groups = new Map<string, any[]>();
    for (const it of items ?? []) {
      const cat = (it.asset?.category ?? "").trim() ||
        (it.asset_id ? "Sem categoria" : "Itens livres");
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(it);
    }
    const orderedGroups = Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR")
    );

    let total = 0;
    for (const [category, groupItems] of orderedGroups) {
      if (y < 140) { page = pdf.addPage([595, 842]); y = height - 60; }
      let groupTotal = 0;
      page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 18, color: rgb(0.93, 0.95, 1) });
      page.drawText(truncate(category.toUpperCase(), 60), { x: 48, y, size: 9, font: fontBold, color: primary });
      y -= 22;

      for (const it of groupItems) {
        if (y < 120) { page = pdf.addPage([595, 842]); y = height - 60; }
        const lineTotal = Number(it.unit_value) * it.quantity;
        total += lineTotal;
        groupTotal += lineTotal;
        page.drawText(truncate(it.name, 45), { x: 48, y, size: 10, font, color: text });
        page.drawText(String(it.quantity), { x: 340, y, size: 10, font, color: text });
        if (!flat) {
          page.drawText(fmtBRL(Number(it.unit_value)), { x: 390, y, size: 10, font, color: text });
          page.drawText(fmtBRL(lineTotal), { x: 490, y, size: 10, font, color: text });
        }
        y -= 14;
        if (it.description) {
          if (y < 110) { page = pdf.addPage([595, 842]); y = height - 60; }
          page.drawText(truncate(String(it.description), 80), { x: 56, y, size: 8, font, color: muted });
          y -= 11;
        }
        if (it.notes) {
          if (y < 110) { page = pdf.addPage([595, 842]); y = height - 60; }
          page.drawText(truncate(`Obs.: ${it.notes}`, 80), { x: 56, y, size: 8, font, color: muted });
          y -= 11;
        }
        y -= 5;
      }

      if (!flat) {
        if (y < 110) { page = pdf.addPage([595, 842]); y = height - 60; }
        page.drawText("Subtotal", { x: 390, y, size: 9, font, color: muted });
        page.drawText(fmtBRL(groupTotal), { x: 490, y, size: 9, font: fontBold, color: text });
      }
      y -= 20;
    }


    y -= 10;
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: muted });
    y -= 24;
    const grandTotal = flat ? Number((proposal as any).flat_value ?? proposal.total_value ?? 0) : total;
    page.drawText(flat ? "VALOR GERAL" : "TOTAL", { x: 360, y, size: 12, font: fontBold, color: text });
    page.drawText(fmtBRL(grandTotal), { x: 490, y, size: 12, font: fontBold, color: primary });

    // Footer
    page.drawText("Gerado por BrandPlay", { x: 40, y: 30, size: 8, font, color: muted });

    const bytes = await pdf.save();
    const path = `${user.id}/${proposal_id}/proposta-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("proposals")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    await supabase
      .from("proposals")
      .update({ pdf_path: path, total_value: grandTotal })
      .eq("id", proposal_id);

    return new Response(JSON.stringify({ pdf_path: path }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function wrap(s: string, n: number) {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      if ((line + " " + w).trim().length > n) {
        out.push(line.trim());
        line = w;
      } else line += " " + w;
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
