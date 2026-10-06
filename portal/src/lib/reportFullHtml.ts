import { buildAnalytics, type AnalyticsInput } from "@/components/reports/AnalyticsTab";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

interface FullReportInput extends AnalyticsInput {
  from: string;
  to: string;
  orgName?: string | null;
  propertyLabel?: string | null;
  sponsorLabel?: string | null;
  kpis: {
    received: number; expected: number; overdue: number; activeContracts: number;
    pipelineValue: number; winRate: number; overdueDeliveries: number;
  };
  cashflow: { label: string; recebido: number; previsto: number }[];
  funnel: { stage: string; count: number; value: number }[];
  topSponsors: { name: string; total: number; contracts: number }[];
}

const table = (headers: string[], rows: (string | number)[][]) => `
<table>
  <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${
    rows.length
      ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}" class="muted">Sem dados no período.</td></tr>`
  }</tbody>
</table>`;

export const openFullReport = (input: FullReportInput) => {
  const a = buildAnalytics(input);
  const k = input.kpis;
  const maxCash = Math.max(1, ...input.cashflow.map((m) => m.recebido + m.previsto));

  const kpiCard = (label: string, value: string) =>
    `<div class="kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório completo — ${esc(input.from)} a ${esc(input.to)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #16181d; margin: 0; padding: 32px; }
  h1 { font-size: 26px; margin: 0; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #1f52d9; text-transform: uppercase; letter-spacing: .04em; }
  .cover { background: linear-gradient(135deg,#1f52d9,#0b1f52); color:#fff; border-radius: 14px; padding: 28px; margin-bottom: 22px; }
  .cover p { margin: 6px 0 0; opacity: .85; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .kpi { border:1px solid #e2e5ee; border-radius:10px; padding:10px 12px; }
  .kpi span { display:block; font-size:10px; color:#666e82; text-transform: uppercase; letter-spacing:.05em; }
  .kpi strong { display:block; font-size:16px; margin-top:4px; }
  table { width:100%; border-collapse: collapse; font-size: 11.5px; margin-top: 6px; }
  th { text-align:left; background:#f2f4fa; padding:7px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:#48506a; }
  td { padding:7px 8px; border-bottom:1px solid #eceef5; }
  .muted { color:#8a90a3; }
  .chart { display:flex; align-items:flex-end; gap:6px; height:150px; border-bottom:1px solid #dfe3ee; padding-top:8px; }
  .bar { flex:1; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; height:100%; }
  .bar .s1 { width:100%; background:#1f52d9; }
  .bar .s2 { width:100%; background:#8fa8ee; }
  .bar small { font-size:8px; color:#666e82; margin-top:4px; }
  .legend { font-size:10px; color:#666e82; margin-top:8px; }
  .legend i { display:inline-block; width:9px; height:9px; margin-right:4px; border-radius:2px; }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  @media print { body { padding:14px; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style></head><body>
<div class="cover">
  <h1>Relatório executivo completo</h1>
  <p>${esc(input.orgName || "")}${input.orgName ? " · " : ""}Período: ${esc(input.from)} a ${esc(input.to)}</p>
  <p>Propriedade: ${esc(input.propertyLabel || "Todas")} · Patrocinador: ${esc(input.sponsorLabel || "Todos")}</p>
  <p>Gerado em ${new Date().toLocaleString("pt-BR")}</p>
</div>

<h2>Indicadores gerais</h2>
<div class="grid">
  ${kpiCard("Recebido", fmtMoney(k.received))}
  ${kpiCard("Previsto", fmtMoney(k.expected))}
  ${kpiCard("Em atraso", fmtMoney(k.overdue))}
  ${kpiCard("Contratos ativos", String(k.activeContracts))}
  ${kpiCard("Pipeline aberto", fmtMoney(k.pipelineValue))}
  ${kpiCard("Win rate", `${k.winRate.toFixed(1)}%`)}
  ${kpiCard("Entregas atrasadas", String(k.overdueDeliveries))}
  ${kpiCard("Ticket médio", fmtMoney(a.ticketMedio))}
  ${kpiCard("Ciclo médio de venda", `${a.cicloMedio.toFixed(0)} dias`)}
  ${kpiCard("Adimplência", `${a.adimplencia.toFixed(1)}%`)}
  ${kpiCard("Entregas no prazo", `${a.slaRate.toFixed(1)}%`)}
  ${kpiCard("Renovações 90d", fmtMoney(a.renewalValue))}
</div>

<h2>Fluxo de caixa</h2>
<div class="chart">
  ${input.cashflow
    .map(
      (m) => `<div class="bar">
        <div class="s2" style="height:${(m.previsto / maxCash) * 100}%"></div>
        <div class="s1" style="height:${(m.recebido / maxCash) * 100}%"></div>
        <small>${esc(m.label)}</small>
      </div>`,
    )
    .join("")}
</div>
<div class="legend"><i style="background:#1f52d9"></i>Recebido &nbsp; <i style="background:#8fa8ee"></i>Previsto</div>
${table(
  ["Mês", "Recebido", "Previsto", "Total"],
  input.cashflow.map((m) => [m.label, fmtMoney(m.recebido), fmtMoney(m.previsto), fmtMoney(m.recebido + m.previsto)]),
)}

<h2>Aging de recebíveis em atraso</h2>
${table(["Faixa", "Parcelas", "Valor"], a.buckets.map((b) => [b.label, b.count, fmtMoney(b.value)]))}

<h2>Funil e conversão</h2>
<div class="two">
  <div>${table(["Etapa", "Qtd", "Valor"], input.funnel.map((f) => [f.stage, f.count, fmtMoney(f.value)]))}</div>
  <div>${table(
    ["Etapa", "Alcançaram", "Conversão"],
    a.conversionRows.map((c) => [c.stage, c.reached, `${c.rate.toFixed(0)}%`]),
  )}</div>
</div>

<h2>Evolução mensal de negócios</h2>
${table(
  ["Mês", "Novas oportunidades", "Ganhas", "Receita ganha"],
  a.monthlyRows.map((m) => [m.label, m.novas, m.ganhas, fmtMoney(m.valor)]),
)}

<h2>Motivos de perda</h2>
${table(["Motivo", "Qtd", "Valor perdido"], a.lossRows.map((l) => [String(l.reason).replace(/_/g, " "), l.count, fmtMoney(l.value)]))}
${a.competitors.length ? table(["Concorrente", "Perdas"], a.competitors.map((c) => [c.name, c.count])) : ""}

<h2>Receita por propriedade</h2>
${table(
  ["Propriedade", "Contratos", "Ativos", "Receita"],
  a.propertyRows.map((p) => [p.name, p.contracts, p.ativo, fmtMoney(p.total)]),
)}

<h2>Top patrocinadores</h2>
${table(
  ["Patrocinador", "Contratos", "Receita"],
  input.topSponsors.map((s) => [s.name, s.contracts, fmtMoney(s.total)]),
)}

<h2>Entregas por categoria</h2>
${table(
  ["Categoria", "Total", "Concluídas", "Atrasadas"],
  a.categoryRows.map((c) => [c.name, c.total, c.concluidas, c.atrasadas]),
)}
<p class="legend">Aprovadas: ${a.approved} · Reprovadas: ${a.rejected} · Com evidência: ${a.evidenceRate.toFixed(0)}% de ${a.totalDel} entregas</p>

<h2>Renovações nos próximos 90 dias</h2>
${table(
  ["Contrato", "Patrocinador", "Vencimento", "Dias", "Valor"],
  a.renewals.map((r) => [r.title, r.sponsor || r.brand, r.end_date ?? "-", r.dias, fmtMoney(r.value)]),
)}

<h2>Detalhamento de parcelas</h2>
${table(
  ["Vencimento", "Valor", "Pago", "Status", "Pago em"],
  input.installments
    .slice()
    .sort((x, y) => (x.due_date > y.due_date ? 1 : -1))
    .map((i) => [i.due_date, fmtMoney(Number(i.amount)), fmtMoney(Number(i.paid_amount ?? 0)), i.status, i.paid_at?.slice(0, 10) ?? "-"]),
)}
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
  return true;
};
