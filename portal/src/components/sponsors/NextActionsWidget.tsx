import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Row = {
  id: string;
  sponsor_id: string;
  title: string;
  next_action: string | null;
  next_action_at: string;
  sponsor: { name: string } | null;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const isOverdue = (iso: string) => new Date(iso).getTime() < Date.now();

export const NextActionsWidget = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sponsor_interactions")
      .select("id, sponsor_id, title, next_action, next_action_at, sponsor:sponsors(name)")
      .eq("next_action_done", false)
      .not("next_action_at", "is", null)
      .order("next_action_at", { ascending: true })
      .limit(8);
    if (error) {
      toast({ title: "Erro ao carregar ações", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const markDone = async (id: string) => {
    setCompleting(id);
    const { error } = await supabase
      .from("sponsor_interactions")
      .update({ next_action_done: true })
      .eq("id", id);
    setCompleting(null);
    if (error) {
      toast({ title: "Erro ao concluir", description: error.message, variant: "destructive" });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "Ação concluída" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Próximas ações
        </CardTitle>
        <Badge variant={rows.some((r) => isOverdue(r.next_action_at)) ? "destructive" : "outline"}>
          {rows.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4 text-success" /> Nenhuma ação pendente.
          </div>
        ) : (
          rows.map((r) => {
            const overdue = isOverdue(r.next_action_at);
            return (
              <div
                key={r.id}
                className="rounded-md border border-border p-2 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {r.next_action || r.title}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-0.5 gap-2">
                      <Link
                        to={`/dashboard/patrocinadores/${r.sponsor_id}`}
                        className="truncate hover:text-primary inline-flex items-center gap-1"
                      >
                        {r.sponsor?.name ?? "—"} <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                      <span className={overdue ? "text-destructive font-medium" : ""}>
                        {fmtDate(r.next_action_at)}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => markDone(r.id)}
                    disabled={completing === r.id}
                    title="Marcar como concluída"
                  >
                    {completing === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
