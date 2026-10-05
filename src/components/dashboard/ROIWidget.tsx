import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(n || 0);

interface Item {
  sponsor_id: string;
  name: string;
  segment: string | null;
  investment: number;
  paid: number;
  delivery_units: number;
  reached_audience: number;
  estimated_media_value: number;
  roi_percent: number;
}

interface Props {
  sponsorId?: string;
  compact?: boolean;
}

export function ROIWidget({ sponsorId, compact }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("calculate-roi", {
      body: sponsorId ? { sponsor_id: sponsorId } : {},
    });
    if (!error) setItems((data?.items ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [sponsorId]);

  const roiBadge = (roi: number) => {
    if (roi >= 100) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    if (roi >= 0) return "bg-sky-500/15 text-sky-700 border-sky-500/30";
    return "bg-destructive/15 text-destructive border-destructive/30";
  };

  if (compact && sponsorId) {
    const item = items[0];
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" /> ROI estimado
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {!item ? (
            <p className="text-sm text-muted-foreground">{loading ? "Calculando…" : "Sem contratos para calcular ROI."}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Investimento" value={fmt(item.investment)} />
              <Stat label="Audiência alcançada" value={fmtNum(item.reached_audience)} />
              <Stat label="Valor mídia estimado" value={fmt(item.estimated_media_value)} />
              <div className="p-3 rounded-md border">
                <p className="text-xs text-muted-foreground">ROI</p>
                <Badge variant="outline" className={`${roiBadge(item.roi_percent)} text-base mt-1`}>
                  {item.roi_percent > 0 ? "+" : ""}{item.roi_percent}%
                </Badge>
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-3">
            Cálculo: (audiência × entregas × CPM 0,03) − investimento. Ajuste manual recomendado para casos específicos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" /> ROI por patrocinador
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Investimento vs. valor de mídia estimado</p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {loading ? "Calculando…" : "Sem patrocinadores com contratos ativos."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patrocinador</TableHead>
                  <TableHead className="text-right">Investimento</TableHead>
                  <TableHead className="text-right">Entregas</TableHead>
                  <TableHead className="text-right">Audiência</TableHead>
                  <TableHead className="text-right">Mídia est.</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.slice(0, 10).map((i) => (
                  <TableRow key={i.sponsor_id}>
                    <TableCell className="font-medium">
                      {i.name}
                      {i.segment && <div className="text-xs text-muted-foreground">{i.segment}</div>}
                    </TableCell>
                    <TableCell className="text-right">{fmt(i.investment)}</TableCell>
                    <TableCell className="text-right">{i.delivery_units}</TableCell>
                    <TableCell className="text-right">{fmtNum(i.reached_audience)}</TableCell>
                    <TableCell className="text-right">{fmt(i.estimated_media_value)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={roiBadge(i.roi_percent)}>
                        {i.roi_percent > 0 ? "+" : ""}{i.roi_percent}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="p-3 rounded-md border">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold mt-1">{value}</p>
  </div>
);
