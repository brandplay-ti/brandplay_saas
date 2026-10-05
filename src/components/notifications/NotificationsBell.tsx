import { Bell, Check, CheckCheck, Trash2, RefreshCw, AlertTriangle, Clock, Truck, FileText, TrendingDown, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const ICON: Record<string, any> = {
  installment_due: Clock,
  installment_overdue: AlertTriangle,
  delivery_late: Truck,
  proposal_expiring: FileText,
  opportunity_stale: Target,
  opportunity_lost: AlertTriangle,
  opportunity_mention: Target,
  churn_risk: TrendingDown,
  task_due_soon: Clock,
  task_overdue: AlertTriangle,
};

const PRIORITY: Record<string, string> = {
  alta: "text-destructive",
  media: "text-amber-600",
  baixa: "text-muted-foreground",
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export function NotificationsBell() {
  const navigate = useNavigate();
  const { notifications, unread, loading, markAsRead, markAllRead, remove, checkNow } = useNotifications();

  const handleClick = async (n: any) => {
    if (!n.read_at) await markAsRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full text-[10px] leading-none flex items-center justify-center"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold text-sm">Notificações</div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={checkNow} disabled={loading} title="Verificar agora">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead} title="Marcar tudo como lido">
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[420px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Nenhuma notificação.
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={checkNow}>Verificar agora</Button>
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = ICON[n.category] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "p-3 hover:bg-muted/40 cursor-pointer flex gap-3 group",
                      !n.read_at && "bg-primary/5"
                    )}
                    onClick={() => handleClick(n)}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", PRIORITY[n.priority])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{n.title}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
