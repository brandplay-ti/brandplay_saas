import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutGrid, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tier {
  id: string;
  name: string;
  level: string;
  property_id: string;
  total_slots: number;
  value: number;
}
interface Property { id: string; name: string; }
interface Sale { tier_id: string; status: string; }

export function QuotaHeatmapWidget() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [t, p, s] = await Promise.all([
      supabase.from("sponsorship_tiers").select("id,name,level,property_id,total_slots,value"),
      supabase.from("sports_properties").select("id,name"),
      supabase.from("tier_sales").select("tier_id,status").neq("status", "cancelada"),
    ]);
    setTiers((t.data ?? []) as Tier[]);
    setProperties((p.data ?? []) as Property[]);
    setSales((s.data ?? []) as Sale[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const grid = useMemo(() => {
    return properties
      .map((prop) => {
        const propTiers = tiers.filter((t) => t.property_id === prop.id);
        if (propTiers.length === 0) return null;
        const cells = propTiers.map((t) => {
          const sold = sales.filter((sa) => sa.tier_id === t.id).length;
          const ratio = t.total_slots > 0 ? sold / t.total_slots : 0;
          return { tier: t, sold, ratio };
        });
        return { prop, cells };
      })
      .filter(Boolean) as { prop: Property; cells: { tier: Tier; sold: number; ratio: number }[] }[];
  }, [tiers, properties, sales]);

  const colorFor = (ratio: number) => {
    if (ratio >= 1) return "bg-emerald-500/90 text-white border-emerald-600";
    if (ratio >= 0.75) return "bg-emerald-500/60 text-white border-emerald-500";
    if (ratio >= 0.5) return "bg-amber-500/60 text-white border-amber-500";
    if (ratio >= 0.25) return "bg-amber-500/30 border-amber-400";
    if (ratio > 0) return "bg-sky-500/20 border-sky-400";
    return "bg-muted border-border";
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutGrid className="h-4 w-4 text-primary" /> Heatmap de cotas vendidas
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">% de slots vendidos por propriedade × cota</p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {grid.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Crie cotas em Propriedades → Cotas para visualizar o heatmap.
          </p>
        ) : (
          <div className="space-y-3">
            {grid.map(({ prop, cells }) => (
              <div key={prop.id}>
                <p className="text-xs font-medium mb-1 truncate">{prop.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {cells.map(({ tier, sold, ratio }) => (
                    <div
                      key={tier.id}
                      className={cn(
                        "px-2.5 py-1.5 rounded border text-[11px] min-w-[90px]",
                        colorFor(ratio)
                      )}
                      title={`${tier.name}: ${sold}/${tier.total_slots} vendidos`}
                    >
                      <div className="font-semibold truncate">{tier.name}</div>
                      <div className="opacity-90">{sold}/{tier.total_slots} · {Math.round(ratio * 100)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t flex-wrap">
              <span>Legenda:</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-muted border" /> 0%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-sky-500/20 border border-sky-400" /> &lt;25%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-amber-500/30 border border-amber-400" /> 25-50%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-amber-500/60 border border-amber-500" /> 50-75%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-emerald-500/60 border border-emerald-500" /> 75-99%</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-emerald-500/90 border border-emerald-600" /> 100%</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
