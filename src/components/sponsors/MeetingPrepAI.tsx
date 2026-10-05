import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarClock, Sparkles, Loader2, Copy, Plus, AlertTriangle, ThumbsUp, HelpCircle, Info,
} from "lucide-react";

const db = supabase as any;

type AgendaItem = { titulo: string; minutos: number; objetivo: string };
type NextStep = { titulo: string; prazo_em_dias: number; prioridade: string };

interface Briefing {
  resumo: string;
  agenda: AgendaItem[];
  pontos_fortes: string[];
  riscos: string[];
  perguntas: string[];
  proximos_passos: NextStep[];
  dados_ausentes: string[];
}

interface Result {
  generated_at: string;
  sponsor_name: string;
  finance_included: boolean;
  briefing: Briefing;
  facts: {
    dias_sem_contato: number | null;
    oportunidades_abertas: number;
    contratos_ativos: number;
    proxima_expiracao_contrato: string | null;
    entregas: { aprovadas: number; pendentes: number; atrasadas: number; total: number };
    financeiro: { total_contratado: number; total_pago: number; parcelas_atrasadas: number; proxima_parcela: string | null } | null;
  };
}

const PRIO_CLS: Record<string, string> = {
  alta: "bg-destructive/15 text-destructive border-destructive/30",
  media: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

export const MeetingPrepAI = ({ sponsorId, onTaskCreated }: { sponsorId: string; onTaskCreated?: () => void }) => {
  const { toast } = useToast();
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [creating, setCreating] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prepare-meeting-ai", {
        body: { sponsor_id: sponsorId, objective },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as Result);
    } catch (e) {
      toast({
        title: "Não foi possível preparar a reunião",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (step: NextStep, idx: number) => {
    setCreating(idx);
    try {
      const due = new Date();
      due.setDate(due.getDate() + (Number(step.prazo_em_dias) || 3));
      const { error } = await db.from("crm_tasks").insert({
        sponsor_id: sponsorId,
        title: step.titulo,
        task_type: "reuniao",
        due_date: due.toISOString().slice(0, 10),
        priority: ["alta", "media", "baixa"].includes(step.prioridade) ? step.prioridade : "media",
        source: "ia",
      });
      if (error) throw error;
      toast({ title: "Tarefa criada" });
      onTaskCreated?.();
    } catch (e) {
      toast({
        title: "Erro ao criar tarefa",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setCreating(null);
    }
  };

  const copyBriefing = async () => {
    if (!result) return;
    const b = result.briefing;
    const text = [
      `Preparação de reunião — ${result.sponsor_name}`,
      `Gerado em ${new Date(result.generated_at).toLocaleString("pt-BR")}`,
      "",
      b.resumo,
      "",
      "Agenda:",
      ...b.agenda.map((a, i) => `${i + 1}. ${a.titulo} (${a.minutos} min) — ${a.objetivo}`),
      "",
      "Pontos fortes:",
      ...b.pontos_fortes.map((p) => `- ${p}`),
      "",
      "Riscos:",
      ...b.riscos.map((p) => `- ${p}`),
      "",
      "Perguntas-chave:",
      ...b.perguntas.map((p) => `- ${p}`),
      "",
      "Próximos passos:",
      ...b.proximos_passos.map((p) => `- ${p.titulo} (em ${p.prazo_em_dias} dias, ${p.prioridade})`),
      ...(b.dados_ausentes.length ? ["", "Dados ausentes:", ...b.dados_ausentes.map((p) => `- ${p}`)] : []),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    toast({ title: "Briefing copiado" });
  };

  const totalMin = result?.briefing.agenda.reduce((s, a) => s + (Number(a.minutos) || 0), 0) ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Preparar reunião com IA
        </CardTitle>
        {result && (
          <Button variant="ghost" size="sm" onClick={copyBriefing}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Objetivo da reunião (opcional): renovação, upsell, alinhamento de entregas…"
          />
          <Button onClick={generate} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {result ? "Gerar novamente" : "Preparar reunião"}
          </Button>
        </div>

        {!result && !loading && (
          <p className="text-xs text-muted-foreground">
            A IA monta agenda e contexto usando apenas dados reais da conta: relacionamento, oportunidades,
            propostas, contratos, entregas e tarefas abertas. Dados financeiros entram somente se você tiver
            acesso ao módulo financeiro.
          </p>
        )}

        {result && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed">{result.briefing.resumo}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Fact label="Sem contato" value={result.facts.dias_sem_contato != null ? `${result.facts.dias_sem_contato} dias` : "—"} />
              <Fact label="Negociações abertas" value={String(result.facts.oportunidades_abertas)} />
              <Fact label="Contratos ativos" value={String(result.facts.contratos_ativos)} />
              <Fact label="Entregas atrasadas" value={String(result.facts.entregas.atrasadas)} />
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                Agenda sugerida
                <Badge variant="outline" className="text-[10px]">{totalMin} min</Badge>
              </h4>
              {result.briefing.agenda.map((a, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{i + 1}. {a.titulo}</p>
                    <span className="text-xs text-muted-foreground shrink-0">{a.minutos} min</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.objetivo}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <List title="Pontos fortes" icon={ThumbsUp} items={result.briefing.pontos_fortes} />
              <List title="Riscos e atenções" icon={AlertTriangle} items={result.briefing.riscos} />
            </div>

            <List title="Perguntas-chave" icon={HelpCircle} items={result.briefing.perguntas} />

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Próximos passos</h4>
              {result.briefing.proximos_passos.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{s.titulo}</p>
                    <p className="text-xs text-muted-foreground">Em {s.prazo_em_dias} dias</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${PRIO_CLS[s.prioridade] ?? PRIO_CLS.media}`}>
                      {s.prioridade}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => createTask(s, i)} disabled={creating === i}>
                      {creating === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                      Tarefa
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {result.briefing.dados_ausentes.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-xs font-medium flex items-center gap-1 mb-1">
                  <Info className="h-3.5 w-3.5" /> Dados ausentes para uma preparação completa
                </p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  {result.briefing.dados_ausentes.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Gerado em {new Date(result.generated_at).toLocaleString("pt-BR")} ·{" "}
              {result.finance_included ? "inclui dados financeiros" : "sem dados financeiros (sem permissão)"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border px-3 py-2">
    <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
    <p className="text-sm font-semibold">{value}</p>
  </div>
);

const List = ({ title, icon: Icon, items }: { title: string; icon: any; items: string[] }) => {
  if (!items?.length) return null;
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-medium flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /> {title}</h4>
      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
};
