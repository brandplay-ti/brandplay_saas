import { useState } from "react";
import { Activity, AlertTriangle, Loader2, Percent, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatTile } from "@/components/admin/StatTile";
import { useAdminProjection, useAdminRevenue } from "@/hooks/usePlatformAdmin";
import { formatCents } from "@/lib/billing";
import { formatMonth, formatPercent } from "@/lib/platformAdmin";
import { PageHeader } from "@/components/common/PageHeader";

const PERIODOS = [6, 12, 24];

/** Eixo em reais abreviados ("R$ 12 mil"); o tooltip mostra o valor exato. */
const eixoEmReais = (centavos: number) => {
  const reais = centavos / 100;
  return reais >= 1000 ? `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${reais}`;
};

const EstiloDoTooltip = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    color: "hsl(var(--popover-foreground))",
    fontSize: 12,
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
};

const Carregando = ({ rotulo }: { rotulo: string }) => (
  <div className="flex justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label={rotulo} />
  </div>
);

const Falha = ({ titulo }: { titulo: string }) => (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>{titulo}</AlertTitle>
    <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
  </Alert>
);

const Realizado = () => {
  const [meses, setMeses] = useState(12);
  const realizado = useAdminRevenue(meses);

  const linhas = realizado.data ?? [];
  const total = linhas.reduce((soma, m) => soma + m.revenue_cents, 0);
  const dados = linhas.map((m) => ({ ...m, rotulo: formatMonth(m.month) }));

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5 w-44">
          <Label htmlFor="periodo-realizado">Período</Label>
          <Select value={String(meses)} onValueChange={(v) => setMeses(Number(v))}>
            <SelectTrigger id="periodo-realizado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Últimos {p} meses
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {realizado.isLoading ? (
        <Carregando rotulo="Carregando faturamento realizado" />
      ) : realizado.isError ? (
        <Falha titulo="Não foi possível carregar o faturamento realizado" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receita recebida por mês</CardTitle>
              <CardDescription>
                Faturas pagas, no mês do pagamento. {formatCents(total)} no período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dados} margin={{ left: 8, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={88}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={eixoEmReais}
                    />
                    <Tooltip
                      {...EstiloDoTooltip}
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      formatter={(v: number) => [formatCents(v), "Receita"]}
                    />
                    <Bar dataKey="revenue_cents" name="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Faturas pagas</TableHead>
                    <TableHead className="text-right">Clientes no fim do mês</TableHead>
                    <TableHead className="text-right">Novas</TableHead>
                    <TableHead className="text-right">Cancelamentos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...linhas].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{formatMonth(m.month)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(m.revenue_cents)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.paid_invoices}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.customers}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.new_subscriptions}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.cancellations}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(total)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {linhas.reduce((s, m) => s + m.paid_invoices, 0)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">
                      {linhas.reduce((s, m) => s + m.new_subscriptions, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {linhas.reduce((s, m) => s + m.cancellations, 0)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

const Projetado = () => {
  const projecao = useAdminProjection(6);

  if (projecao.isLoading) return <Carregando rotulo="Carregando projeção" />;
  if (projecao.isError || !projecao.data) return <Falha titulo="Não foi possível carregar a projeção" />;

  const p = projecao.data;
  const dados = p.months.map((m) => ({ ...m, rotulo: formatMonth(m.month) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="MRR atual" value={formatCents(p.mrr_cents)} hint={`${p.customers} ${p.customers === 1 ? "assinatura ativa ou em atraso" : "assinaturas ativas ou em atraso"}`} icon={Activity} />
        <StatTile label="Ticket médio" value={formatCents(p.average_ticket_cents)} icon={Percent} />
        <StatTile label="Crescimento ao mês" value={formatPercent(p.growth_rate)} hint={`Últimos ${p.history_months} meses fechados`} icon={TrendingUp} />
        <StatTile label="Churn ao mês" value={formatPercent(p.churn_rate)} hint={`Últimos ${p.history_months} meses fechados`} icon={TrendingDown} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MRR projetado</CardTitle>
          <CardDescription>
            Parte do MRR de hoje e aplica as taxas observadas. Otimista ignora o churn; pessimista ignora o
            crescimento. Sem histórico, as taxas são zero e a projeção repete o MRR atual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={88}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={eixoEmReais}
                />
                <Tooltip {...EstiloDoTooltip} formatter={(v: number, nome: string) => [formatCents(v), nome]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="optimistic_cents" name="Otimista" stroke="hsl(var(--primary))" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                <Line type="monotone" dataKey="base_cents" name="Base" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="pessimistic_cents" name="Pessimista" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="2 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead className="text-right">Pessimista</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Otimista</TableHead>
                <TableHead className="text-right">Clientes (base)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{formatMonth(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(m.pessimistic_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCents(m.base_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(m.optimistic_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.customers}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Funil: {p.in_trial} {p.in_trial === 1 ? "organização" : "organizações"} em teste grátis e {p.awaiting_payment}{" "}
        {p.awaiting_payment === 1 ? "contratação" : "contratações"} aguardando pagamento — fora do MRR até pagarem.
      </p>
    </div>
  );
};

const AdminRevenue = () => (
  <div className="space-y-6 animate-fade-in">
    <PageHeader
      title="Faturamento"
      description="Lido da projeção do Stripe (faturas e assinaturas). Realizado é caixa: o que foi pago, no mês do pagamento. MRR conta assinaturas ativas e em atraso, pelo preço atual do catálogo."
    />
    <Tabs defaultValue="realizado" className="space-y-4">
      <TabsList>
        <TabsTrigger value="realizado">Realizado</TabsTrigger>
        <TabsTrigger value="projetado">Projetado</TabsTrigger>
      </TabsList>
      <TabsContent value="realizado">
        <Realizado />
      </TabsContent>
      <TabsContent value="projetado">
        <Projetado />
      </TabsContent>
    </Tabs>
  </div>
);

export default AdminRevenue;
