import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const fmtDate = (d: string | null) => {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("pt-BR");
};

const sanitize = (t: string) => {
  if (!t) return "";
  return String(t)
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/—|–/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { opportunity_id, organization_id, contract_id } = body;
    if (!opportunity_id || !organization_id) {
      return new Response(JSON.stringify({ error: "opportunity_id e organization_id são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user belongs to the organization via profiles
    const { data: profile } = await userClient
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Acesso negado à organização" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify opportunity belongs to organization
    const { data: oppCheck } = await userClient
      .from("opportunities")
      .select("id")
      .eq("id", opportunity_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!oppCheck) {
      return new Response(JSON.stringify({ error: "Oportunidade não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to call security definer function
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: reportData, error: reportError } = await adminClient.rpc("get_delivery_report_data", {
      _opportunity_id: opportunity_id,
      _contract_id: contract_id || null,
    });
    if (reportError || !reportData) {
      console.error("get_delivery_report_data error", reportError);
      return new Response(JSON.stringify({ error: "Erro ao consolidar dados do relatório" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const report = reportData as {
      opportunity: { id: string; brand: string; value: number };
      contract: { id: string; title: string; total_value: number; start_date: string; end_date: string } | null;
      deliveries: { id: string; title: string; description: string; quantity: number; due_date: string; status: string; approval: string }[];
      evidence: { id: string; media_url: string; media_type: string; brand: string; detection_confidence: number; detected_at: string; event_name: string | null }[];
    };

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const PRIMARY = rgb(0.13, 0.32, 0.85);
    const MUTED = rgb(0.45, 0.45, 0.5);
    const TEXT = rgb(0.1, 0.1, 0.15);

    let page = pdf.addPage([595, 842]);
    let y = 800;
    const left = 40;
    const right = 555;

    const newPageIfNeeded = (needed = 60) => {
      if (y - needed < 40) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
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
    text("Relatório de Entrega", { x: left, y: 815, size: 18, bold: true, color: rgb(1, 1, 1) });
    text(`Marca: ${report.opportunity.brand}`, { x: left, y: 802, size: 9, color: rgb(1, 1, 1) });
    y = 780;

    // Opportunity summary
    text("Oportunidade", { bold: true, size: 13 });
    y -= 18;
    text(`Valor: ${fmtMoney(report.opportunity.value)}`, { color: MUTED, size: 10 });
    y -= 14;

    // Contract summary
    if (report.contract) {
      newPageIfNeeded(60);
      y -= 8;
      text("Contrato", { bold: true, size: 13 });
      y -= 18;
      text(`Título: ${report.contract.title}`, { color: MUTED, size: 10 });
      y -= 14;
      text(`Valor: ${fmtMoney(report.contract.total_value)}`, { color: MUTED, size: 10 });
      y -= 14;
      text(`Período: ${fmtDate(report.contract.start_date)} a ${fmtDate(report.contract.end_date)}`, { color: MUTED, size: 10 });
      y -= 14;
    }

    // Deliveries
    y -= 12;
    newPageIfNeeded(120);
    text("Entregas executadas", { bold: true, size: 13 });
    y -= 18;
    if (report.deliveries.length === 0) {
      text("Nenhuma entrega aprovada/entregue encontrada.", { color: MUTED, size: 10 });
      y -= 14;
    } else {
      for (const d of report.deliveries) {
        newPageIfNeeded(50);
        text(d.title, { bold: true, size: 11 });
        y -= 14;
        text(`Quantidade: ${d.quantity || 1}  •  Vencimento: ${fmtDate(d.due_date)}  •  Status: ${d.status}`, { color: MUTED, size: 9 });
        y -= 14;
        if (d.description) {
          text(d.description, { color: MUTED, size: 9 });
          y -= 12;
        }
        y -= 6;
      }
    }

    // Evidence
    y -= 12;
    newPageIfNeeded(120);
    text("Evidências BrandTrack", { bold: true, size: 13 });
    y -= 18;
    if (report.evidence.length === 0) {
      text("Nenhuma evidência de mídia encontrada.", { color: MUTED, size: 10 });
      y -= 14;
    } else {
      for (const e of report.evidence) {
        newPageIfNeeded(40);
        text(`${e.brand} — ${e.event_name || "Evento não informado"}`, { bold: true, size: 10 });
        y -= 13;
        text(`Detectado em: ${fmtDate(e.detected_at)}  •  Confiança: ${Math.round((e.detection_confidence || 0) * 100)}%`, { color: MUTED, size: 9 });
        y -= 13;
      }
    }

    // Footer
    y -= 20;
    newPageIfNeeded(30);
    text(`Relatório gerado em ${new Date().toLocaleString("pt-BR")} — BrandPlay`, { color: MUTED, size: 8 });

    const pdfBytes = await pdf.save();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
    const fileName = `relatorio-entrega-${report.opportunity.brand.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new Response(JSON.stringify({ file_name: fileName, pdf: base64 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-delivery-report error", err);
    return new Response(JSON.stringify({ error: "Erro interno ao gerar relatório" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
