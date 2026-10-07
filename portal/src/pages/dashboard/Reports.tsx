import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Briefcase,
  Truck,
  Users,
  FileSignature,
  Download,
  FileText,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { SelloutReportGenerator } from "@/components/reports/SelloutReportGenerator";
import { AnalyticsTab } from "@/components/reports/AnalyticsTab";
import { openFullReport } from "@/lib/reportFullHtml";
import { RevenueForecastWidget } from "@/components/dashboard/RevenueForecastWidget";
import { QuotaHeatmapWidget } from "@/components/dashboard/QuotaHeatmapWidget";
import { TicketBenchmarkWidget } from "@/components/dashboard/TicketBenchmarkWidget";
import { ROIWidget } from "@/components/dashboard/ROIWidget";
import { dataLocal } from "@/lib/datas";


const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const fmtMonth = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");

const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  reuniao: "Reunião",
  proposta_enviada: "Proposta Enviada",
  negociacao: "Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

const SCORE_LABELS: Record<string, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--muted-foreground))", "hsl(var(--destructive))", "hsl(var(--secondary))", "hsl(var(--ring))"];

interface Property { id: string; name: string }
interface Sponsor { id: string; name: string; score: string; segment: string | null }
interface Installment {
  id: string; contract_id: string; amount: number; paid_amount: number | null;
  due_date: string; paid_at: string | null; status: string;
}
interface Contract {
  id: string; brand: string; title: string; total_value: number;
  status: string; start_date: string | null; end_date: string | null;
  property_id: string | null; sponsor_id: string | null;
}
interface Opportunity {
  id: string; brand: string; value: number; stage: string;
  property_id: string | null; sponsor_id: string | null; created_at: string;
  updated_at?: string; lost_reason?: string | null; lost_competitor?: string | null;
  lost_value?: number | null;
}
interface Delivery {
  id: string; title: string; brand: string; status: string; approval: string;
  due_date: string | null; delivered_at: string | null;
  property_id: string | null; asset_type?: string | null; evidence_url?: string | null;
}


const todayISO = () => new Date().toISOString().slice(0, 10);
const monthsAgoISO = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};

const downloadCSV = (filename: string, rows: (string | number)[][]) => {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";")
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Reports() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [from, setFrom] = useState<string>(monthsAgoISO(6));
  const [to, setTo] = useState<string>(todayISO());
  const [propertyId, setPropertyId] = useState<string>("all");
  const [sponsorId, setSponsorId] = useState<string>("all");

  const [properties, setProperties] = useState<Property[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const loadFilters = async () => {
    if (!user || !orgId) return;
    const [{ data: props }, { data: spons }] = await Promise.all([
        supabase.from("sports_properties").select("id, name").eq("organization_id", orgId).order("name"),
        supabase.from("sponsors").select("id, name, sponsor_crm_profiles(score, segment)").eq("organization_id", orgId).order("name"),
    ]);
    setProperties(props ?? []);
    setSponsors(((spons ?? []) as any[]).map((s) => {
      const crm = Array.isArray(s.sponsor_crm_profiles) ? s.sponsor_crm_profiles[0] : s.sponsor_crm_profiles;
      return { id: s.id, name: s.name, score: crm?.score ?? "morno", segment: crm?.segment ?? null };
    }));
  };

  const loadData = async () => {
    if (!user || !orgId) return;
    setLoading(true);
    try {
      const [insR, conR, oppR, delR] = await Promise.all([
        supabase.from("installments").select("*").eq("organization_id", orgId).gte("due_date", from).lte("due_date", to),
        supabase.from("contracts").select("*").eq("organization_id", orgId),
        supabase.from("opportunities").select("*").eq("organization_id", orgId).gte("created_at", from).lte("created_at", `${to}T23:59:59`),
        supabase.from("deliveries").select("*").eq("organization_id", orgId),
      ]);
      if (insR.error) throw insR.error;
      if (conR.error) throw conR.error;
      if (oppR.error) throw oppR.error;
      if (delR.error) throw delR.error;
      setInstallments(insR.data ?? []);
      setContracts(conR.data ?? []);
      setOpportunities(oppR.data ?? []);
      setDeliveries(delR.data ?? []);
    } catch (e: any) {
      toast({ title: "Erro ao carregar relatório", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFilters(); }, [user, orgId]);
  useEffect(() => { loadData(); }, [user, orgId, from, to]);

  // ---------- Filter by property/sponsor ----------
  const contractMatchesFilters = (c: Contract) =>
    (propertyId === "all" || c.property_id === propertyId) &&
    (sponsorId === "all" || c.sponsor_id === sponsorId);

  const filteredContracts = useMemo(
    () => contracts.filter(contractMatchesFilters),
    [contracts, propertyId, sponsorId]
  );
  const filteredContractIds = useMemo(() => new Set(filteredContracts.map((c) => c.id)), [filteredContracts]);

  const filteredInstallments = useMemo(
    () => installments.filter((i) => filteredContractIds.has(i.contract_id)),
    [installments, filteredContractIds]
  );
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          (propertyId === "all" || o.property_id === propertyId) &&
          (sponsorId === "all" || o.sponsor_id === sponsorId)
      ),
    [opportunities, propertyId, sponsorId]
  );
  const filteredDeliveries = useMemo(
    () => deliveries.filter((d) => propertyId === "all" || d.property_id === propertyId),
    [deliveries, propertyId]
  );

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    const received = filteredInstallments
      .filter((i) => i.status === "pago")
      .reduce((s, i) => s + Number(i.paid_amount ?? i.amount), 0);
    const expected = filteredInstallments
      .filter((i) => i.status === "pendente" || i.status === "atrasado")
      .reduce((s, i) => s + Number(i.amount), 0);
    const overdue = filteredInstallments
      .filter((i) => i.status === "atrasado")
      .reduce((s, i) => s + Number(i.amount), 0);
    const activeContracts = filteredContracts.filter((c) => c.status === "ativo").length;
    const pipelineValue = filteredOpportunities
      .filter((o) => !["fechado", "perdido"].includes(o.stage))
      .reduce((s, o) => s + Number(o.value), 0);
    const wonOpps = filteredOpportunities.filter((o) => o.stage === "fechado").length;
    const totalDecidedOpps = filteredOpportunities.filter((o) => ["fechado", "perdido"].includes(o.stage)).length;
    const winRate = totalDecidedOpps > 0 ? (wonOpps / totalDecidedOpps) * 100 : 0;
    const overdueDeliveries = filteredDeliveries.filter(
      (d) => d.status !== "entregue" && d.status !== "aprovada" && d.due_date && d.due_date < todayISO()
    ).length;
    return { received, expected, overdue, activeContracts, pipelineValue, winRate, overdueDeliveries };
  }, [filteredInstallments, filteredContracts, filteredOpportunities, filteredDeliveries]);

  // ---------- Cashflow chart (12 months from `from`) ----------
  const cashflow = useMemo(() => {
    const start = new Date(from);
    const months: { key: string; label: string; recebido: number; previsto: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmtMonth(d), recebido: 0, previsto: 0 });
    }
    filteredInstallments.forEach((i) => {
      const d = dataLocal(i.due_date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find((x) => x.key === key);
      if (!m) return;
      if (i.status === "pago") m.recebido += Number(i.paid_amount ?? i.amount);
      else m.previsto += Number(i.amount);
    });
    return months;
  }, [filteredInstallments, from]);

  // ---------- Pipeline funnel ----------
  const funnel = useMemo(() => {
    const stages = ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado", "perdido"];
    return stages.map((s) => ({
      stage: STAGE_LABELS[s],
      count: filteredOpportunities.filter((o) => o.stage === s).length,
      value: filteredOpportunities.filter((o) => o.stage === s).reduce((sum, o) => sum + Number(o.value), 0),
    }));
  }, [filteredOpportunities]);

  // ---------- Deliveries status ----------
  const deliveriesByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredDeliveries.forEach((d) => {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
    });
    return Object.entries(counts).map(([k, v]) => ({ name: k, value: v }));
  }, [filteredDeliveries]);

  // ---------- Top sponsors by revenue ----------
  const sponsorMap = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);
  const propertyMap = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);

  const topSponsors = useMemo(() => {
    const totals = new Map<string, { name: string; total: number; contracts: number }>();
    filteredContracts.forEach((c) => {
      const key = c.sponsor_id ?? `brand:${c.brand}`;
      const name = c.sponsor_id ? sponsorMap.get(c.sponsor_id)?.name ?? c.brand : c.brand;
      const cur = totals.get(key) ?? { name, total: 0, contracts: 0 };
      cur.total += Number(c.total_value);
      cur.contracts += 1;
      totals.set(key, cur);
    });
    return Array.from(totals.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [filteredContracts, sponsorMap]);

  // ---------- Sponsor scores ----------
  const sponsorScores = useMemo(() => {
    const counts: Record<string, number> = { quente: 0, morno: 0, frio: 0 };
    sponsors.forEach((s) => { counts[s.score] = (counts[s.score] ?? 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: SCORE_LABELS[k], value: v }));
  }, [sponsors]);

  // ---------- Contracts ending in 60 days ----------
  const expiringContracts = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 60);
    const limitISO = limit.toISOString().slice(0, 10);
    return filteredContracts
      .filter((c) => c.status === "ativo" && c.end_date && c.end_date <= limitISO && c.end_date >= todayISO())
      .sort((a, b) => (a.end_date! > b.end_date! ? 1 : -1));
  }, [filteredContracts]);

  // ---------- Exports ----------
  const exportFinanceCSV = () => {
    const rows: (string | number)[][] = [
      ["Vencimento", "Contrato", "Valor", "Pago", "Status", "Pago em"],
      ...filteredInstallments.map((i) => [
        i.due_date,
        filteredContracts.find((c) => c.id === i.contract_id)?.title ?? "",
        Number(i.amount).toFixed(2),
        Number(i.paid_amount ?? 0).toFixed(2),
        i.status,
        i.paid_at ?? "",
      ]),
    ];
    downloadCSV(`financeiro_${from}_${to}.csv`, rows);
  };
  const exportPipelineCSV = () => {
    const rows: (string | number)[][] = [
      ["Marca", "Estágio", "Valor", "Propriedade", "Patrocinador", "Criado em"],
      ...filteredOpportunities.map((o) => [
        o.brand,
        STAGE_LABELS[o.stage] ?? o.stage,
        Number(o.value).toFixed(2),
        propertyMap.get(o.property_id ?? "")?.name ?? "",
        sponsorMap.get(o.sponsor_id ?? "")?.name ?? "",
        o.created_at.slice(0, 10),
      ]),
    ];
    downloadCSV(`pipeline_${from}_${to}.csv`, rows);
  };
  const exportDeliveriesCSV = () => {
    const rows: (string | number)[][] = [
      ["Título", "Marca", "Status", "Aprovação", "Vencimento", "Entregue em"],
      ...filteredDeliveries.map((d) => [
        d.title, d.brand, d.status, d.approval, d.due_date ?? "", d.delivered_at ?? "",
      ]),
    ];
    downloadCSV(`entregas_${from}_${to}.csv`, rows);
  };
  const exportSponsorsCSV = () => {
    const rows: (string | number)[][] = [
      ["Patrocinador", "Contratos", "Receita total"],
      ...topSponsors.map((s) => [s.name, s.contracts, s.total.toFixed(2)]),
    ];
    downloadCSV(`patrocinadores_${from}_${to}.csv`, rows);
  };

  const analyticsInput = useMemo(
    () => ({
      contracts: filteredContracts,
      opportunities: filteredOpportunities,
      installments: filteredInstallments,
      deliveries: filteredDeliveries,
      propertyName: (id: string | null) => propertyMap.get(id ?? "")?.name ?? "",
      sponsorName: (id: string | null) => sponsorMap.get(id ?? "")?.name ?? "",
    }),
    [filteredContracts, filteredOpportunities, filteredInstallments, filteredDeliveries, propertyMap, sponsorMap]
  );

  const exportFullReport = () => {
    const ok = openFullReport({
      ...analyticsInput,
      from,
      to,
      propertyLabel: propertyId === "all" ? null : propertyMap.get(propertyId)?.name ?? null,
      sponsorLabel: sponsorId === "all" ? null : sponsorMap.get(sponsorId)?.name ?? null,
      kpis,
      cashflow: cashflow.map((m) => ({ label: m.label, recebido: m.recebido, previsto: m.previsto })),
      funnel,
      topSponsors,
    });
    if (!ok) toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" });
  };

  const exportPDF = async () => {

    setExportingPdf(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report-pdf", {
        body: {
          from, to,
          property_name: propertyId === "all" ? null : propertyMap.get(propertyId)?.name ?? null,
          sponsor_name: sponsorId === "all" ? null : sponsorMap.get(sponsorId)?.name ?? null,
          kpis,
          cashflow: cashflow.map((m) => ({ label: m.label, recebido: m.recebido, previsto: m.previsto })),
          funnel,
          top_sponsors: topSponsors,
          expiring_contracts: expiringContracts.map((c) => ({
            title: c.title, brand: c.brand, end_date: c.end_date, total_value: Number(c.total_value),
          })),
        },
      });
      if (error) throw error;
      const base64: string = (data as any)?.pdf_base64;
      if (!base64) throw new Error("PDF não gerado");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_${from}_${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF gerado com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro ao gerar PDF", description: e.message, variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Visão executiva e detalhada da operação.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportFullReport}>
            <FileText className="h-4 w-4 mr-2" /> Relatório completo
          </Button>
          <Button size="sm" onClick={exportPDF} disabled={exportingPdf}>
            <FileText className="h-4 w-4 mr-2" /> {exportingPdf ? "Gerando..." : "Exportar PDF"}
          </Button>

        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Propriedade</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Patrocinador</Label>
            <Select value={sponsorId} onValueChange={setSponsorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Recebido" value={fmtMoney(kpis.received)} accent="text-primary" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Previsto" value={fmtMoney(kpis.expected)} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Em atraso" value={fmtMoney(kpis.overdue)} accent="text-destructive" />
        <KpiCard icon={<FileSignature className="h-4 w-4" />} label="Contratos ativos" value={String(kpis.activeContracts)} />
        <KpiCard icon={<Briefcase className="h-4 w-4" />} label="Pipeline aberto" value={fmtMoney(kpis.pipelineValue)} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Win rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <KpiCard icon={<Truck className="h-4 w-4" />} label="Entregas atrasadas" value={String(kpis.overdueDeliveries)} accent="text-destructive" />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Patrocinadores" value={String(sponsors.length)} />
      </div>

      <Tabs defaultValue="executivo">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="executivo">Executivo</TabsTrigger>
          <TabsTrigger value="analitico">Analítico</TabsTrigger>

          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="patrocinadores">Patrocinadores</TabsTrigger>
          <TabsTrigger value="sellout">Sell-out IA ✨</TabsTrigger>
          <TabsTrigger value="bi">Inteligência ✨</TabsTrigger>
        </TabsList>

        {/* Executivo */}
        <TabsContent value="executivo" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Fluxo de caixa (12 meses)</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <BarChart data={cashflow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Bar dataKey="recebido" stackId="a" fill="hsl(var(--primary))" name="Recebido" />
                  <Bar dataKey="previsto" stackId="a" fill="hsl(var(--accent))" name="Previsto" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Funil de pipeline</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={funnel} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="stage" type="category" width={120} />
                    <Tooltip formatter={(v: number, n) => (n === "value" ? fmtMoney(v) : v)} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" name="Oportunidades" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Score dos patrocinadores</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={sponsorScores} dataKey="value" nameKey="name" outerRadius={80} label>
                      {sponsorScores.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Contratos vencendo em 60 dias</CardTitle>
              <Badge variant="outline">{expiringContracts.length}</Badge>
            </CardHeader>
            <CardContent>
              {expiringContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum contrato vencendo no período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contrato</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Vence em</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringContracts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.title}</TableCell>
                        <TableCell>{c.brand}</TableCell>
                        <TableCell>{c.end_date}</TableCell>
                        <TableCell className="text-right">{fmtMoney(Number(c.total_value))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financeiro */}
        <TabsContent value="financeiro" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportFinanceCSV}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Recebido x Previsto por mês</CardTitle></CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <LineChart data={cashflow}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="recebido" stroke="hsl(var(--primary))" name="Recebido" />
                  <Line type="monotone" dataKey="previsto" stroke="hsl(var(--accent))" name="Previsto" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Parcelas no período</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstallments.slice(0, 50).map((i) => {
                    const c = filteredContracts.find((x) => x.id === i.contract_id);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>{i.due_date}</TableCell>
                        <TableCell>{c?.title ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={i.status === "pago" ? "default" : i.status === "atrasado" ? "destructive" : "secondary"}>
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtMoney(Number(i.amount))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filteredInstallments.length > 50 && (
                <p className="text-xs text-muted-foreground mt-2">Mostrando 50 de {filteredInstallments.length} — exporte CSV para ver tudo.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportPipelineCSV}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Funil por estágio</CardTitle></CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer>
                <BarChart data={funnel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, n) => (n === "Valor" ? fmtMoney(v) : v)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" fill="hsl(var(--primary))" name="Qtd" />
                  <Bar yAxisId="right" dataKey="value" fill="hsl(var(--accent))" name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Entregas */}
        <TabsContent value="entregas" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportDeliveriesCSV}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Status das entregas</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={deliveriesByStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                      {deliveriesByStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Atrasadas ({kpis.overdueDeliveries})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Vence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeliveries
                      .filter((d) => d.status !== "entregue" && d.status !== "aprovada" && d.due_date && d.due_date < todayISO())
                      .slice(0, 20)
                      .map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{d.title}</TableCell>
                          <TableCell>{d.brand}</TableCell>
                          <TableCell>{d.due_date}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Patrocinadores */}
        <TabsContent value="patrocinadores" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={exportSponsorsCSV}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
          <Card>
            <CardHeader><CardTitle>Top patrocinadores por receita</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Patrocinador</TableHead>
                    <TableHead className="text-right">Contratos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSponsors.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-right">{s.contracts}</TableCell>
                      <TableCell className="text-right">{fmtMoney(s.total)}</TableCell>
                    </TableRow>
                  ))}
                  {topSponsors.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sem dados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analitico" className="space-y-4">
          <AnalyticsTab {...analyticsInput} />
        </TabsContent>

        <TabsContent value="sellout" className="space-y-4">

          <SelloutReportGenerator />
        </TabsContent>

        <TabsContent value="bi" className="space-y-4">
          <RevenueForecastWidget />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <QuotaHeatmapWidget />
            <TicketBenchmarkWidget />
          </div>
          <ROIWidget />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const KpiCard = ({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: string; accent?: string }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`text-xl font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
    </CardContent>
  </Card>
);
