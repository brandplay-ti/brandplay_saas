import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Loader2, Plus, Phone, Mail, Users, ListChecks, StickyNote } from "lucide-react";
import { toast } from "sonner";

type Step = {
  title: string;
  description: string;
  activity_type: "ligacao" | "email" | "reuniao" | "tarefa" | "nota";
  priority: "alta" | "media" | "baixa";
  due_in_days: number;
};

type Context = "opportunity" | "sponsor" | "contract" | "dashboard" | "delivery" | "proposal";

type Props = {
  context: Context;
  targetId?: string;
  opportunityId?: string;
  ownerId?: string;
  onActivityCreated?: () => void;
  /** When provided, "Adicionar ao checklist" goes directly to this property. Otherwise a property picker is shown. */
  propertyId?: string | null;
  legacyOpportunityId?: string;
};

const TYPE_ICONS = {
  ligacao: Phone,
  email: Mail,
  reuniao: Users,
  tarefa: ListChecks,
  nota: StickyNote,
};

const PRIO_CLS = {
  alta: "bg-destructive/15 text-destructive border-destructive/30",
  media: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

type PropOption = { id: string; name: string };

export function NextStepsAI({ context, targetId, opportunityId, ownerId, propertyId, onActivityCreated }: Props) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [addingChecklist, setAddingChecklist] = useState<number | null>(null);
  const [properties, setProperties] = useState<PropOption[] | null>(null);
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const suggest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-next-steps", {
        body: { context, target_id: targetId ?? opportunityId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSteps((data as any).steps as Step[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const loadProperties = async () => {
    if (properties) return;
    const { data, error } = await supabase
      .from("sports_properties")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar propriedades");
      return;
    }
    setProperties((data ?? []) as PropOption[]);
  };

  const createActivity = async (step: Step, idx: number) => {
    if (!opportunityId || !ownerId) return;
    setCreating(idx);
    try {
      const due = new Date();
      due.setDate(due.getDate() + step.due_in_days);
      const { error } = await supabase.from("opportunity_activities").insert({
        opportunity_id: opportunityId,
        owner_id: ownerId,
        title: step.title,
        description: step.description,
        activity_type: step.activity_type,
        due_date: due.toISOString(),
        status: "pendente",
      });
      if (error) throw error;
      toast.success("Atividade criada");
      onActivityCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setCreating(null);
    }
  };

  const addToChecklist = async (step: Step, idx: number, targetPropertyId: string) => {
    setAddingChecklist(idx);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Usuário não autenticado");
      const due = new Date();
      due.setDate(due.getDate() + step.due_in_days);
      const { error } = await supabase.from("property_checklist_items").insert({
        property_id: targetPropertyId,
        owner_id: uid,
        title: step.title,
        description: step.description,
        due_date: due.toISOString().slice(0, 10),
        status: "pendente",
      });
      if (error) throw error;
      toast.success("Tarefa adicionada ao checklist");
      setOpenPicker(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setAddingChecklist(null);
    }
  };

  const hint =
    context === "sponsor"
      ? "A IA analisa score, último contato, contratos e oportunidades para sugerir como reativar ou avançar a conta."
      : context === "contract"
      ? "A IA analisa parcelas, entregas e vigência para sugerir ações do ciclo de vida do contrato."
      : context === "dashboard"
      ? "A IA agrega oportunidades paradas, contratos vencendo, propostas sem resposta e entregas atrasadas para priorizar seu dia."
      : context === "delivery"
      ? "A IA analisa entregas atrasadas e próximas do prazo para sugerir como destravar (cobrar arte, agendar produção, alinhar com patrocinador)."
      : context === "proposal"
      ? "A IA analisa status, tempo desde envio, itens e validade para sugerir follow-up, ajustes de escopo ou desconto."
      : "A IA analisa o estágio, atividades e tempo parado para sugerir próximos passos.";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-medium">Próximos passos sugeridos por IA</h4>
        </div>
        <Button size="sm" variant="outline" onClick={suggest} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
          {steps ? "Sugerir novamente" : "Sugerir"}
        </Button>
      </div>

      {!steps && !loading && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}

      {steps && (
        <div className="space-y-2">
          {steps.map((s, i) => {
            const Icon = TYPE_ICONS[s.activity_type] ?? StickyNote;
            return (
              <Card key={i} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-xs ${PRIO_CLS[s.priority]}`}>
                    {s.priority}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Em {s.due_in_days} {s.due_in_days === 1 ? "dia" : "dias"}
                  </span>
                  <div className="flex items-center gap-1">
                    {opportunityId && ownerId && (
                      <Button size="sm" variant="ghost" onClick={() => createActivity(s, i)} disabled={creating === i}>
                        {creating === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                        Criar atividade
                      </Button>
                    )}
                    {propertyId ? (
                      <Button size="sm" variant="ghost" onClick={() => addToChecklist(s, i, propertyId)} disabled={addingChecklist === i}>
                        {addingChecklist === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ListChecks className="h-3 w-3 mr-1" />}
                        Adicionar ao checklist
                      </Button>
                    ) : (
                      <Popover open={openPicker === i} onOpenChange={(o) => setOpenPicker(o ? i : null)}>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={loadProperties} disabled={addingChecklist === i}>
                            {addingChecklist === i ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ListChecks className="h-3 w-3 mr-1" />}
                            Adicionar ao checklist
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="end">
                          <p className="text-xs font-medium px-2 py-1">Escolha a propriedade</p>
                          {!properties ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                          ) : properties.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-2 py-2">Nenhuma propriedade encontrada.</p>
                          ) : (
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {properties.map((p) => (
                                <Button
                                  key={p.id}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start text-xs h-8"
                                  onClick={() => addToChecklist(s, i, p.id)}
                                  disabled={addingChecklist === i}
                                >
                                  {p.name}
                                </Button>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
