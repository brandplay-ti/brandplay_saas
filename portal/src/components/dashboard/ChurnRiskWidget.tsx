import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, RefreshCw, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Risk {
  contract_id: string;
  contract_title: string;
  sponsor_name: string;
  sponsor_id: string | null;
  risk_level: "baixo" | "medio" | "alto" | "critico";
  risk_score: number;
  signals: string[];
  recommendation?: string;
  total_value: number;
}

const levelCls: Record<string, string> = {
  critico: "bg-destructive/15 text-destructive border-destructive/30",
  alto: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  medio: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  baixo: "bg-muted text-muted-foreground border-border",
};

export const ChurnRiskWidget = () => {
  const { toast } = useToast();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("detect-churn-risk", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRisks(data.risks ?? []);
      setLoaded(true);
    } catch (e: any) {
      toast({ title: "Erro ao analisar risco", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-destructive" /> Risco de churn (IA)
        </CardTitle>
        <Button variant="outline" size="sm" onClick={analyze} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          {loaded ? "Reanalisar" : "Analisar"}
        </Button>
      </CardHeader>
      <CardContent>
        {!loaded && !loading && (
          <p className="text-sm text-muted-foreground">
            Clique em <strong>Analisar</strong> para detectar contratos em risco com base em atrasos, entregas reprovadas e silêncio.
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Analisando contratos ativos…</p>}
        {loaded && risks.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum risco detectado. ✨</p>
        )}
        <div className="space-y-2">
          {risks.slice(0, 6).map((r) => (
            <div key={r.contract_id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.sponsor_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.contract_title}</p>
                </div>
                <Badge variant="outline" className={levelCls[r.risk_level]}>
                  {r.risk_level} · {r.risk_score}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {r.signals.map((s, i) => (
                  <span key={i} className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
                    <AlertTriangle className="h-2.5 w-2.5" /> {s}
                  </span>
                ))}
              </div>
              {r.recommendation && (
                <p className="text-xs italic text-muted-foreground">💡 {r.recommendation}</p>
              )}
              {r.sponsor_id && (
                <Link to={`/dashboard/patrocinadores/${r.sponsor_id}`} className="text-xs text-primary hover:underline">
                  Ver patrocinador →
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
