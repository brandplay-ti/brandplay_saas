import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

type Props = {
  contractId: string;
  initialSummary: string | null;
  onSummaryUpdated?: (summary: string) => void;
};

export function ContractAISummary({ contractId, initialSummary, onSummaryUpdated }: Props) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-contract", {
        body: { contract_id: contractId, mode: "summarize" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const s = (data as any).summary as string;
      setSummary(s);
      onSummaryUpdated?.(s);
      toast.success("Resumo gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao resumir");
    } finally {
      setLoading(false);
    }
  };

  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setQuestion("");
    try {
      const { data, error } = await supabase.functions.invoke("summarize-contract", {
        body: { contract_id: contractId, mode: "chat", question: q },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setAnswers((prev) => [...prev, { q, a: (data as any).answer }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAsking(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">Resumo por IA</h4>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            {summary ? "Regerar" : "Resumir"}
          </Button>
          {summary && (
            <Dialog open={chatOpen} onOpenChange={setChatOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Perguntar</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Perguntar sobre o contrato</DialogTitle>
                  <DialogDescription>Faça perguntas baseadas no contrato e no resumo.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                  {answers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma pergunta ainda.</p>
                  )}
                  {answers.map((item, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-sm font-medium">{item.q}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.a}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: qual o valor total e a multa rescisória?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
                    disabled={asking}
                  />
                  <Button onClick={ask} disabled={asking || !question.trim()}>
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {summary ? (
        <div className="prose prose-sm max-w-none text-foreground [&_*]:text-foreground [&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:font-semibold whitespace-pre-wrap">
          {summary}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Clique em "Resumir" para gerar um resumo executivo do contrato.</p>
      )}
    </Card>
  );
}
