import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface Property { id: string; name: string }
interface Report { id: string; title: string; content: string; metrics: any; created_at: string }

export const SelloutReportGenerator = () => {
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sports_properties").select("id,name").order("name");
      setProperties(data ?? []);
    })();
    loadReports();
  }, []);

  const loadReports = async () => {
    const { data } = await supabase.from("sellout_reports").select("*").order("created_at", { ascending: false }).limit(20);
    setReports(data ?? []);
  };

  const generate = async () => {
    if (!propertyId) {
      toast({ title: "Selecione uma propriedade", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-sellout-report", {
        body: { property_id: propertyId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSelected(data.report);
      await loadReports();
      toast({ title: "Relatório gerado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Gerar relatório de sell-out (IA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecione uma propriedade" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={generate} disabled={loading || !propertyId}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Gerar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A IA analisa cotas vendidas, entregas, audiência e patrocinadores para gerar um relatório executivo completo.
          </p>
        </CardContent>
      </Card>

      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relatórios gerados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left p-3 rounded-md border hover:bg-muted/50 transition ${selected?.id === r.id ? "bg-muted border-primary" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium flex-1 truncate">{r.title}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.metrics?.sellout_pct !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Sell-out: <strong>{r.metrics.sellout_pct}%</strong> · Receita: R$ {Number(r.metrics.receita_total || 0).toLocaleString("pt-BR")}
                  </p>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{selected.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
