import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { drawContainedLogo, fetchLogoBytes, publicLogoUrl } from "../_shared/logo.ts";

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
    const primary = rgb(0.18, 0.43, 0.95);
    const text = rgb(0.1, 0.12, 0.16);
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
      page.drawRectangle({ x: 40, y: y - 5, width: width - 80, height: 18, color: rgb(0.93, 0.95, 1) });
      draw(title.toUpperCase(), { x: 48, size: 9, bold: true, color: primary });
      y -= 26;
    };
    const paragraph = (s: string, indent = 40, size = 10, color = text) => {
      for (const line of wrap(s, size === 10 ? 92 : 105)) {
        ensure(90);
        draw(line, { x: indent, size, color });
        y -= size + 3;
      }
    };

    // Header
    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: primary });
    page.drawText("CONTRATO DE PATROCÍNIO", { x: 40, y: height - 38, size: 18, font: fontBold, color: rgb(1, 1, 1) });
    page.drawText(
      `${contract.contract_number ? `Nº ${contract.contract_number} · ` : ""}${STATUS_LABELS[contract.status] ?? contract.status}`,
      { x: 40, y: height - 60, size: 10, font, color: rgb(0.9, 0.95, 1) },
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
    draw(truncate(contract.title, 60), { x: 40, size: 16, bold: true });
    y -= 30;

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
    pairs.forEach(([label, value], i) => {
      const x = cols[i % 2];
      if (i % 2 === 0) ensure(140);
      page.drawText(label, { x, y, size: 8, font, color: muted });
      page.drawText(truncate(value, 40), { x, y: y - 13, size: 11, font: fontBold, color: text });
      if (i % 2 === 1) y -= 36;
    });
    if (pairs.length % 2 === 1) y -= 36;

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
        draw(truncate(String(value), 60), { x: 190, size: 10 });
        y -= 15;
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
        draw(truncate(category.toUpperCase(), 60), { x: 48, size: 8, bold: true, color: primary });
        y -= 16;
        let groupTotal = 0;
        for (const a of list) {
          ensure(110);
          const lineTotal = Number(a.unit_value || 0) * Number(a.quantity || 0);
          groupTotal += lineTotal;
          assetsTotal += lineTotal;
          draw(truncate(a.name, 45), { x: 48, size: 10 });
          draw(String(a.quantity), { x: 340, size: 10 });
          if (!flat) {
            draw(fmtBRL(Number(a.unit_value)), { x: 390, size: 10 });
            draw(fmtBRL(lineTotal), { x: 490, size: 10 });
          }
          y -= 14;
          if (a.notes) {
            ensure(100);
            draw(truncate(`Obs.: ${a.notes}`, 95), { x: 56, size: 8, color: muted });
            y -= 12;
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
        draw(`${i + 1}. ${truncate(cl.title, 70)}`, { x: 48, size: 10, bold: true });
        y -= 16;
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
    draw(truncate(contract.sponsor?.name ?? contract.brand ?? "Patrocinador", 34), { x: 330, size: 9, color: muted });

    for (const p of pdf.getPages()) {
      p.drawText(`Gerado por BrandPlay · ${new Date().toLocaleDateString("pt-BR")}`, {
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

function wrap(s: string, n: number) {
  const out: string[] = [];
  for (const para of String(s).split("\n")) {
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
  const v = String(s ?? "");
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
}
