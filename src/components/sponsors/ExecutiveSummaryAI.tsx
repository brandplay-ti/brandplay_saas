import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Highlight { label: string; value: string }

export const ExecutiveSummaryAI = ({ sponsorId }: { sponsorId: string }) => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<string>("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (force = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sponsor-executive-summary", {
        body: { sponsor_id: sponsorId, force },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary ?? "");
      setHighlights(data.highlights ?? []);
      setGeneratedAt(data.generated_at ?? null);
    } catch (e: any) {
      toast({ title: "Erro ao gerar resumo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sponsorId) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsorId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Resumo executivo (IA)
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && !summary && <p className="text-sm text-muted-foreground">Gerando resumo…</p>}
        {summary && <p className="text-sm leading-relaxed">{summary}</p>}
        {highlights.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {highlights.map((h) => (
              <div key={h.label} className="rounded-md border px-3 py-2">
                <p className="text-[10px] uppercase text-muted-foreground">{h.label}</p>
                <p className="text-sm font-semibold">{h.value}</p>
              </div>
            ))}
          </div>
        )}
        {generatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Gerado em {new Date(generatedAt).toLocaleString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
