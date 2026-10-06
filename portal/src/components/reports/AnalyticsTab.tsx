import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";

export interface AnalyticsInput {
  contracts: any[];
  opportunities: any[];
  installments: any[];
  deliveries: any[];
  propertyName: (id: string | null) => string;
  sponsorName: (id: string | null) => string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

export const buildAnalytics = ({
  contracts, opportunities, installments, deliveries, propertyName, sponsorName,
}: AnalyticsInput) => {
  const today = todayISO();

  // Ticket médio e ciclo de vendas
  const activeContracts = contracts.filter((c) => c.status === "ativo");
  const ticketMedio = contracts.length
    ? contracts.reduce((s, c) => s + Number(c.total_value || 0), 0) / contracts.length
    : 0;
  const won = opportunities.filter((o) => o.stage === "fechado");
  const cicloMedio = won.length
    ? won.reduce((s, o) => s + daysBetween(o.created_at, o.updated_at ?? o.created_at), 0) / won.length
    : 0;

  // Adimplência
  const dueSoFar = installments.filter((i) => i.due_date <= today);
  const paidSoFar = dueSoFar.filter((i) => i.status === "pago");
  const adimplencia = dueSoFar.length ? (paidSoFar.length / dueSoFar.length) * 100 : 100;

  // Aging de recebíveis em atraso
  const buckets = [
    { label: "1-15 dias", min: 1, max: 15, value: 0, count: 0 },
    { label: "16-30 dias", min: 16, max: 30, value: 0, count: 0 },
    { label: "31-60 dias", min: 31, max: 60, value: 0, count: 0 },
    { label: "60+ dias", min: 61, max: 99999, value: 0, count: 0 },
  ];
  installments
    .filter((i) => i.status !== "pago" && i.status !== "cancelado" && i.due_date < today)
    .forEach((i) => {
      const d = daysBetween(i.due_date, today);
      const b = buckets.find((x) => d >= x.min && d <= x.max);
      if (b) { b.value += Number(i.amount || 0); b.count += 1; }
    });

  // Receita por propriedade
  const byProperty = new Map<string, { name: string; total: number; contracts: number; ativo: number }>();
  contracts.forEach((c) => {
    const key = c.property_id ?? "sem";
    const cur = byProperty.get(key) ?? { name: propertyName(c.property_id) || "Sem propriedade", total: 0, contracts: 0, ativo: 0 };
    cur.total += Number(c.total_value || 0);
    cur.contracts += 1;
    if (c.status === "ativo") cur.ativo += 1;
    byProperty.set(key, cur);
  });
  const propertyRows = Array.from(byProperty.values()).sort((a, b) => b.total - a.total);

  // Motivos de perda
  const lostOpps = opportunities.filter((o) => o.stage === "perdido");
  const lossMap = new Map<string, { reason: string; count: number; value: number }>();
  lostOpps.forEach((o) => {
    const r = o.lost_reason || "Não informado";
    const cur = lossMap.get(r) ?? { reason: r, count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(o.lost_value ?? o.value ?? 0);
    lossMap.set(r, cur);
  });
  const lossRows = Array.from(lossMap.values()).sort((a, b) => b.count - a.count);

  // Concorrentes
  const compMap = new Map<string, number>();
  lostOpps.forEach((o) => {
    if (!o.lost_competitor) return;
    compMap.set(o.lost_competitor, (compMap.get(o.lost_competitor) ?? 0) + 1);
  });
  const competitors = Array.from(compMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Conversão entre etapas
  const order = ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado"];
  const labels: Record<string, string> = {
    prospect: "Prospect", reuniao: "Reunião", proposta_enviada: "Proposta",
    negociacao: "Negociação", fechado: "Fechado",
  };
  const reachedIdx = (stage: string) => {
    if (stage === "perdido") return -1;
    return order.indexOf(stage);
  };
  const conversion = order.map((s, idx) => {
    const reached = opportunities.filter((o) => reachedIdx(o.stage) >= idx).length;
    return { stage: labels[s], reached };
  });
  const conversionRows = conversion.map((c, i) => ({
    ...c,
    rate: i === 0 ? 100 : conversion[i - 1].reached ? (c.reached / conversion[i - 1].reached) * 100 : 0,
  }));

  // Entregas: SLA e aprovação
  const totalDel = deliveries.length;
  const delivered = deliveries.filter((d) => ["entregue", "aprovada"].includes(d.status));
  const onTime = delivered.filter((d) => !d.due_date || !d.delivered_at || d.delivered_at.slice(0, 10) <= d.due_date).length;
  const slaRate = delivered.length ? (onTime / delivered.length) * 100 : 0;
  const approved = deliveries.filter((d) => d.approval === "aprovada").length;
  const rejected = deliveries.filter((d) => d.approval === "reprovada").length;
  const withEvidence = deliveries.filter((d) => !!d.evidence_url).length;
  const evidenceRate = totalDel ? (withEvidence / totalDel) * 100 : 0;

  // Entregas por categoria
  const catMap = new Map<string, { name: string; total: number; concluidas: number; atrasadas: number }>();
  deliveries.forEach((d) => {
    const name = (d.asset_type || "Sem categoria").replace(/_/g, " ");
    const cur = catMap.get(name) ?? { name, total: 0, concluidas: 0, atrasadas: 0 };
    cur.total += 1;
    if (["entregue", "aprovada"].includes(d.status)) cur.concluidas += 1;
    else if (d.due_date && d.due_date < today) cur.atrasadas += 1;
    catMap.set(name, cur);
  });
  const categoryRows = Array.from(catMap.values()).sort((a, b) => b.total - a.total);

  // Evolução mensal de novos negócios
  const monthly = new Map<string, { label: string; novas: number; ganhas: number; valor: number }>();
  opportunities.forEach((o) => {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = monthly.get(key) ?? { label: key, novas: 0, ganhas: 0, valor: 0 };
    cur.novas += 1;
    if (o.stage === "fechado") { cur.ganhas += 1; cur.valor += Number(o.value || 0); }
    monthly.set(key, cur);
  });
  const monthlyRows = Array.from(monthly.entries()).sort(([a], [b]) => (a > b ? 1 : -1)).map(([, v]) => v);

  // Renovações
  const in90 = new Date(); in90.setDate(in90.getDate() + 90);
  const renewals = activeContracts
    .filter((c) => c.end_date && c.end_date <= in90.toISOString().slice(0, 10))
    .map((c) => ({
      title: c.title, brand: c.brand, end_date: c.end_date,
      value: Number(c.total_value || 0), sponsor: sponsorName(c.sponsor_id),
      dias: daysBetween(today, c.end_date),
    }))
    .sort((a, b) => a.dias - b.dias);
  const renewalValue = renewals.reduce((s, r) => s + r.value, 0);

  return {
    ticketMedio, cicloMedio, adimplencia, buckets, propertyRows, lossRows, competitors,
    conversionRows, slaRate, approved, rejected, evidenceRate, categoryRows, monthlyRows,
    renewals, renewalValue, totalDel,
  };
};

export const AnalyticsTab = (props: AnalyticsInput) => {
  const a = useMemo(() => buildAnalytics(props), [props]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi label="Ticket médio por contrato" value={fmtMoney(a.ticketMedio)} />
        <MiniKpi label="Ciclo médio de venda" value={`${a.cicloMedio.toFixed(0)} dias`} />
        <MiniKpi label="Adimplência" value={`${a.adimplencia.toFixed(1)}%`} />
        <MiniKpi label="Entregas no prazo" value={`${a.slaRate.toFixed(1)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Aging de recebíveis em atraso</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={a.buckets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Bar dataKey="value" fill="hsl(var(--destructive))" name="Valor em atraso" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Evolução mensal de negócios</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <LineChart data={a.monthlyRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="novas" stroke="hsl(var(--primary))" name="Novas" />
                <Line type="monotone" dataKey="ganhas" stroke="hsl(var(--accent))" name="Ganhas" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Conversão entre etapas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {a.conversionRows.map((c) => (
            <div key={c.stage} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>{c.stage}</span>
                <span className="text-muted-foreground">
                  {c.reached} oportunidades · {c.rate.toFixed(0)}%
                </span>
              </div>
              <Progress value={Math.min(100, c.rate)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Receita por propriedade</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Propriedade</TableHead>
                <TableHead className="text-right">Contratos</TableHead>
                <TableHead className="text-right">Ativos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.propertyRows.map((p) => (
                <TableRow key={p.name}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{p.contracts}</TableCell>
                  <TableCell className="text-right">{p.ativo}</TableCell>
                  <TableCell className="text-right">{fmtMoney(p.total)}</TableCell>
                </TableRow>
              ))}
              {a.propertyRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Sem dados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Motivos de perda</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor perdido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.lossRows.map((l) => (
                  <TableRow key={l.reason}>
                    <TableCell className="capitalize">{String(l.reason).replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-right">{l.count}</TableCell>
                    <TableCell className="text-right">{fmtMoney(l.value)}</TableCell>
                  </TableRow>
                ))}
                {a.lossRows.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-sm text-muted-foreground">Nenhuma perda no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {a.competitors.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {a.competitors.map((c) => (
                  <Badge key={c.name} variant="outline">{c.name} · {c.count}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Entregas por categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 mb-3 text-center">
              <MiniKpi label="Aprovadas" value={String(a.approved)} />
              <MiniKpi label="Reprovadas" value={String(a.rejected)} />
              <MiniKpi label="Com evidência" value={`${a.evidenceRate.toFixed(0)}%`} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Concluídas</TableHead>
                  <TableHead className="text-right">Atrasadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.categoryRows.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="capitalize">{c.name}</TableCell>
                    <TableCell className="text-right">{c.total}</TableCell>
                    <TableCell className="text-right">{c.concluidas}</TableCell>
                    <TableCell className="text-right">{c.atrasadas}</TableCell>
                  </TableRow>
                ))}
                {a.categoryRows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">Sem entregas.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Renovações nos próximos 90 dias</CardTitle>
          <Badge variant="outline">{fmtMoney(a.renewalValue)}</Badge>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contrato</TableHead>
                <TableHead>Patrocinador</TableHead>
                <TableHead>Vence em</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.renewals.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.title}</TableCell>
                  <TableCell>{r.sponsor || r.brand}</TableCell>
                  <TableCell>{r.end_date}</TableCell>
                  <TableCell className="text-right">{r.dias}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.value)}</TableCell>
                </TableRow>
              ))}
              {a.renewals.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Nenhuma renovação próxima.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

const MiniKpi = ({ label, value }: { label: string; value: string }) => (
  <Card>
    <CardContent className="pt-4 pb-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </CardContent>
  </Card>
);
