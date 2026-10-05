import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Copy,
  ShieldCheck,
  X,
  Loader2,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  sponsorId: string;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

interface Access {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

export function SponsorPortalAccess({ sponsorId }: Props) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [email, setEmail] = useState("");
  const [activating, setActivating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [invRes, accRes] = await Promise.all([
      supabase
        .from("sponsor_invites")
        .select("*")
        .eq("sponsor_id", sponsorId)
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsor_portal_access")
        .select("id,user_id,status,created_at,profiles(full_name)")
        .eq("sponsor_id", sponsorId)
        .order("created_at", { ascending: false }),
    ]);
    setInvites((invRes.data ?? []) as Invite[]);
    setAccesses((accRes.data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [sponsorId]);

  const callManage = async (
    action: "activate" | "invite" | "revoke",
    extra: Record<string, any> = {},
  ) => {
    const { data, error } = await supabase.functions.invoke(
      "manage-portal-access",
      {
        body: {
          action,
          sponsor_id: sponsorId,
          portal_url: window.location.origin,
          ...extra,
        },
      },
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.message ?? data.error);
    return data;
  };

  const activate = async () => {
    if (!email) return;
    setActivating(true);
    try {
      const res = await callManage("activate", { email });
      toast.success(
        res?.email?.sent
          ? "Acesso ativado e e-mail enviado!"
          : "Acesso ativado (e-mail não enviado).",
      );
      setEmail("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ativar");
    } finally {
      setActivating(false);
    }
  };

  const invite = async () => {
    if (!email) return;
    setInviting(true);
    try {
      const res = await callManage("invite", { email });
      if (res?.invite_url) {
        await navigator.clipboard.writeText(res.invite_url).catch(() => {});
      }
      toast.success(
        res?.email?.sent
          ? "Convite enviado por e-mail (link também copiado)."
          : "Convite gerado e link copiado.",
      );
      setEmail("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao convidar");
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = async (id: string) => {
    await supabase
      .from("sponsor_invites")
      .update({ status: "cancelado" })
      .eq("id", id);
    load();
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/portal/login?invite=${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const toggleAccess = async (a: Access) => {
    const newStatus = a.status === "ativo" ? "bloqueado" : "ativo";
    await supabase
      .from("sponsor_portal_access")
      .update({ status: newStatus })
      .eq("id", a.id);
    toast.success(
      newStatus === "ativo" ? "Acesso reativado" : "Acesso bloqueado",
    );
    load();
  };

  const removeAccess = async (id: string) => {
    if (!confirm("Remover acesso deste usuário ao portal?")) return;
    try {
      await callManage("revoke", { access_id: id });
      toast.success("Acesso removido");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao remover");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Acesso ao Portal do Patrocinador
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Use <strong>Ativar</strong> se o usuário já tem conta no sistema. Use{" "}
          <strong>Convidar</strong> para enviar um link de cadastro.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <Input
            type="email"
            placeholder="email@patrocinador.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={activate}
              disabled={!email || activating || inviting}
              className="flex-1 sm:flex-none"
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span className="ml-1.5">Ativar</span>
            </Button>
            <Button
              variant="outline"
              onClick={invite}
              disabled={!email || activating || inviting}
              className="flex-1 sm:flex-none"
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span className="ml-1.5">Convidar</span>
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : (
        <>
          {accesses.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">
                Usuários com acesso
              </Label>
              <div className="space-y-2 mt-1.5">
                {accesses.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-2.5 rounded border"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {a.profiles?.full_name ?? "Usuário"}
                        </p>
                        <Badge
                          variant="outline"
                          className={
                            a.status === "ativo"
                              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                              : "bg-muted"
                          }
                        >
                          {a.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Desde{" "}
                        {format(new Date(a.created_at), "dd MMM yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleAccess(a)}
                      >
                        {a.status === "ativo" ? "Bloquear" : "Reativar"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAccess(a.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Convites</Label>
              <div className="space-y-2 mt-1.5">
                {invites.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between p-2.5 rounded border"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm truncate">{i.email}</p>
                        <Badge
                          variant="outline"
                          className={
                            i.status === "pendente"
                              ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                              : i.status === "aceito"
                                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                                : "bg-muted"
                          }
                        >
                          {i.status === "aceito" && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          {i.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Expira{" "}
                        {format(new Date(i.expires_at), "dd MMM yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    {i.status === "pendente" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyLink(i.token)}
                        >
                          <Copy className="h-4 w-4 mr-1" /> Link
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => cancelInvite(i.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
