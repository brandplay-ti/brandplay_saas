import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, RefreshCw, Sparkle, AlertTriangle, ListChecks, MessageSquare } from "lucide-react";

interface Insights {
  resumo: string;
  contexto_relevante: string[];
  passos: { titulo: string; detalhe: string }[];
  argumentos: string[];
  riscos: string[];
  mensagem_sugerida: string;
  dados_ausentes: string[];
}

interface Payload {
  task_title: string;
  sponsor_name: string | null;
  opportunity_label: string | null;
  insights: Insights;
  facts?: { dias_sem_contato: number | null; entregas?: Record<string, number> | null };
}

export type TaskInsightsSource = "crm_task" | "activity" | "checklist";

export const TaskInsightsDialog = ({
  taskId,
  source = "crm_task",
  open,
  onOpenChange,
}: {
  taskId: string | null;
  source?: TaskInsightsSource;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);

  const run = async () => {
    if (!taskId) return;
    setLoading(true);
    setData(null);
    const { data: res, error } = await supabase.functions.invoke("task-insights", { body: { task_id: taskId, source } });
    setLoading(false);
    if (error || (res as any)?.error) {
      toast({
        title: "Não foi possível gerar os insights",
        description: (res as any)?.error ?? error?.message,
        variant: "destructive",
      });
      return;
    }
    setData(res as Payload);
  };

  useEffect(() => {
    if (open && taskId) run();
    if (!open) setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copiado" });
  };

  const i = data?.insights;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" /> Insights para concluir a tarefa
          </DialogTitle>
          <DialogDescription>
            {data?.task_title ?? "Análise da IA cruzando dados da conta, oportunidade, propostas, contratos e entregas."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && i && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              {data?.sponsor_name && <Badge variant="secondary">{data.sponsor_name}</Badge>}
              {data?.opportunity_label && <Badge variant="outline">{data.opportunity_label}</Badge>}
              {typeof data?.facts?.dias_sem_contato === "number" && (
                <Badge variant="outline">{data.facts.dias_sem_contato} dia(s) sem contato</Badge>
              )}
            </div>

            {i.resumo && <p className="text-muted-foreground whitespace-pre-wrap">{i.resumo}</p>}

            {i.contexto_relevante.length > 0 && (
              <div>
                <p className="font-medium mb-1">Contexto relevante</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {i.contexto_relevante.map((c, idx) => <li key={idx}>{c}</li>)}
                </ul>
              </div>
            )}

            {i.passos.length > 0 && (
              <div>
                <p className="font-medium mb-2 flex items-center gap-2"><ListChecks className="h-4 w-4" /> Como concluir</p>
                <ol className="space-y-2">
                  {i.passos.map((p, idx) => (
                    <li key={idx} className="rounded-md border p-2">
                      <p className="font-medium">{idx + 1}. {p.titulo}</p>
                      <p className="text-muted-foreground text-xs mt-0.5 whitespace-pre-wrap">{p.detalhe}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {i.argumentos.length > 0 && (
              <div>
                <p className="font-medium mb-1">Argumentos de apoio</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {i.argumentos.map((a, idx) => <li key={idx}>{a}</li>)}
                </ul>
              </div>
            )}

            {i.riscos.length > 0 && (
              <div>
                <p className="font-medium mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Riscos</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {i.riscos.map((r, idx) => <li key={idx}>{r}</li>)}
                </ul>
              </div>
            )}

            {i.mensagem_sugerida && (
              <div>
                <p className="font-medium mb-1 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Mensagem sugerida</p>
                <div className="rounded-md border bg-muted/40 p-3 whitespace-pre-wrap text-muted-foreground">
                  {i.mensagem_sugerida}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(i.mensagem_sugerida)}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar mensagem
                </Button>
              </div>
            )}

            {i.dados_ausentes.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="font-medium mb-1">Dados que faltam no BrandPlay</p>
                  <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                    {i.dados_ausentes.map((d, idx) => <li key={idx}>{d}</li>)}
                  </ul>
                </div>
              </>
            )}

            <Button size="sm" variant="ghost" onClick={run}>
              <RefreshCw className="h-4 w-4 mr-2" /> Gerar novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
