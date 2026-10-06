import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Wallet, AlertTriangle, CheckCircle2, Clock, Search, RefreshCw, DollarSign, TrendingUp } from "lucide-react";
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

type InstallmentStatus = "pendente" | "pago" | "atrasado" | "cancelado";

interface Installment {
  id: string;
  contract_id: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  due_date: string;
  paid_at: string | null;
  paid_amount: number | null;
  status: InstallmentStatus;
  payment_method: string | null;
  notes: string | null;
}

interface Row extends Installment {
  contract_title: string;
  contract_brand: string;
  contract_number: string | null;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

const statusConfig: Record<InstallmentStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  pago: { label: "Pago", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  atrasado: { label: "Atrasado", className: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground border-border" },
};

export default function Finance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [paidAt, setPaidAt] = useState("");
  const [paidAmount, setPaidAmount] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    // Marca vencidas no servidor
    await supabase.rpc("mark_overdue_installments", { _owner: user.id });

    const { data, error } = await supabase
      .from("installments")
      .select("*, contracts!inner(title,brand,contract_number)")
      .order("due_date", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar parcelas", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const mapped: Row[] = (data ?? []).map((r: any) => ({
      id: r.id,
      contract_id: r.contract_id,
      installment_number: r.installment_number,
      total_installments: r.total_installments,
      amount: Number(r.amount),
      due_date: r.due_date,
      paid_at: r.paid_at,
      paid_amount: r.paid_amount != null ? Number(r.paid_amount) : null,
      status: r.status,
      payment_method: r.payment_method,
      notes: r.notes,
      contract_title: r.contracts.title,
      contract_brand: r.contracts.brand,
      contract_number: r.contracts.contract_number,
    }));
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.contract_title.toLowerCase().includes(q) &&
          !r.contract_brand.toLowerCase().includes(q) &&
          !(r.contract_number ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, search, statusFilter]);

  const kpis = useMemo(() => {
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const recebido = rows.filter((r) => r.status === "pago").reduce((s, r) => s + (r.paid_amount ?? r.amount), 0);
    const pendente = rows.filter((r) => r.status === "pendente").reduce((s, r) => s + r.amount, 0);
    const atrasado = rows.filter((r) => r.status === "atrasado").reduce((s, r) => s + r.amount, 0);
    return { total, recebido, pendente, atrasado, count: rows.length };
  }, [rows]);

  const cashflow = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; previsto: number; recebido: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""),
        previsto: 0,
        recebido: 0,
      });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    rows.forEach((r) => {
      const dueKey = r.due_date.slice(0, 7);
      const i = idx.get(dueKey);
      if (i != null && r.status !== "pago" && r.status !== "cancelado") {
        months[i].previsto += r.amount;
      }
      if (r.status === "pago" && r.paid_at) {
        const paidKey = r.paid_at.slice(0, 7);
        const j = idx.get(paidKey);
        if (j != null) months[j].recebido += r.paid_amount ?? r.amount;
      }
    });
    return months;
  }, [rows]);

  const openDetail = (r: Row) => {
    setSelected(r);
    setPaidAt(r.paid_at ?? new Date().toISOString().slice(0, 10));
    setPaidAmount(String(r.paid_amount ?? r.amount));
  };

  const markPaid = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("installments")
      .update({
        status: "pago",
        paid_at: paidAt,
        paid_amount: Number(paidAmount),
      })
      .eq("id", selected.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Parcela marcada como paga" });
    setSelected(null);
    load();
  };

  const reopenInstallment = async () => {
    if (!selected) return;
    const overdue = new Date(selected.due_date) < new Date(new Date().toDateString());
    const { error } = await supabase
      .from("installments")
      .update({
        status: overdue ? "atrasado" : "pendente",
        paid_at: null,
        paid_amount: null,
      })
      .eq("id", selected.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Parcela reaberta" });
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Financeiro
          </h1>
          <p className="text-sm text-muted-foreground">
            Parcelas a receber geradas automaticamente a partir dos contratos ativos.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Total previsto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBRL(kpis.total)}</div>
            <p className="text-xs text-muted-foreground">{kpis.count} parcelas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Recebido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmtBRL(kpis.recebido)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" /> Pendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{fmtBRL(kpis.pendente)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Atrasado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{fmtBRL(kpis.atrasado)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Fluxo de caixa — próximos 12 meses
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Recebido (pago no mês) vs. Previsto (parcelas com vencimento no mês ainda em aberto).
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name) => [fmtBRL(value), name]}
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="recebido" name="Recebido" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="previsto" name="Previsto" fill="hsl(var(--muted-foreground) / 0.5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <CardTitle className="text-base">Parcelas</CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar contrato/marca…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 w-56"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="atrasado">Atrasado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma parcela encontrada. Ative um contrato para gerar parcelas automaticamente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                      <TableCell className="font-medium">
                        {r.contract_title}
                        {r.contract_number && (
                          <span className="text-xs text-muted-foreground ml-2">#{r.contract_number}</span>
                        )}
                      </TableCell>
                      <TableCell>{r.contract_brand}</TableCell>
                      <TableCell>
                        {r.installment_number}/{r.total_installments}
                      </TableCell>
                      <TableCell>{fmtDate(r.due_date)}</TableCell>
                      <TableCell className="font-medium">{fmtBRL(r.amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[r.status].className}>
                          {statusConfig[r.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(r);
                          }}
                        >
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>
                  Parcela {selected.installment_number}/{selected.total_installments}
                </SheetTitle>
                <SheetDescription>
                  {selected.contract_title} — {selected.contract_brand}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 py-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Vencimento</Label>
                    <div className="font-medium">{fmtDate(selected.due_date)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor</Label>
                    <div className="font-medium">{fmtBRL(selected.amount)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div>
                      <Badge variant="outline" className={statusConfig[selected.status].className}>
                        {statusConfig[selected.status].label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Forma</Label>
                    <div className="font-medium capitalize">
                      {selected.payment_method?.replace("_", " ") ?? "—"}
                    </div>
                  </div>
                </div>

                {selected.status !== "pago" ? (
                  <div className="space-y-3 border-t pt-4">
                    <div>
                      <Label htmlFor="paid_at">Data do pagamento</Label>
                      <Input
                        id="paid_at"
                        type="date"
                        value={paidAt}
                        onChange={(e) => setPaidAt(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="paid_amount">Valor recebido</Label>
                      <Input
                        id="paid_amount"
                        type="number"
                        step="0.01"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                      />
                    </div>
                    <Button className="w-full" onClick={markPaid}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Marcar como paga
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 border-t pt-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Pago em:</span>{" "}
                      <span className="font-medium">{fmtDate(selected.paid_at)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Valor recebido:</span>{" "}
                      <span className="font-medium">{fmtBRL(selected.paid_amount ?? selected.amount)}</span>
                    </div>
                    <Button variant="outline" className="w-full" onClick={reopenInstallment}>
                      Reabrir parcela
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
