import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { drawContainedLogo, fetchLogoBytes, publicLogoUrl } from "../_shared/logo.ts";
import { carregarMarca, caminhoDoLogo, componentesRgb } from "../_shared/marca.ts";
import { quebrarTexto } from "../_shared/pdf_texto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_assinatura: "Em assinatura",
  ativo: "Ativo",
  vencendo: "Vencendo",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

const PAY_LABELS: Record<string, string> = {
  a_vista: "À vista",
  parcelado: "Parcelado",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  personalizado: "Personalizado",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { contract_id } = await req.json();
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
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

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(
        "*, sponsor:sponsors(name,legal_name,address,trade_name,segment,tax_id,website,domain,about,logo_path,notes), property:sports_properties(name)",
      )
      .eq("id", contract_id)
      .single();
    if (cErr || !contract) throw cErr ?? new Error("contract not found");

    const [{ data: clauses }, { data: assets }, { data: installments }] = await Promise.all([
      supabase.from("contract_clauses").select("*").eq("contract_id", contract_id).order("position"),
      supabase.from("contract_assets").select("*, asset:assets(category)").eq("contract_id", contract_id).order("created_at"),
      supabase.from("installments").select("*").eq("contract_id", contract_id).order("installment_number"),
    ]);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const PAGE: [number, number] = [595, 842];
    let page = pdf.addPage(PAGE);
    const width = PAGE[0];
    const height = PAGE[1];
    const marca = await carregarMarca(supabase, contract.organization_id);
    const [pr, pg, pb] = componentesRgb(marca.primaria);
    const primary = rgb(pr, pg, pb);
    const text = rgb(0.059, 0.071, 0.129); // #0F1221
    const muted = rgb(0.42, 0.45, 0.52);
    let y = height - 60;

    const newPage = () => {
      page = pdf.addPage(PAGE);
      y = height - 60;
    };
    const ensure = (min: number) => {
      if (y < min) newPage();
    };
    const draw = (s: string, opts: { x: number; size: number; bold?: boolean; color?: any }) => {
      page.drawText(s, { x: opts.x, y, size: opts.size, font: opts.bold ? fontBold : font, color: opts.color ?? text });
    };
    const section = (title: string) => {
      ensure(140);
      y -= 10;
      page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 18, color: rgb(0.957, 0.933, 0.992) });
      draw(title.toUpperCase(), { x: 48, size: 9, bold: true, color: primary });
      y -= 26;
    };
    // Texto em várias linhas, sem cortar: quebra pela largura de `x` até `x + maxWidth`.
    const lines = (s: string, opts: { x: number; size: number; maxWidth: number; bold?: boolean; color?: any; step?: number; min?: number }) => {
      const found = quebrarTexto(s, opts.bold ? fontBold : font, opts.size, opts.maxWidth);
      for (const line of found) {
        ensure(opts.min ?? 90);
        draw(line, { x: opts.x, size: opts.size, bold: opts.bold, color: opts.color });
        y -= opts.step ?? opts.size + 3;
      }
      return found.length;
    };
    const paragraph = (s: string, indent = 40, size = 10, color = text) => {
      lines(s, { x: indent, size, color, maxWidth: width - 40 - indent });
    };

    // Header
    const orgLogo = await fetchLogoBytes(
      publicLogoUrl(Deno.env.get("SUPABASE_URL")!, "org-logos", caminhoDoLogo(marca, "fundo_escuro")),
    );
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
    page.drawText("CONTRATO DE PATROCÍNIO", { x: tituloX, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(
      `${contract.contract_number ? `Nº ${contract.contract_number} · ` : ""}${STATUS_LABELS[contract.status] ?? contract.status}`,
      { x: tituloX, y: height - 60, size: 10, font, color: rgb(0.93, 0.89, 1) },
    );

    const logoBytes = await fetchLogoBytes(
      publicLogoUrl(Deno.env.get("SUPABASE_URL")!, "sponsor-logos", contract.sponsor?.logo_path),
    );
    if (logoBytes) {
      const box = { x: width - 40 - 96, y: height - 72, width: 96, height: 56 };
      page.drawRectangle({ ...box, color: rgb(1, 1, 1) });
      await drawContainedLogo(pdf, page, logoBytes, {
        x: box.x + 6,
        y: box.y + 6,
        width: box.width - 12,
        height: box.height - 12,
      });
    }

    y = height - 110;
    lines(contract.title, { x: 40, size: 16, bold: true, maxWidth: width - 80, step: 20, min: 120 });
    y -= 10;

    // Resumo em duas colunas
    const cols = [40, 320];
    const pairs: [string, string][] = [
      ["PATROCINADOR", contract.sponsor?.name ?? contract.brand ?? "—"],
      ["PROPRIEDADE", contract.property?.name ?? "—"],
      ["VALOR TOTAL", fmtBRL(Number(contract.total_value))],
      [
        "PAGAMENTO",
        `${PAY_LABELS[contract.payment_method] ?? contract.payment_method}${contract.installments > 1 ? ` (${contract.installments}x)` : ""}`,
      ],
      ["VIGÊNCIA", `${fmtDate(contract.start_date)} a ${fmtDate(contract.end_date)}`],
      ["VENCIMENTO", contract.due_day ? `Todo dia ${contract.due_day}` : "—"],
    ];
    // Cada linha do resumo tem a altura do valor mais longo entre as duas colunas.
    const colWidths = [cols[1] - cols[0] - 16, width - 40 - cols[1]];
    for (let i = 0; i < pairs.length; i += 2) {
      const row = pairs.slice(i, i + 2).map(([label, value], c) => ({
        label,
        x: cols[c],
        values: quebrarTexto(value, fontBold, 11, colWidths[c]),
      }));
      const rowLines = Math.max(1, ...row.map((r) => r.values.length));
      ensure(110 + 14 * rowLines);
      for (const r of row) {
        page.drawText(r.label, { x: r.x, y, size: 8, font, color: muted });
        r.values.forEach((v, n) => {
          page.drawText(v, { x: r.x, y: y - 13 - 14 * n, size: 11, font: fontBold, color: text });
        });
      }
      y -= 22 + 14 * rowLines;
    }

    // Dados do patrocinador
    const sp = contract.sponsor;
    if (sp) {
      section("Dados do patrocinador");
      const rows: [string, string | null][] = [
        ["Razão social", sp.legal_name ?? sp.name],
        ["Nome", sp.name],
        ["Nome fantasia", sp.trade_name],
        ["CNPJ / CPF", sp.tax_id],
        ["Segmento", sp.segment],
        ["Endereço", sp.address],
        ["Site", sp.website ?? sp.domain],
      ];
      for (const [label, value] of rows) {
        if (!value) continue;
        ensure(90);
        draw(`${label}:`, { x: 48, size: 9, color: muted });
        lines(String(value), { x: 190, size: 10, maxWidth: width - 40 - 190, step: 13 });
        y -= 2;
      }
      if (sp.about) {
        y -= 6;
        paragraph(String(sp.about), 48, 9, muted);
      }
    }

    // Ativos contratados agrupados por categoria
    if (assets?.length) {
      section("Ativos contratados");
      page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 20, color: rgb(0.96, 0.97, 0.99) });
      const flat = !!(contract as any).use_flat_value;
      draw("Ativo", { x: 48, size: 9, bold: true });
      draw("Qtd", { x: 340, size: 9, bold: true });
      if (!flat) {
        draw("Valor un.", { x: 390, size: 9, bold: true });
        draw("Total", { x: 490, size: 9, bold: true });
      }
      y -= 24;

      const groups = new Map<string, any[]>();
      for (const a of assets) {
        const cat = (a.asset?.category ?? "").trim() || (a.asset_id ? "Sem categoria" : "Itens livres");
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(a);
      }
      const ordered = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

      let assetsTotal = 0;
      for (const [category, list] of ordered) {
        ensure(130);
        lines(category.toUpperCase(), { x: 48, size: 8, bold: true, color: primary, maxWidth: width - 96, step: 11, min: 120 });
        y -= 5;
        let groupTotal = 0;
        for (const a of list) {
          ensure(110);
          const lineTotal = Number(a.unit_value || 0) * Number(a.quantity || 0);
          groupTotal += lineTotal;
          assetsTotal += lineTotal;
          draw(String(a.quantity), { x: 340, size: 10 });
          if (!flat) {
            draw(fmtBRL(Number(a.unit_value)), { x: 390, size: 10 });
            draw(fmtBRL(lineTotal), { x: 490, size: 10 });
          }
          // Coluna "Ativo" vai de x=48 até antes da "Qtd" (x=340).
          if (!lines(a.name, { x: 48, size: 10, maxWidth: 340 - 48 - 12, step: 14, min: 100 })) y -= 14;
          if (a.notes) {
            lines(`Obs.: ${a.notes}`, { x: 56, size: 8, color: muted, maxWidth: width - 40 - 56, step: 12, min: 100 });
          }
          y -= 3;
        }
        if (!flat) {
          ensure(100);
          draw("Subtotal", { x: 390, size: 9, color: muted });
          draw(fmtBRL(groupTotal), { x: 490, size: 9, bold: true });
        }
        y -= 20;
      }

      ensure(100);
      page.drawLine({ start: { x: 40, y: y + 8 }, end: { x: width - 40, y: y + 8 }, thickness: 0.5, color: muted });
      draw(flat ? "VALOR GERAL DO CONTRATO" : "TOTAL DOS ATIVOS", { x: 300, size: 11, bold: true });
      draw(fmtBRL(flat ? Number((contract as any).flat_value ?? contract.total_value ?? 0) : assetsTotal), { x: 490, size: 11, bold: true, color: primary });
      y -= 24;
    }

    // Parcelas
    if (installments?.length) {
      section("Plano de pagamento");
      page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 20, color: rgb(0.96, 0.97, 0.99) });
      draw("Parcela", { x: 48, size: 9, bold: true });
      draw("Vencimento", { x: 180, size: 9, bold: true });
      draw("Valor", { x: 330, size: 9, bold: true });
      draw("Situação", { x: 460, size: 9, bold: true });
      y -= 24;
      for (const p of installments) {
        ensure(100);
        draw(`${p.installment_number}/${p.total_installments}`, { x: 48, size: 10 });
        draw(fmtDate(p.due_date), { x: 180, size: 10 });
        draw(fmtBRL(Number(p.amount)), { x: 330, size: 10 });
        draw(String(p.status ?? "—"), { x: 460, size: 10, color: muted });
        y -= 15;
      }
      y -= 10;
    }

    // Cláusulas
    if (clauses?.length) {
      section("Cláusulas");
      clauses.forEach((cl, i) => {
        ensure(120);
        lines(`${i + 1}. ${cl.title ?? ""}`, { x: 48, size: 10, bold: true, maxWidth: width - 40 - 48, step: 14, min: 110 });
        y -= 2;
        if (cl.content) paragraph(String(cl.content), 56, 9, muted);
        y -= 8;
      });
    }

    // Detalhes
    if (contract.signatories || contract.notes) {
      section("Detalhes");
      if (contract.signatories) {
        draw("Signatários", { x: 48, size: 9, color: muted });
        y -= 14;
        paragraph(String(contract.signatories), 48, 10);
        y -= 6;
      }
      if (contract.notes) {
        ensure(120);
        draw("Observações", { x: 48, size: 9, color: muted });
        y -= 14;
        paragraph(String(contract.notes), 48, 10);
      }
    }

    // Assinaturas
    ensure(200);
    y -= 30;
    page.drawLine({ start: { x: 60, y }, end: { x: 260, y }, thickness: 0.7, color: muted });
    page.drawLine({ start: { x: 330, y }, end: { x: 530, y }, thickness: 0.7, color: muted });
    y -= 14;
    draw("Propriedade", { x: 60, size: 9, color: muted });
    lines(contract.sponsor?.name ?? contract.brand ?? "Patrocinador", { x: 330, size: 9, color: muted, maxWidth: 200, step: 12, min: 40 });

    for (const p of pdf.getPages()) {
      p.drawText(`Gerado por Brandplay · ${new Date().toLocaleDateString("pt-BR")}`, {
        x: 40,
        y: 28,
        size: 8,
        font,
        color: muted,
      });
    }

    const bytes = await pdf.save();
    const path = `${user.id}/${contract_id}/contrato-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("contracts")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

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
