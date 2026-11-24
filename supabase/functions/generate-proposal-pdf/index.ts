import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { drawContainedLogo, fetchLogoBytes, publicLogoUrl } from "../_shared/logo.ts";
import { carregarMarca, caminhoDoLogo, componentesRgb } from "../_shared/marca.ts";
import { quebrarTexto } from "../_shared/pdf_texto.ts";


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
    const marca = await carregarMarca(supabase, proposal.organization_id);
    const [pr, pg, pb] = componentesRgb(marca.primaria);
    const primary = rgb(pr, pg, pb);
    const text = rgb(0.059, 0.071, 0.129); // #0F1221
    const muted = rgb(0.42, 0.45, 0.52);
    let y = height - 60;

    const orgLogo = await fetchLogoBytes(
      publicLogoUrl(Deno.env.get("SUPABASE_URL")!, "org-logos", caminhoDoLogo(marca, "fundo_escuro")),
    );

    // Header
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: primary });
    const tituloX = orgLogo ? 100 : 40;
    if (orgLogo) {
      const box = { x: 36, y: height - 68, width: 52, height: 40 };
      page.drawRectangle({ ...box, color: rgb(1, 1, 1) });
      await drawContainedLogo(pdf, page, orgLogo, {
        x: box.x + 4,
        y: box.y + 4,
        width: box.width - 8,
        height: box.height - 8,
      });
    }
    page.drawText("PROPOSTA COMERCIAL", { x: tituloX, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    if (proposal.proposal_number) {
      page.drawText(`Nº ${proposal.proposal_number}`, { x: tituloX, y: height - 60, size: 10, font, color: rgb(0.93, 0.89, 1) });
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



    const ensure = (min: number) => {
      if (y < min) { page = pdf.addPage([595, 842]); y = height - 60; }
    };
    const contentWidth = width - 80;

    y = height - 110;
    for (const line of quebrarTexto(proposal.title, fontBold, 16, contentWidth)) {
      ensure(120);
      page.drawText(line, { x: 40, y, size: 16, font: fontBold, color: text });
      y -= 20;
    }
    y -= 8;

    const meta = (label: string, value: string) => {
      ensure(140);
      page.drawText(label, { x: 40, y, size: 9, font, color: muted });
      y -= 12;
      for (const line of quebrarTexto(value, fontBold, 11, contentWidth)) {
        ensure(120);
        page.drawText(line, { x: 40, y, size: 11, font: fontBold, color: text });
        y -= 14;
      }
      y -= 6;
    };
    meta("PATROCINADOR", proposal.sponsor?.name ?? proposal.brand ?? "—");
    if (proposal.property?.name) meta("PROJETO", proposal.property.name);
    meta("VÁLIDO ATÉ", proposal.valid_until ?? "—");

    if (proposal.message) {
      ensure(200);
      page.drawText("MENSAGEM", { x: 40, y, size: 9, font, color: muted });
      y -= 14;
      for (const line of quebrarTexto(proposal.message, font, 10, contentWidth)) {
        ensure(200);
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

    // Coluna "Item" vai de x=48 até antes da "Qtd" (x=340); detalhes, até a margem.
    const itemColWidth = 340 - 48 - 12;
    const detailWidth = width - 40 - 56;

    let total = 0;
    for (const [category, groupItems] of orderedGroups) {
      let groupTotal = 0;
      const categoryLines = quebrarTexto(category.toUpperCase(), fontBold, 9, width - 96);
      const extra = 12 * (categoryLines.length - 1);
      ensure(140 + extra);
      page.drawRectangle({ x: 40, y: y - 5 - extra, width: width - 80, height: 18 + extra, color: rgb(0.957, 0.933, 0.992) });
      for (const line of categoryLines) {
        page.drawText(line, { x: 48, y, size: 9, font: fontBold, color: primary });
        y -= 12;
      }
      y -= 10;

      for (const it of groupItems) {
        ensure(120);
        const lineTotal = Number(it.unit_value) * it.quantity;
        total += lineTotal;
        groupTotal += lineTotal;
        page.drawText(String(it.quantity), { x: 340, y, size: 10, font, color: text });
        if (!flat) {
          page.drawText(fmtBRL(Number(it.unit_value)), { x: 390, y, size: 10, font, color: text });
          page.drawText(fmtBRL(lineTotal), { x: 490, y, size: 10, font, color: text });
        }
        const nameLines = quebrarTexto(it.name, font, 10, itemColWidth);
        (nameLines.length ? nameLines : ["—"]).forEach((line, i) => {
          if (i > 0) ensure(110);
          page.drawText(line, { x: 48, y, size: 10, font, color: text });
          y -= 14;
        });
        const details = [
          ...quebrarTexto(it.description, font, 8, detailWidth),
          ...(it.notes ? quebrarTexto(`Obs.: ${it.notes}`, font, 8, detailWidth) : []),
        ];
        for (const line of details) {
          ensure(110);
          page.drawText(line, { x: 56, y, size: 8, font, color: muted });
          y -= 11;
        }
        y -= 5;
      }

      if (!flat) {
        ensure(110);
        page.drawText("Subtotal", { x: 390, y, size: 9, font, color: muted });
        page.drawText(fmtBRL(groupTotal), { x: 490, y, size: 9, font: fontBold, color: text });
      }
      y -= 20;
    }


    y -= 10;
    ensure(100);
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: muted });
    y -= 24;
    const grandTotal = flat ? Number((proposal as any).flat_value ?? proposal.total_value ?? 0) : total;
    page.drawText(flat ? "VALOR GERAL" : "TOTAL", { x: 360, y, size: 12, font: fontBold, color: text });
    page.drawText(fmtBRL(grandTotal), { x: 490, y, size: 12, font: fontBold, color: primary });

    // Footer
    page.drawText("Gerado por Brandplay", { x: 40, y: 30, size: 8, font, color: muted });

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
