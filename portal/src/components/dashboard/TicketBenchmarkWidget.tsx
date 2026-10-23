import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { avisarErroDeIA, avisarIAParcial, traduzirErroDeIA } from "@/lib/erroDeIA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scale, RefreshCw, Sparkles, ArrowUp, ArrowDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

interface Item {
  segment: string;
  internal_avg: number;
  contract_count: number;
  market_avg: number | null;
  market_min: number | null;
  market_max: number | null;
  market_notes: string | null;
  variance_percent: number | null;
}

const SEM_MERCADO = "Estimativa de mercado indisponível";

export function TicketBenchmarkWidget() {
  const { orgId } = useOrganization();
  const [items, setItems] = useState<Item[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Da organização ativa. A falha só da estimativa de mercado (IA) fica como
  // nota; o toast é só na atualização manual, para não aparecer a cada visita.
  const load = useCallback(async (force = false) => {
    setAviso(null);
    if (!orgId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ticket-benchmark-ai", { body: { organization_id: orgId, force } });
      if (error || data?.error) {
        setItems([]);
        await avisarErroDeIA(error, data, "Erro ao calcular o benchmark");
        return;
      }
      setItems((data?.items ?? []) as Item[]);
      if (data?.aviso_ia) setAviso(traduzirErroDeIA(data.aviso_ia, SEM_MERCADO).descricao);
      if (force) avisarIAParcial(data?.aviso_ia, SEM_MERCADO);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(false); }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" /> Benchmark de ticket médio
            <Sparkles className="h-3 w-3 text-warning-strong" />
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Sua média por segmento vs. estimativa de mercado (IA)</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {aviso && items.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">{SEM_MERCADO}: {aviso}</p>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {loading ? "Calculando…" : "Sem contratos ativos para comparar."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmento</TableHead>
                  <TableHead className="text-right">Sua média</TableHead>
                  <TableHead className="text-right">Mercado</TableHead>
                  <TableHead className="text-right">Variação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.segment}>
                    <TableCell className="font-medium">
                      {i.segment}
                      <span className="text-muted-foreground text-xs ml-1">({i.contract_count})</span>
                    </TableCell>
                    <TableCell className="text-right">{fmt(i.internal_avg)}</TableCell>
                    <TableCell className="text-right text-muted-foreground" title={i.market_notes || undefined}>
                      {fmt(i.market_avg)}
                      {i.market_min && i.market_max && (
                        <div className="text-[10px]">
                          {fmt(i.market_min)} – {fmt(i.market_max)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {i.variance_percent == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            i.variance_percent >= 0
                              ? "bg-success/10 text-success-strong border-success/30"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          }
                        >
                          {i.variance_percent >= 0 ? <ArrowUp className="h-3 w-3 mr-0.5" /> : <ArrowDown className="h-3 w-3 mr-0.5" />}
                          {Math.abs(i.variance_percent)}%
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground mt-2">
              Estimativas de mercado geradas por IA, atualizadas semanalmente. Use como referência, não como verdade absoluta.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
