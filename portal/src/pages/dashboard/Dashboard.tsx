import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  TrendingUp,
  Trophy,
  Briefcase,
  Wallet,
  Users,
  FileText,
  FileSignature,
  Truck,
  Boxes,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import { NextActionsWidget } from "@/components/sponsors/NextActionsWidget";
import { ChurnRiskWidget } from "@/components/dashboard/ChurnRiskWidget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { dataLocal } from "@/lib/datas";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

const fmtMonth = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");

const todayISO = () => new Date().toISOString().slice(0, 10);

const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  reuniao: "Reunião",
  proposta_enviada: "Proposta",
  negociacao: "Negociação",
  fechado: "Fechado",
};

type WidgetId =
  | "kpis"
  | "modules"
  | "aiActions"
  | "nextActions"
  | "churnRisk"
  | "cashflow"
  | "funnel"
  | "expiring"
  | "overdueDeliveries"
  | "recentProposals"
  | "recentSponsors";

const WIDGET_META: Record<WidgetId, { label: string; full?: boolean }> = {
  kpis: { label: "KPIs financeiros", full: true },
  modules: { label: "Atalhos por módulo", full: true },
  aiActions: { label: "Ações sugeridas pela IA", full: true },
  nextActions: { label: "Próximas ações de patrocinadores" },
  churnRisk: { label: "Risco de churn (IA)", full: true },
  cashflow: { label: "Gráfico de fluxo de caixa" },
  funnel: { label: "Gráfico de funil do pipeline" },
  expiring: { label: "Contratos vencendo" },
  overdueDeliveries: { label: "Entregas atrasadas" },
  recentProposals: { label: "Propostas recentes" },
  recentSponsors: { label: "Patrocinadores recentes", full: true },
};

const DEFAULT_WIDGETS: { id: WidgetId; visible: boolean }[] = [
  { id: "kpis", visible: true },
  { id: "modules", visible: true },
  { id: "aiActions", visible: true },
  { id: "nextActions", visible: true },
  { id: "churnRisk", visible: true },
  { id: "cashflow", visible: true },
  { id: "funnel", visible: true },
  { id: "expiring", visible: true },
  { id: "overdueDeliveries", visible: true },
  { id: "recentProposals", visible: true },
  { id: "recentSponsors", visible: true },
];

const Dashboard = () => {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const { toast } = useToast();
  const [counts, setCounts] = useState({
    properties: 0, assets: 0, sponsors: 0, proposals: 0, contracts: 0, opportunities: 0,
  });
  const [installments, setInstallments] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [topSponsors, setTopSponsors] = useState<{ name: string; score: string }[]>([]);

  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [draggedId, setDraggedId] = useState<WidgetId | null>(null);

  // Load preferences
  useEffect(() => {
    if (!user || !orgId) return;
    (async () => {
      const { data } = await supabase
        .from("user_dashboard_preferences")
        .select("widgets")
        .eq("user_id", user.id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (data?.widgets && Array.isArray(data.widgets)) {
        // Merge with defaults to keep newly added widgets
        const stored = data.widgets as { id: WidgetId; visible: boolean }[];
        const merged: typeof DEFAULT_WIDGETS = [];
        stored.forEach((s) => {
          if (WIDGET_META[s.id]) merged.push({ id: s.id, visible: s.visible !== false });
        });
        DEFAULT_WIDGETS.forEach((d) => {
          if (!merged.find((m) => m.id === d.id)) merged.push(d);
        });
        setWidgets(merged);
      }
    })();
  }, [user, orgId]);

  // Load data
  useEffect(() => {
    if (!user || !orgId) return;
    (async () => {
      const head = { count: "exact" as const, head: true };
      const [props, assets, spons, props2, cons, opps, ins, opp2, con2, del, prop3, sp3] = await Promise.all([
        supabase.from("sports_properties").select("id", head).eq("organization_id", orgId),
        supabase.from("assets").select("id", head).eq("organization_id", orgId),
        supabase.from("sponsors").select("id", head).eq("organization_id", orgId),
        supabase.from("proposals").select("id", head).eq("organization_id", orgId),
        supabase.from("contracts").select("id", head).eq("organization_id", orgId),
        supabase.from("opportunities").select("id", head).eq("organization_id", orgId),
        supabase.from("installments").select("amount, paid_amount, due_date, status").eq("organization_id", orgId).gte("due_date", new Date(new Date().setMonth(new Date().getMonth() - 2)).toISOString().slice(0, 10)),
        supabase.from("opportunities").select("stage, value").eq("organization_id", orgId),
        supabase.from("contracts").select("id, title, brand, end_date, total_value, status").eq("organization_id", orgId).eq("status", "ativo"),
        supabase.from("deliveries").select("id, title, brand, status, due_date").eq("organization_id", orgId).neq("status", "entregue").neq("status", "aprovada"),
        supabase.from("proposals").select("id, title, brand, total_value, status, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5),
        supabase.from("sponsors").select("name, sponsor_crm_profiles(score)").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(5),
      ]);
      setCounts({
        properties: props.count ?? 0, assets: assets.count ?? 0, sponsors: spons.count ?? 0,
        proposals: props2.count ?? 0, contracts: cons.count ?? 0, opportunities: opps.count ?? 0,
      });
      setInstallments(ins.data ?? []);
      setOpportunities(opp2.data ?? []);
      setContracts(con2.data ?? []);
      setDeliveries(del.data ?? []);
      setProposals(prop3.data ?? []);
      setTopSponsors(((sp3.data ?? []) as any[]).map((s) => {
        const crm = Array.isArray(s.sponsor_crm_profiles) ? s.sponsor_crm_profiles[0] : s.sponsor_crm_profiles;
        return { name: s.name, score: crm?.score ?? "morno" };
      }));
    })();
  }, [user, orgId]);

  const savePrefs = async (next: typeof widgets) => {
    setWidgets(next);
    if (!user || !orgId) return;
    const { error } = await supabase
      .from("user_dashboard_preferences")
      .upsert([{ user_id: user.id, organization_id: orgId, widgets: next as any }], { onConflict: "user_id,organization_id" });
    if (error) toast({ title: "Erro ao salvar preferências", description: error.message, variant: "destructive" });
  };

  const toggleVisible = (id: WidgetId) => {
    savePrefs(widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const moveWidget = (from: number, to: number) => {
    if (from === to || to < 0 || to >= widgets.length) return;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    savePrefs(next);
  };

  const resetPrefs = () => savePrefs(DEFAULT_WIDGETS);

  const firstName = (user?.user_metadata?.full_name || "").split(" ")[0] || "por aí";

  const cashflow = useMemo(() => {
    const months: { key: string; label: string; recebido: number; previsto: number }[] = [];
    const start = new Date();
    start.setMonth(start.getMonth() - 2);
    for (let i = 0; i < 6; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: fmtMonth(d), recebido: 0, previsto: 0 });
    }
    installments.forEach((i: any) => {
      const d = dataLocal(i.due_date);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (!m) return;
      if (i.status === "pago") m.recebido += Number(i.paid_amount ?? i.amount);
      else m.previsto += Number(i.amount);
    });
    return months;
  }, [installments]);

  const kpis = useMemo(() => {
    const received = installments.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.paid_amount ?? i.amount), 0);
    const expected = installments.filter((i) => i.status === "pendente" || i.status === "atrasado").reduce((s, i) => s + Number(i.amount), 0);
    const pipelineOpen = opportunities.filter((o) => !["fechado", "perdido"].includes(o.stage)).reduce((s, o) => s + Number(o.value), 0);
    const overdueDeliveries = deliveries.filter((d) => d.due_date && d.due_date < todayISO()).length;
    return { received, expected, pipelineOpen, overdueDeliveries };
  }, [installments, opportunities, deliveries]);

  const funnel = useMemo(
    () =>
      ["prospect", "reuniao", "proposta_enviada", "negociacao", "fechado"].map((s) => ({
        stage: STAGE_LABELS[s],
        count: opportunities.filter((o) => o.stage === s).length,
      })),
    [opportunities]
  );

  const expiringContracts = useMemo(() => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 60);
    const limitISO = limit.toISOString().slice(0, 10);
    return contracts
      .filter((c) => c.end_date && c.end_date <= limitISO && c.end_date >= todayISO())
      .sort((a, b) => (a.end_date > b.end_date ? 1 : -1))
      .slice(0, 5);
  }, [contracts]);

  const overdueDeliveriesList = useMemo(
    () => deliveries.filter((d) => d.due_date && d.due_date < todayISO()).slice(0, 5),
    [deliveries]
  );

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case "kpis":
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={<Wallet className="h-4 w-4" />} label="Recebido (3m)" value={fmtMoney(kpis.received)} accent="text-primary" />
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Previsto" value={fmtMoney(kpis.expected)} />
            <KpiCard icon={<Briefcase className="h-4 w-4" />} label="Pipeline aberto" value={fmtMoney(kpis.pipelineOpen)} />
            <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Entregas atrasadas" value={String(kpis.overdueDeliveries)} accent={kpis.overdueDeliveries > 0 ? "text-destructive" : ""} />
          </div>
        );
      case "modules":
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <ModuleCard to="/dashboard/patrocinadores" icon={<Users className="h-4 w-4" />} label="Patrocinadores" value={counts.sponsors} />
            <ModuleCard to="/dashboard/propriedades" icon={<Trophy className="h-4 w-4" />} label="Propriedades" value={counts.properties} />
            <ModuleCard to="/dashboard/ativos" icon={<Boxes className="h-4 w-4" />} label="Ativos" value={counts.assets} />
            <ModuleCard to="/dashboard/propostas" icon={<FileText className="h-4 w-4" />} label="Propostas" value={counts.proposals} />
            <ModuleCard to="/dashboard/pipeline" icon={<Briefcase className="h-4 w-4" />} label="Oportunidades" value={counts.opportunities} />
            <ModuleCard to="/dashboard/contratos" icon={<FileSignature className="h-4 w-4" />} label="Contratos" value={counts.contracts} />
          </div>
        );
      case "aiActions":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Ações sugeridas pela IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NextStepsAI context="dashboard" />
            </CardContent>
          </Card>
        );
      case "nextActions":
        return <NextActionsWidget />;
      case "churnRisk":
        return <ChurnRiskWidget />;
      case "cashflow":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Fluxo de caixa</CardTitle>
              <Link to="/dashboard/financeiro" className="text-xs text-primary hover:underline">Ver financeiro</Link>
            </CardHeader>
            <CardContent className="h-64">
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
        );
      case "funnel":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Funil</CardTitle>
              <Link to="/dashboard/pipeline" className="text-xs text-primary hover:underline">Pipeline</Link>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={funnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="stage" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      case "expiring":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Contratos vencendo
              </CardTitle>
              <Badge variant="outline">{expiringContracts.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiringContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum contrato nos próximos 60 dias.</p>
              ) : (
                expiringContracts.map((c) => (
                  <Link key={c.id} to="/dashboard/contratos" className="block text-sm rounded-md border border-border p-2 hover:bg-accent/30">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{c.brand}</span>
                      <span>{c.end_date}</span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        );
      case "overdueDeliveries":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" /> Entregas atrasadas
              </CardTitle>
              <Badge variant={overdueDeliveriesList.length > 0 ? "destructive" : "outline"}>{overdueDeliveriesList.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {overdueDeliveriesList.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" /> Tudo em dia.
                </div>
              ) : (
                overdueDeliveriesList.map((d) => (
                  <Link key={d.id} to="/dashboard/entregas" className="block text-sm rounded-md border border-border p-2 hover:bg-accent/30">
                    <div className="font-medium truncate">{d.title}</div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{d.brand}</span>
                      <span className="text-destructive">{d.due_date}</span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        );
      case "recentProposals":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Propostas recentes
              </CardTitle>
              <Link to="/dashboard/propostas" className="text-xs text-primary hover:underline">Ver todas</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma proposta criada.</p>
              ) : (
                proposals.map((p) => (
                  <Link key={p.id} to="/dashboard/propostas" className="block text-sm rounded-md border border-border p-2 hover:bg-accent/30">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{p.title}</span>
                      <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{p.brand ?? "—"}</span>
                      <span>{fmtMoney(Number(p.total_value))}</span>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        );
      case "recentSponsors":
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Patrocinadores recentes
              </CardTitle>
              <Link to="/dashboard/patrocinadores" className="text-xs text-primary hover:underline">Ver CRM</Link>
            </CardHeader>
            <CardContent>
              {topSponsors.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum patrocinador cadastrado ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {topSponsors.map((s, i) => (
                    <Badge key={i} variant="outline" className="gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${s.score === "quente" ? "bg-destructive" : s.score === "morno" ? "bg-accent" : "bg-muted-foreground"}`} />
                      {s.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
    }
  };

  // Group consecutive non-full widgets in a 3-col grid for layout coherence
  const visibleWidgets = widgets.filter((w) => w.visible);
  const renderedRows: React.ReactNode[] = [];
  let buffer: WidgetId[] = [];
  const flushBuffer = (key: string) => {
    if (buffer.length === 0) return;
    renderedRows.push(
      <div key={key} className="grid lg:grid-cols-3 gap-4">
        {buffer.map((id) => <div key={id}>{renderWidget(id)}</div>)}
      </div>
    );
    buffer = [];
  };
  visibleWidgets.forEach((w, idx) => {
    if (WIDGET_META[w.id].full) {
      flushBuffer(`b-${idx}`);
      renderedRows.push(<div key={w.id}>{renderWidget(w.id)}</div>);
    } else {
      buffer.push(w.id);
    }
  });
  flushBuffer("b-last");

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Olá, {firstName} 👋</p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Visão geral</h1>
          <p className="text-muted-foreground mt-1">Resumo de cada módulo da operação.</p>
        </div>
        <div className="flex gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings2 className="h-4 w-4 mr-2" /> Personalizar
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Personalizar dashboard</SheetTitle>
                <SheetDescription>
                  Arraste para reordenar e use o switch para mostrar/ocultar widgets. Salvo automaticamente.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                {widgets.map((w, idx) => (
                  <div
                    key={w.id}
                    draggable
                    onDragStart={() => setDraggedId(w.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (!draggedId) return;
                      const from = widgets.findIndex((x) => x.id === draggedId);
                      moveWidget(from, idx);
                      setDraggedId(null);
                    }}
                    className={`flex items-center gap-3 rounded-md border border-border p-3 bg-card ${
                      draggedId === w.id ? "opacity-50" : ""
                    } cursor-move hover:border-primary/40`}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{WIDGET_META[w.id].label}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {w.visible ? <><Eye className="h-3 w-3" /> Visível</> : <><EyeOff className="h-3 w-3" /> Oculto</>}
                      </div>
                    </div>
                    <Switch checked={w.visible} onCheckedChange={() => toggleVisible(w.id)} />
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full mt-2" onClick={resetPrefs}>
                  <RotateCcw className="h-3.5 w-3.5 mr-2" /> Restaurar padrão
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <Button asChild variant="outline">
            <Link to="/dashboard/relatorios">
              <BarChart3 className="h-4 w-4 mr-2" /> Relatórios
            </Link>
          </Button>
        </div>
      </div>

      {visibleWidgets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum widget visível. Use <span className="font-medium">Personalizar</span> para ativar widgets.
          </CardContent>
        </Card>
      ) : (
        renderedRows
      )}
    </div>
  );
};

const KpiCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) => (
  <Card>
    <CardContent className="pt-5">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span>{label}</span>{icon}
      </div>
      <div className={`text-xl font-bold mt-1 ${accent ?? ""}`}>{value}</div>
    </CardContent>
  </Card>
);

const ModuleCard = ({ to, icon, label, value }: { to: string; icon: React.ReactNode; label: string; value: number }) => (
  <Link to={to} className="group">
    <Card className="hover:shadow-md hover:border-primary/40 transition-all">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center">{icon}</div>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="text-xl font-bold mt-2">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  </Link>
);

export default Dashboard;
