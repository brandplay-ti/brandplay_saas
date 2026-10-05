import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, ListChecks, Briefcase, Users, CheckCircle2, Building2, Target } from "lucide-react";
import { toast } from "sonner";

import { DueDateEditor } from "@/components/common/DueDateEditor";
import { TaskInsightsButton } from "@/components/common/TaskInsightsButton";

const db = supabase as any;

type Source = "crm" | "atividade" | "checklist";

type CalItem = {
  id: string;
  source: Source;
  title: string;
  description: string | null;
  date: string; // yyyy-mm-dd
  done: boolean;
  link?: string;
  meta?: string | null;
  kind?: string | null;
  priority?: string | null;
  opportunity?: { id: string; label: string } | null;
  sponsor?: { id: string | null; name: string } | null;
  property?: string | null;
  time?: string | null;
};


const SOURCE_LABEL: Record<Source, string> = {
  crm: "Tarefa CRM",
  atividade: "Atividade",
  checklist: "Checklist",
};

const SOURCE_ICON = {
  crm: Users,
  atividade: Briefcase,
  checklist: ListChecks,
};

const SOURCE_CLS: Record<Source, string> = {
  crm: "bg-primary/15 text-primary border-primary/30",
  atividade: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  checklist: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CalendarPage = () => {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [items, setItems] = useState<CalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>(toKey(new Date()));
  const [filterSource, setFilterSource] = useState<string>("todos");
  const [showDone, setShowDone] = useState(false);

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const from = toKey(monthStart);
    const to = toKey(monthEnd);

    const [tasksRes, actRes, chkRes] = await Promise.all([
      db
        .from("crm_tasks")
        .select(
          "id,title,description,status,due_date,task_type,priority,sponsor_id,sponsors(name),opportunity_id,opportunities(id,brand,stage,value,sponsor_id,sponsors(name))",
        )
        .gte("due_date", from)
        .lte("due_date", to),
      db
        .from("opportunity_activities")
        .select(
          "id,title,description,status,due_date,activity_type,opportunity_id,opportunities(id,brand,stage,value,sponsor_id,sponsors(name))",
        )
        .gte("due_date", `${from}T00:00:00`)
        .lte("due_date", `${to}T23:59:59`),
      db
        .from("property_checklist_items")
        .select("id,title,description,status,due_date,property_id,sports_properties(name)")
        .gte("due_date", from)
        .lte("due_date", to),
    ]);

    const err = tasksRes.error || actRes.error || chkRes.error;
    if (err) toast.error("Erro ao carregar o calendário");

    const oppOf = (o: any) =>
      o ? { id: o.id as string, label: (o.brand as string) || "Oportunidade" } : null;
    const sponsorOf = (o: any, fallbackId?: string | null, fallbackName?: string | null) => {
      if (o?.sponsors?.name) return { id: o.sponsor_id ?? null, name: o.sponsors.name as string };
      if (fallbackName) return { id: fallbackId ?? null, name: fallbackName };
      return null;
    };

    const list: CalItem[] = [
      ...((tasksRes.data ?? []) as any[]).map((t) => ({
        id: `crm-${t.id}`,
        source: "crm" as const,
        title: t.title,
        description: t.description,
        date: String(t.due_date).slice(0, 10),
        done: t.status === "concluida",
        link: t.sponsor_id ? `/dashboard/patrocinadores/${t.sponsor_id}` : undefined,
        meta: t.sponsors?.name ?? null,
        kind: t.task_type ?? null,
        priority: t.priority ?? null,
        opportunity: oppOf(t.opportunities),
        sponsor: sponsorOf(t.opportunities, t.sponsor_id, t.sponsors?.name),
      })),
      ...((actRes.data ?? []) as any[]).map((a) => ({
        id: `act-${a.id}`,
        source: "atividade" as const,
        title: a.title,
        description: a.description,
        date: String(a.due_date).slice(0, 10),
        done: a.status === "concluida" || a.status === "concluido",
        link: "/dashboard/pipeline",
        meta: a.activity_type ?? null,
        kind: a.activity_type ?? null,
        opportunity: oppOf(a.opportunities),
        sponsor: sponsorOf(a.opportunities),
        time: String(a.due_date).includes("T") ? String(a.due_date).slice(11, 16) : null,
      })),
      ...((chkRes.data ?? []) as any[]).map((c) => ({
        id: `chk-${c.id}`,
        source: "checklist" as const,
        title: c.title,
        description: c.description,
        date: String(c.due_date).slice(0, 10),
        done: c.status === "concluido",
        link: c.property_id ? `/dashboard/propriedades/${c.property_id}` : undefined,
        meta: c.sports_properties?.name ?? null,
        property: c.sports_properties?.name ?? null,
      })),
    ].filter((i) => i.date && i.date !== "null");


    setItems(list);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cursor]);

  const visible = useMemo(
    () => items.filter((i) => (filterSource === "todos" || i.source === filterSource) && (showDone || !i.done)),
    [items, filterSource, showDone],
  );

  const byDay = useMemo(() => {
    const map: Record<string, CalItem[]> = {};
    visible.forEach((i) => {
      (map[i.date] ||= []).push(i);
    });
    return map;
  }, [visible]);

  const cells = useMemo(() => {
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay());
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [monthStart]);

  const todayKey = toKey(new Date());
  const selectedItems = byDay[selected] ?? [];
  const openCount = visible.filter((i) => !i.done).length;
  const lateCount = visible.filter((i) => !i.done && i.date < todayKey).length;

  const complete = async (item: CalItem) => {
    const rawId = item.id.split("-").slice(1).join("-");
    const table = item.source === "crm" ? "crm_tasks" : item.source === "atividade" ? "opportunity_activities" : "property_checklist_items";
    const status = item.source === "checklist" ? "concluido" : "concluida";
    const { error } = await db.from(table).update({ status, completed_at: new Date().toISOString() }).eq("id", rawId);
    if (error) return toast.error(error.message);
    toast.success("Concluído");
    setItems((cur) => cur.map((i) => (i.id === item.id ? { ...i, done: true } : i)));
  };

  const changeDate = async (item: CalItem, next: string | null) => {
    const rawId = item.id.split("-").slice(1).join("-");
    const table = item.source === "crm" ? "crm_tasks" : item.source === "atividade" ? "opportunity_activities" : "property_checklist_items";
    const value = next ? (item.source === "atividade" ? new Date(`${next}T12:00:00`).toISOString() : next) : null;
    const { error } = await db.from(table).update({ due_date: value }).eq("id", rawId);
    if (error) return toast.error(error.message);
    toast.success("Data atualizada");
    setItems((cur) =>
      next
        ? cur.map((i) => (i.id === item.id ? { ...i, date: next } : i))
        : cur.filter((i) => i.id !== item.id),
    );
    if (next) setSelected(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> Calendário
          </h1>
          <p className="text-sm text-muted-foreground">Todas as tarefas, atividades e checklists a fazer</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="crm">Tarefas CRM</SelectItem>
              <SelectItem value="atividade">Atividades</SelectItem>
              <SelectItem value="checklist">Checklists</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Itens no mês</p><p className="text-2xl font-bold">{visible.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-2xl font-bold">{openCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Atrasados</p><p className="text-2xl font-bold text-destructive">{lateCount}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base capitalize">
              {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(toKey(d)); }}>
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-80 w-full" />
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[11px] font-medium text-muted-foreground py-1">{w}</div>
                ))}
                {cells.map((d) => {
                  const key = toKey(d);
                  const inMonth = d.getMonth() === cursor.getMonth();
                  const dayItems = byDay[key] ?? [];
                  const late = dayItems.some((i) => !i.done && key < todayKey);
                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(key)}
                      className={`min-h-[72px] rounded-md border p-1 text-left transition-colors ${
                        selected === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      } ${inMonth ? "" : "opacity-40"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${key === todayKey ? "font-bold text-primary" : ""}`}>{d.getDate()}</span>
                        {dayItems.length > 0 && (
                          <span className={`text-[10px] rounded px-1 ${late ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                            {dayItems.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dayItems.slice(0, 2).map((i) => (
                          <p key={i.id} className={`truncate text-[10px] rounded px-1 border ${SOURCE_CLS[i.source]} ${i.done ? "line-through opacity-60" : ""}`}>
                            {i.title}
                          </p>
                        ))}
                        {dayItems.length > 2 && (
                          <p className="text-[10px] text-muted-foreground px-1">+{dayItems.length - 2}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {new Date(`${selected}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada agendado para este dia.</p>
            ) : (
              selectedItems.map((i) => {
                const Icon = SOURCE_ICON[i.source];
                return (
                  <div key={i.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${i.done ? "line-through text-muted-foreground" : ""}`}>{i.title}</p>
                        {i.description && <p className="text-xs text-muted-foreground line-clamp-3">{i.description}</p>}
                      </div>
                      {!i.done && (
                        <Button size="icon" variant="ghost" title="Concluir" onClick={() => complete(i)}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${SOURCE_CLS[i.source]}`}>
                        <Icon className="h-3 w-3" /> {SOURCE_LABEL[i.source]}
                      </Badge>
                      {i.kind && <Badge variant="secondary" className="text-[10px] capitalize">{i.kind}</Badge>}
                      {i.priority && <Badge variant="outline" className="text-[10px] capitalize">Prioridade {i.priority}</Badge>}
                      <DueDateEditor value={i.date} onSave={async (next) => { await changeDate(i, next); }} />
                      <TaskInsightsButton
                        taskId={i.id.split("-").slice(1).join("-")}
                        source={i.source === "crm" ? "crm_task" : i.source === "atividade" ? "activity" : "checklist"}
                      />
                      {i.time && <span className="text-[11px] text-muted-foreground">{i.time}</span>}
                      {!i.done && i.date < todayKey && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">Atrasado</Badge>
                      )}
                    </div>

                    <div className="space-y-1 border-t pt-2">
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3 shrink-0" />
                        {i.sponsor?.name ? (
                          i.sponsor.id ? (
                            <Link to={`/dashboard/patrocinadores/${i.sponsor.id}`} className="text-primary underline underline-offset-2 truncate">
                              {i.sponsor.name}
                            </Link>
                          ) : (
                            <span className="truncate">{i.sponsor.name}</span>
                          )
                        ) : (
                          <span>Sem patrocinador vinculado</span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3 shrink-0" />
                        {i.opportunity ? (
                          <Link to="/dashboard/pipeline" className="text-primary underline underline-offset-2 truncate">
                            {i.opportunity.label}
                          </Link>
                        ) : (
                          <span>Sem oportunidade vinculada</span>
                        )}
                      </p>
                      {i.property && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <ListChecks className="h-3 w-3 shrink-0" /> <span className="truncate">{i.property}</span>
                        </p>
                      )}
                    </div>

                    {i.link && (
                      <Link to={i.link} className="text-[11px] text-primary underline underline-offset-2">Abrir</Link>
                    )}
                  </div>

                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarPage;
