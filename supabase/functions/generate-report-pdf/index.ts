import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Body {
  from: string;
  to: string;
  property_name: string | null;
  sponsor_name: string | null;
  kpis: {
    received: number; expected: number; overdue: number;
    activeContracts: number; pipelineValue: number;
    winRate: number; overdueDeliveries: number;
  };
  cashflow: { label: string; recebido: number; previsto: number }[];
  funnel: { stage: string; count: number; value: number }[];
  top_sponsors: { name: string; total: number; contracts: number }[];
  expiring_contracts: { title: string; brand: string; end_date: string | null; total_value: number }[];
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = (await req.json()) as Body;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const PRIMARY = rgb(0.13, 0.32, 0.85);
    const MUTED = rgb(0.45, 0.45, 0.5);
    const TEXT = rgb(0.1, 0.1, 0.15);

    let page = pdf.addPage([595, 842]); // A4
    let y = 800;
    const left = 40;
    const right = 555;

    const newPageIfNeeded = (needed = 60) => {
      if (y - needed < 40) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
    };

    // WinAnsi (pdf-lib StandardFonts) only supports a limited charset.
    // Strip/replace anything outside it to avoid encode errors (e.g. emojis, ■, ✓).
    const sanitize = (t: string) => {
      if (!t) return "";
      return String(t)
        .replace(/[•·]/g, "-")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/—|–/g, "-")
        .replace(/\u00A0/g, " ")
        // Drop any remaining non-WinAnsi character (keep basic Latin-1 + common accents)
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
    };

    const text = (t: string, opts: { x?: number; size?: number; bold?: boolean; color?: any } = {}) => {
      page.drawText(sanitize(t), {
        x: opts.x ?? left,
        y,
        size: opts.size ?? 10,
        font: opts.bold ? bold : font,
        color: opts.color ?? TEXT,
      });
    };

    // Header
    page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: PRIMARY });
    page.drawText(sanitize("Relatório executivo"), { x: left, y: 815, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText(sanitize(`Período: ${body.from} a ${body.to}`), { x: left, y: 802, size: 9, font, color: rgb(1, 1, 1) });
    y = 780;

    if (body.property_name || body.sponsor_name) {
      text(
        `Filtros: ${body.property_name ? `Propriedade: ${body.property_name}` : ""}${body.property_name && body.sponsor_name ? "  •  " : ""}${body.sponsor_name ? `Patrocinador: ${body.sponsor_name}` : ""}`,
        { color: MUTED, size: 9 }
      );
      y -= 18;
    }

    // KPIs grid
    text("Indicadores", { bold: true, size: 13 });
    y -= 18;
    const kpiItems: [string, string][] = [
      ["Recebido", fmtMoney(body.kpis.received)],
      ["Previsto", fmtMoney(body.kpis.expected)],
      ["Em atraso", fmtMoney(body.kpis.overdue)],
      ["Pipeline aberto", fmtMoney(body.kpis.pipelineValue)],
      ["Contratos ativos", String(body.kpis.activeContracts)],
      ["Win rate", `${body.kpis.winRate.toFixed(1)}%`],
      ["Entregas atrasadas", String(body.kpis.overdueDeliveries)],
    ];
    const colW = (right - left) / 4;
    let col = 0;
    kpiItems.forEach(([label, value]) => {
      const x = left + col * colW;
      page.drawRectangle({ x, y: y - 36, width: colW - 8, height: 38, borderColor: rgb(0.85, 0.85, 0.9), borderWidth: 0.5 });
      page.drawText(sanitize(label), { x: x + 6, y: y - 12, size: 8, font, color: MUTED });
      page.drawText(sanitize(value), { x: x + 6, y: y - 28, size: 11, font: bold, color: TEXT });
      col++;
      if (col === 4) { col = 0; y -= 46; }
    });
    if (col !== 0) y -= 46;
    y -= 4;

    // Cashflow
    newPageIfNeeded(160);
    text("Fluxo de caixa (12 meses)", { bold: true, size: 13 });
    y -= 16;
    const chartH = 110;
    const chartW = right - left;
    const maxVal = Math.max(1, ...body.cashflow.map((m) => m.recebido + m.previsto));
    const barW = chartW / Math.max(body.cashflow.length, 1) - 4;
    const baseY = y - chartH;
    page.drawLine({ start: { x: left, y: baseY }, end: { x: right, y: baseY }, color: rgb(0.8, 0.8, 0.85), thickness: 0.5 });
    body.cashflow.forEach((m, i) => {
      const x = left + i * (barW + 4);
      const recH = (m.recebido / maxVal) * chartH;
      const prevH = (m.previsto / maxVal) * chartH;
      page.drawRectangle({ x, y: baseY, width: barW, height: recH, color: PRIMARY });
      page.drawRectangle({ x, y: baseY + recH, width: barW, height: prevH, color: rgb(0.55, 0.7, 0.95) });
      page.drawText(sanitize(m.label), { x, y: baseY - 10, size: 6, font, color: MUTED });
    });
    y = baseY - 24;
    text("- Recebido", { color: PRIMARY, size: 8 });
    text("- Previsto", { x: left + 70, color: rgb(0.55, 0.7, 0.95), size: 8 });
    y -= 18;

    // Funnel table
    newPageIfNeeded(120);
    text("Funil de pipeline", { bold: true, size: 13 });
    y -= 16;
    text("Estágio", { bold: true, size: 9 });
    page.drawText("Qtd", { x: left + 250, y, size: 9, font: bold });
    page.drawText("Valor", { x: left + 320, y, size: 9, font: bold });
    y -= 12;
    body.funnel.forEach((f) => {
      newPageIfNeeded(20);
      text(f.stage, { size: 9 });
      page.drawText(sanitize(String(f.count)), { x: left + 250, y, size: 9, font });
      page.drawText(sanitize(fmtMoney(f.value)), { x: left + 320, y, size: 9, font });
      y -= 12;
    });
    y -= 10;

    // Top sponsors
    if (body.top_sponsors.length) {
      newPageIfNeeded(80);
      text("Top patrocinadores por receita", { bold: true, size: 13 });
      y -= 16;
      text("Patrocinador", { bold: true, size: 9 });
      page.drawText("Contratos", { x: left + 280, y, size: 9, font: bold });
      page.drawText("Receita", { x: left + 360, y, size: 9, font: bold });
      y -= 12;
      body.top_sponsors.slice(0, 10).forEach((s) => {
        newPageIfNeeded(20);
        text(s.name.slice(0, 50), { size: 9 });
        page.drawText(sanitize(String(s.contracts)), { x: left + 280, y, size: 9, font });
        page.drawText(sanitize(fmtMoney(s.total)), { x: left + 360, y, size: 9, font });
        y -= 12;
      });
      y -= 10;
    }

    // Expiring contracts
    if (body.expiring_contracts.length) {
      newPageIfNeeded(80);
      text("Contratos vencendo em 60 dias", { bold: true, size: 13 });
      y -= 16;
      body.expiring_contracts.forEach((c) => {
        newPageIfNeeded(20);
        text(`- ${c.title} - ${c.brand}  (vence ${c.end_date ?? "-"})  ${fmtMoney(c.total_value)}`, { size: 9 });
        y -= 12;
      });
    }

    const bytes = await pdf.save();
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    const base64 = btoa(bin);

    return new Response(JSON.stringify({ pdf_base64: base64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-report-pdf error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
