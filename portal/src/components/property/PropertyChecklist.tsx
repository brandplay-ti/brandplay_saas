import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  Truck,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { ActivityContextLinks } from "@/components/common/ActivityContextLinks";
import { DueDateEditor } from "@/components/common/DueDateEditor";
import { TaskInsightsButton } from "@/components/common/TaskInsightsButton";

interface ChecklistItem {
  id: string;
  property_id: string;
  owner_id: string;
  event_id: string | null;
  delivery_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: string | null;
  status: "pendente" | "em_andamento" | "concluido";
  position: number;
  completed_at: string | null;
  sponsor_id: string | null;
  opportunity_id: string | null;
}

interface SponsorRef {
  id: string;
  name: string;
}

interface OpportunityRef {
  id: string;
  brand: string;
  sponsor_id: string | null;
}

interface DeliveryRef {
  id: string;
  title: string;
  brand: string;
  status: string;
  sponsor_id?: string | null;
  opportunity_id?: string | null;
}

interface EventRef {
  id: string;
  title: string;
  starts_at: string;
}

interface Props {
  propertyId: string;
  ownerId: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-slate-500/10 text-slate-700 border-slate-500/30" },
  em_andamento: { label: "Em andamento", color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  concluido: { label: "Concluído", color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
};

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";

export default function PropertyChecklist({ propertyId, ownerId }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRef[]>([]);
  const [events, setEvents] = useState<EventRef[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRef[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignee: "",
    due_date: "",
    delivery_id: "",
    event_id: "",
    sponsor_id: "",
    opportunity_id: "",
  });

  const load = async () => {
    setLoading(true);
    const [itemsRes, delRes, evRes, spRes, oppRes] = await Promise.all([
      (supabase as any)
        .from("property_checklist_items")
        .select("*")
        .eq("property_id", propertyId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("deliveries")
        .select("id, title, brand, status, sponsor_id, opportunity_id")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("property_events")
        .select("id, title, starts_at")
        .eq("property_id", propertyId)
        .order("starts_at", { ascending: false }),
      supabase.from("sponsors").select("id, name").order("name"),
      supabase
        .from("opportunities")
        .select("id, brand, sponsor_id")
        .order("created_at", { ascending: false }),
    ]);
    setItems((itemsRes.data as ChecklistItem[]) ?? []);
    setDeliveries((delRes.data as DeliveryRef[]) ?? []);
    setEvents((evRes.data as EventRef[]) ?? []);
    setSponsors((spRes.data as SponsorRef[]) ?? []);
    setOpportunities((oppRes.data as OpportunityRef[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { error } = await (supabase as any).from("property_checklist_items").insert({
      property_id: propertyId,
      owner_id: ownerId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      assignee: form.assignee.trim() || null,
      due_date: form.due_date || null,
      delivery_id: form.delivery_id || null,
      event_id: form.event_id || null,
      sponsor_id: form.sponsor_id || null,
      opportunity_id: form.opportunity_id || null,
      position: items.length,
    });
    if (error) return toast.error(error.message);
    toast.success("Item adicionado");
    setOpen(false);
    setForm({ title: "", description: "", assignee: "", due_date: "", delivery_id: "", event_id: "", sponsor_id: "", opportunity_id: "" });
    load();
  };

  const setStatus = async (item: ChecklistItem, status: ChecklistItem["status"]) => {
    const { error } = await (supabase as any)
      .from("property_checklist_items")
      .update({ status })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    if (status === "concluido" && item.delivery_id) {
      toast.success("Item concluído · entrega vinculada marcada como entregue");
    } else {
      toast.success("Status atualizado");
    }
    load();
  };

  const updateDueDate = async (item: ChecklistItem, next: string | null) => {
    const { error } = await (supabase as any)
      .from("property_checklist_items")
      .update({ due_date: next })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, due_date: next } : i)));
    toast.success("Data atualizada");
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este item?")) return;
    const { error } = await (supabase as any)
      .from("property_checklist_items")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Item removido");
    load();
  };

  const completed = items.filter((i) => i.status === "concluido").length;
  const pct = items.length > 0 ? (completed / items.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-muted-foreground mb-1">
            Tarefas operacionais. Concluir um item vinculado a uma entrega marca a entrega como
            entregue automaticamente.
          </p>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <Progress value={pct} className="h-1.5 flex-1 max-w-xs" />
              <span className="text-xs text-muted-foreground">
                {completed}/{items.length} concluído(s)
              </span>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova tarefa
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma tarefa. Crie itens e vincule a entregas existentes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const delivery = deliveries.find((d) => d.id === it.delivery_id);
            const event = events.find((ev) => ev.id === it.event_id);
            const opportunity = opportunities.find(
              (o) => o.id === (it.opportunity_id ?? delivery?.opportunity_id ?? "")
            );
            const sponsorId =
              it.sponsor_id ?? opportunity?.sponsor_id ?? delivery?.sponsor_id ?? null;
            const sponsorName =
              sponsors.find((sp) => sp.id === sponsorId)?.name ?? delivery?.brand ?? null;
            const overdue =
              it.due_date && it.status !== "concluido" && new Date(it.due_date) < new Date();
            return (
              <Card key={it.id} className={it.status === "concluido" ? "opacity-70" : ""}>
                <CardContent className="p-3 flex items-start gap-3">
                  <button
                    onClick={() =>
                      setStatus(it, it.status === "concluido" ? "pendente" : "concluido")
                    }
                    className="mt-0.5 shrink-0"
                    aria-label="Alternar conclusão"
                  >
                    {it.status === "concluido" ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`font-medium text-sm ${
                          it.status === "concluido" ? "line-through text-muted-foreground" : ""
                        }`}
                      >
                        {it.title}
                      </p>
                      <Badge variant="outline" className={STATUS_LABELS[it.status].color}>
                        {STATUS_LABELS[it.status].label}
                      </Badge>
                      {overdue && (
                        <Badge variant="destructive" className="text-[10px]">
                          Atrasada
                        </Badge>
                      )}
                      <TaskInsightsButton taskId={it.id} source="checklist" />
                    </div>

                    {it.description && (
                      <p className="text-xs text-muted-foreground mt-1">{it.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {it.assignee && (
                        <span className="flex items-center gap-1">
                          <UserIcon className="h-3 w-3" />
                          {it.assignee}
                        </span>
                      )}
                      <DueDateEditor
                        value={it.due_date}
                        onSave={async (next) => { await updateDueDate(it, next); }}
                      />
                      {delivery && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {delivery.title} · {delivery.brand}
                        </span>
                      )}
                      {event && (
                        <span>📅 {event.title}</span>
                      )}
                    </div>
                    <ActivityContextLinks
                      sponsorId={sponsorId}
                      sponsorName={sponsorName}
                      opportunityId={opportunity?.id ?? it.opportunity_id ?? null}
                      opportunityLabel={opportunity?.brand ?? null}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Select
                      value={it.status}
                      onValueChange={(v) => setStatus(it, v as ChecklistItem["status"])}
                    >
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_andamento">Em andamento</SelectItem>
                        <SelectItem value="concluido">Concluído</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(it.id)}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa do checklist</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Input
                  maxLength={100}
                  value={form.assignee}
                  onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vincular a uma entrega</Label>
              <Select
                value={form.delivery_id || "none"}
                onValueChange={(v) => setForm({ ...form, delivery_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {deliveries.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.title} · {d.brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Concluir esta tarefa marcará a entrega como entregue.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Patrocinador</Label>
                <Select
                  value={form.sponsor_id || "none"}
                  onValueChange={(v) => setForm({ ...form, sponsor_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {sponsors.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Oportunidade</Label>
                <Select
                  value={form.opportunity_id || "none"}
                  onValueChange={(v) => {
                    const opp = opportunities.find((o) => o.id === v);
                    setForm({
                      ...form,
                      opportunity_id: v === "none" ? "" : v,
                      sponsor_id: opp?.sponsor_id || form.sponsor_id,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {opportunities
                      .filter((o) => !form.sponsor_id || o.sponsor_id === form.sponsor_id)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.brand}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Vincular a um evento</Label>
              <Select
                value={form.event_id || "none"}
                onValueChange={(v) => setForm({ ...form, event_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>
                      {ev.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Adicionar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
