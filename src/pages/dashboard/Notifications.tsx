import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, Clock, ExternalLink, Filter, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  installment_due: "Parcela a vencer",
  installment_overdue: "Parcela atrasada",
  delivery_late: "Entrega atrasada",
  proposal_expiring: "Proposta expirando",
  opportunity_stale: "Oportunidade parada",
  opportunity_lost: "Oportunidade perdida",
  opportunity_mention: "Menção em oportunidade",
  churn_risk: "Risco de churn",
  task_due_soon: "Tarefa a vencer",
  task_overdue: "Tarefa atrasada",
};

const PRIORITY_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unread, loading, markAsRead, markAllRead, remove, checkNow } = useNotifications();
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const categories = useMemo(
    () => Array.from(new Set(notifications.map((notification) => notification.category))).sort(),
    [notifications],
  );

  const filtered = useMemo(() => notifications.filter((notification) => {
    if (typeFilter !== "all" && notification.category !== typeFilter) return false;
    if (statusFilter === "unread" && notification.read_at) return false;
    if (statusFilter === "read" && !notification.read_at) return false;
    return true;
  }), [notifications, typeFilter, statusFilter]);

  const openNotification = async (notification: typeof notifications[number]) => {
    if (!notification.read_at) await markAsRead(notification.id);
    if (notification.action_url) navigate(notification.action_url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">Visualize alertas internos e acompanhe o que ainda precisa de atenção.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={checkNow} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={unread === 0}>
            <CheckCheck className="h-4 w-4 mr-2" /> Marcar todas como lidas
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4 text-muted-foreground" /> Filtros
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[240px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>{CATEGORY_LABELS[category] ?? category}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="unread">Não lidas</SelectItem>
              <SelectItem value="read">Lidas</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="ml-auto">{filtered.length} resultado(s)</Badge>
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
            Nenhuma notificação encontrada.
          </Card>
        ) : filtered.map((notification) => (
          <Card key={notification.id} className={cn("p-4 transition-colors", !notification.read_at && "border-primary/40 bg-primary/5")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <button type="button" onClick={() => openNotification(notification)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={notification.read_at ? "outline" : "default"}>{notification.read_at ? "Lida" : "Não lida"}</Badge>
                  <Badge variant="secondary">{CATEGORY_LABELS[notification.category] ?? notification.category}</Badge>
                  <Badge variant="outline">Prioridade {PRIORITY_LABELS[notification.priority] ?? notification.priority}</Badge>
                </div>
                <h2 className="mt-3 text-base font-semibold leading-snug">{notification.title}</h2>
                {notification.description && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{notification.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(notification.created_at)}</span>
                  {notification.action_url && <span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Abrir item relacionado</span>}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2 md:justify-end">
                {!notification.read_at && (
                  <Button size="sm" variant="outline" onClick={() => markAsRead(notification.id)}>
                    <Check className="h-4 w-4 mr-2" /> Marcar como lida
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(notification.id)} aria-label="Excluir notificação">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}