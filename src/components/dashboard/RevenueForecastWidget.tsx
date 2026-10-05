import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, RefreshCw, Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);

export function RevenueForecastWidget() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("revenue-forecast", { body: {} });
    if (!error) setData(res);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Forecast de receita (12m)
            <Sparkles className="h-3 w-3 text-amber-500" />
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Confirmado (parcelas) + ponderado (pipeline × probabilidade)</p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {!data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Confirmado</p>
                <p className="text-base font-semibold">{fmt(data.totals.confirmado)}</p>
              </div>
              <div className="p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">Ponderado</p>
                <p className="text-base font-semibold">{fmt(data.totals.ponderado)}</p>
              </div>
              <div className="p-3 rounded-md border bg-primary/5">
                <p className="text-xs text-muted-foreground">Total previsto</p>
                <p className="text-base font-semibold text-primary">{fmt(data.totals.total)}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="confirmado" stackId="a" fill="hsl(var(--primary))" name="Confirmado" />
                <Bar dataKey="ponderado" stackId="a" fill="hsl(var(--accent))" name="Ponderado" />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
