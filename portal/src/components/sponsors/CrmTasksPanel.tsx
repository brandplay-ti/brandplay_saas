import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Plus, Trash2, CalendarClock, Sparkle } from "lucide-react";
import { TASK_PRIORITY_LABEL, TASK_TYPE_LABEL, formatDate } from "@/lib/crmAccount";
import { ActivityContextLinks } from "@/components/common/ActivityContextLinks";
import { DueDateEditor } from "@/components/common/DueDateEditor";
import { TaskInsightsDialog } from "@/components/common/TaskInsightsDialog";


const db = supabase as any;

export interface CrmTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  assignee_id: string | null;
  source: string;
  completed_at: string | null;
  sponsor_id?: string | null;
  sponsors?: { name: string } | null;
  opportunity_id?: string | null;
  opportunities?: { id: string; brand: string | null; sports_properties?: { name: string } | null } | null;
}

export const CrmTasksPanel = ({ sponsorId, opportunityId }: { sponsorId: string; opportunityId?: string | null }) => {
  const { user } = useAuth();
  const { orgId, can } = useOrganization();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({ title: "", task_type: "followup", priority: "media", due_date: "", description: "" });
  const [insightTaskId, setInsightTaskId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkDate, setBulkDate] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const editable = can("crm");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db
      .from("crm_tasks")
      .select(
        "id,title,description,task_type,priority,status,due_date,assignee_id,source,completed_at,sponsor_id,sponsors(name),opportunity_id,opportunities(id,brand,sports_properties(name))",
      )
      .eq("sponsor_id", sponsorId)
      .order("status")
      .order("due_date", { nullsFirst: false });
    setTasks((data ?? []) as CrmTask[]);
    setLoading(false);
  }, [sponsorId]);


  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim() || !orgId || !user) return;
    const { error } = await db.from("crm_tasks").insert({
      organization_id: orgId,
      sponsor_id: sponsorId,
      opportunity_id: opportunityId ?? null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      task_type: form.task_type,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_id: user.id,
      created_by: user.id,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setForm({ title: "", task_type: "followup", priority: "media", due_date: "", description: "" });
    toast({ title: "Tarefa criada" });
    load();
  };

  const complete = async (t: CrmTask) => {
    const { error } = await db.from("crm_tasks").update({ status: "concluida" }).eq("id", t.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Tarefa concluída", description: "Uma interação foi registrada no histórico." });
    load();
  };

  const updateDueDate = async (t: CrmTask, next: string | null) => {
    const { error } = await db.from("crm_tasks").update({ due_date: next }).eq("id", t.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, due_date: next } : x)));
    toast({ title: "Data atualizada" });
  };

  const remove = async (t: CrmTask) => {
    await db.from("crm_tasks").delete().eq("id", t.id);
    load();
  };

  const visible = tasks.filter((t) => (showDone ? true : t.status !== "concluida"));
  const today = new Date().toISOString().slice(0, 10);

  const selectedIds = visible.filter((t) => selected[t.id]).map((t) => t.id);
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    if (checked) visible.forEach((t) => { next[t.id] = true; });
    setSelected(next);
  };

  const bulkUpdateDates = async (next: string | null) => {
    if (selectedIds.length === 0) return;
    setBulkSaving(true);
    const { error } = await db.from("crm_tasks").update({ due_date: next }).in("id", selectedIds);
    setBulkSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setTasks((cur) => cur.map((x) => (selectedIds.includes(x.id) ? { ...x, due_date: next } : x)));
    toast({
      title: next ? "Prazos atualizados" : "Prazos removidos",
      description: `${selectedIds.length} tarefa(s) atualizada(s).`,
    });
    setSelected({});
    setBulkDate("");
  };

  const bulkShiftDays = async (days: number) => {
    if (selectedIds.length === 0) return;
    setBulkSaving(true);
    const updates = visible
      .filter((t) => selectedIds.includes(t.id))
      .map((t) => {
        const base = t.due_date ? new Date(`${t.due_date.slice(0, 10)}T00:00:00`) : new Date();
        base.setDate(base.getDate() + days);
        return { id: t.id, due_date: base.toISOString().slice(0, 10) };
      });
    for (const u of updates) {
      await db.from("crm_tasks").update({ due_date: u.due_date }).eq("id", u.id);
    }
    setBulkSaving(false);
    setTasks((cur) => cur.map((x) => {
      const u = updates.find((y) => y.id === x.id);
      return u ? { ...x, due_date: u.due_date } : x;
    }));
    toast({ title: "Prazos adiados", description: `${updates.length} tarefa(s) em ${days} dia(s).` });
    setSelected({});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {tasks.filter((t) => t.status !== "concluida").length} tarefa(s) aberta(s)
        </p>
        <div className="flex items-center gap-2">
          {editable && visible.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => { setBulkMode((v) => !v); setSelected({}); }}>
              {bulkMode ? "Sair da edição em lote" : "Editar prazos em lote"}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Button>
        </div>
      </div>

      {editable && bulkMode && visible.length > 0 && (
        <div className="rounded-md border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(Boolean(v))} id="crm-bulk-all" />
            <Label htmlFor="crm-bulk-all" className="text-xs">
              Selecionar todas ({selectedIds.length}/{visible.length} selecionadas)
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              className="h-8 w-[160px]"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!bulkDate || selectedIds.length === 0 || bulkSaving}
              onClick={() => bulkUpdateDates(bulkDate)}
            >
              Aplicar data
            </Button>
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0 || bulkSaving} onClick={() => bulkShiftDays(1)}>
              +1 dia
            </Button>
            <Button size="sm" variant="outline" disabled={selectedIds.length === 0 || bulkSaving} onClick={() => bulkShiftDays(7)}>
              +7 dias
            </Button>
            <Button size="sm" variant="ghost" disabled={selectedIds.length === 0 || bulkSaving} onClick={() => bulkUpdateDates(null)}>
              Limpar prazo
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => {
            const late = t.status !== "concluida" && t.due_date && t.due_date < today;
            return (
              <Card key={t.id}>
                <CardContent className="p-3 flex items-start gap-3">
                  {editable && bulkMode && (
                    <Checkbox
                      className="mt-1"
                      checked={Boolean(selected[t.id])}
                      onCheckedChange={(v) => setSelected((cur) => ({ ...cur, [t.id]: Boolean(v) }))}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${t.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                      <Badge variant="secondary" className="text-[10px]">{TASK_TYPE_LABEL[t.task_type] ?? t.task_type}</Badge>
                      <Badge variant="outline" className="text-[10px]">{TASK_PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                      <button
                        type="button"
                        onClick={() => setInsightTaskId(t.id)}
                        title="Ver insights da IA para concluir esta tarefa"
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        <Sparkle className="h-3 w-3" /> IA
                      </button>
                      {late && <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Atrasada</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{t.description}</p>}
                    <div className="mt-1">
                      <DueDateEditor
                        value={t.due_date}
                        disabled={!editable}
                        onSave={async (next) => { await updateDueDate(t, next); }}
                      />
                    </div>
                    <ActivityContextLinks
                      sponsorId={t.sponsor_id ?? sponsorId}
                      sponsorName={t.sponsors?.name ?? null}
                      opportunityId={t.opportunity_id ?? null}
                      opportunityLabel={t.opportunities?.brand ?? null}
                      propertyName={t.opportunities?.sports_properties?.name ?? null}
                    />
                  </div>

                  {editable && (
                    <div className="flex flex-col gap-1">
                      {t.status !== "concluida" && (
                        <Button size="icon" variant="ghost" title="Concluir" onClick={() => complete(t)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editable && (
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <Input placeholder="Nova tarefa" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={form.task_type} onValueChange={(v) => setForm({ ...form, task_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <Textarea placeholder="Detalhes (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button size="sm" className="w-full" disabled={!form.title.trim()} onClick={create}>
            <Plus className="h-4 w-4 mr-2" /> Adicionar tarefa
          </Button>
        </div>
      )}

      <TaskInsightsDialog
        taskId={insightTaskId}
        open={Boolean(insightTaskId)}
        onOpenChange={(v) => { if (!v) setInsightTaskId(null); }}
      />
    </div>
  );
};
