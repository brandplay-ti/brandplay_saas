import { useEffect, useState } from "react";
import { Loader2, Mail, UserPlus, ShieldAlert, ShieldCheck, RotateCcw, UserCog, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";

type LogRow = {
  id: string;
  action: string;
  target_email: string | null;
  target_user_id: string | null;
  old_role: string | null;
  new_role: string | null;
  metadata: any;
  created_at: string;
  actor_id: string;
  actor?: { full_name: string | null } | null;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  comercial: "Comercial",
  operacional: "Operacional",
  financeiro: "Financeiro",
};

const ACTION_META: Record<string, { icon: any; label: string; color: string }> = {
  invite_sent: { icon: Mail, label: "Convite enviado", color: "text-primary" },
  invite_resent: { icon: RotateCcw, label: "Convite reenviado", color: "text-primary" },
  invite_revoked: { icon: ShieldAlert, label: "Convite revogado", color: "text-destructive" },
  member_created: { icon: UserPlus, label: "Membro adicionado", color: "text-primary" },
  role_changed: { icon: UserCog, label: "Papel alterado", color: "text-primary" },
  member_revoked: { icon: UserX, label: "Acesso revogado", color: "text-destructive" },
  member_reactivated: { icon: ShieldCheck, label: "Acesso reativado", color: "text-primary" },
};

export const TeamAuditLog = () => {
  const { orgId } = useOrganization();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("team_audit_log")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (data as any[]) ?? [];
      const actorIds = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean)));
      let actorMap: Record<string, { full_name: string | null }> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
        actorMap = Object.fromEntries((profs ?? []).map((p) => [p.id, { full_name: p.full_name }]));
      }
      setRows(list.map((r) => ({ ...r, actor: actorMap[r.actor_id] ?? null })));
      setLoading(false);
    })();
  }, [orgId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de auditoria</CardTitle>
        <CardDescription>
          Últimas {rows.length} ações realizadas na gestão de equipe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Nenhuma ação registrada ainda.
          </div>
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => {
              const meta = ACTION_META[r.action] ?? { icon: UserCog, label: r.action, color: "text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <li key={r.id} className="flex gap-3 pb-3 border-b border-border last:border-0">
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{meta.label}</span>
                      {r.target_email && (
                        <Badge variant="outline" className="text-xs font-normal">
                          {r.target_email}
                        </Badge>
                      )}
                      {r.action === "role_changed" && r.old_role && r.new_role && (
                        <Badge variant="secondary" className="text-xs font-normal">
                          {ROLE_LABEL[r.old_role] ?? r.old_role} → {ROLE_LABEL[r.new_role] ?? r.new_role}
                        </Badge>
                      )}
                      {r.action !== "role_changed" && r.new_role && (
                        <Badge variant="secondary" className="text-xs font-normal">
                          {ROLE_LABEL[r.new_role] ?? r.new_role}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      por {r.actor?.full_name || "—"} •{" "}
                      {new Date(r.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
