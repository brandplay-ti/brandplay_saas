import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Mail,
  ShieldCheck,
  Search,
  Loader2,
  UserCheck,
  X,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Sponsor {
  id: string;
  name: string;
}
interface AccessRow {
  id: string;
  sponsor_id: string;
  user_id: string;
  status: string;
  created_at: string;
  sponsors: { name: string } | null;
  profiles: { full_name: string | null } | null;
}
interface InviteRow {
  id: string;
  sponsor_id: string;
  email: string;
  token: string;
  status: string;
  expires_at: string;
  sponsors: { name: string } | null;
}

export default function PortalAccess() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [selectedSponsor, setSelectedSponsor] = useState<string>("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [accesses, setAccesses] = useState<AccessRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [spRes, accRes, invRes] = await Promise.all([
      supabase.from("sponsors").select("id,name").order("name"),
      supabase
        .from("sponsor_portal_access")
        .select(
          "id,sponsor_id,user_id,status,created_at,sponsors(name),profiles(full_name)",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsor_invites")
        .select("id,sponsor_id,email,token,status,expires_at,sponsors(name)")
        .order("created_at", { ascending: false }),
    ]);
    setSponsors((spRes.data ?? []) as Sponsor[]);
    setAccesses((accRes.data ?? []) as any);
    setInvites((invRes.data ?? []) as any);
    if (!selectedSponsor && spRes.data && spRes.data.length > 0) {
      setSelectedSponsor(spRes.data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const callManage = async (
    action: "activate" | "invite" | "revoke",
    extra: Record<string, any> = {},
  ) => {
    if (!selectedSponsor && action !== "revoke") {
      throw new Error("Selecione um patrocinador");
    }
    const { data, error } = await supabase.functions.invoke(
      "manage-portal-access",
      {
        body: {
          action,
          sponsor_id: extra.sponsor_id ?? selectedSponsor,
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
    if (!email || !selectedSponsor) return;
    setActivating(true);
    try {
      const res = await callManage("activate", { email });
      toast.success(
        res?.email?.sent
          ? "Acesso ativado e e-mail enviado!"
          : "Acesso ativado.",
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
    if (!email || !selectedSponsor) return;
    setInviting(true);
    try {
      const res = await callManage("invite", { email });
      if (res?.invite_url) {
        await navigator.clipboard.writeText(res.invite_url).catch(() => {});
      }
      toast.success(
        res?.email?.sent
          ? "Convite enviado por e-mail."
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

  const revoke = async (a: AccessRow) => {
    if (!confirm(`Remover acesso de ${a.profiles?.full_name ?? "usuário"}?`))
      return;
    try {
      await callManage("revoke", {
        sponsor_id: a.sponsor_id,
        access_id: a.id,
      });
      toast.success("Acesso removido");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao remover");
    }
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/portal/login?invite=${token}`,
    );
    toast.success("Link copiado");
  };

  const filteredAccesses = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return accesses;
    return accesses.filter(
      (a) =>
        a.sponsors?.name?.toLowerCase().includes(s) ||
        a.profiles?.full_name?.toLowerCase().includes(s),
    );
  }, [accesses, search]);

  const filteredInvites = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return invites;
    return invites.filter(
      (i) =>
        i.email.toLowerCase().includes(s) ||
        i.sponsors?.name?.toLowerCase().includes(s),
    );
  }, [invites, search]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" /> Acessos ao Portal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Autorize patrocinadores a acessar entregas, contratos e relatórios.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autorizar novo acesso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Patrocinador</Label>
              <Select
                value={selectedSponsor}
                onValueChange={setSelectedSponsor}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {sponsors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">E-mail do usuário</Label>
              <Input
                type="email"
                placeholder="email@patrocinador.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={activate}
              disabled={
                !email || !selectedSponsor || activating || inviting
              }
              className="flex-1 sm:flex-none"
            >
              {activating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span className="ml-1.5">Ativar conta existente</span>
            </Button>
            <Button
              variant="outline"
              onClick={invite}
              disabled={
                !email || !selectedSponsor || activating || inviting
              }
              className="flex-1 sm:flex-none"
            >
              {inviting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span className="ml-1.5">Enviar convite</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Ativar</strong>: vincula direto se a pessoa já tem conta.{" "}
            <strong>Convidar</strong>: envia link para criar conta.
          </p>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filtrar por patrocinador, nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Acessos ativos ({filteredAccesses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filteredAccesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum acesso.</p>
          ) : (
            <div className="space-y-2">
              {filteredAccesses.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">
                        {a.profiles?.full_name ?? "Usuário"}
                      </p>
                      <Badge variant="secondary">{a.sponsors?.name}</Badge>
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Desde{" "}
                      {format(new Date(a.created_at), "dd MMM yyyy", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(a)}
                    aria-label="Remover"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Convites ({filteredInvites.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filteredInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum convite.</p>
          ) : (
            <div className="space-y-2">
              {filteredInvites.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between p-3 rounded-md border"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm truncate">{i.email}</p>
                      <Badge variant="secondary">{i.sponsors?.name}</Badge>
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
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Expira{" "}
                      {format(new Date(i.expires_at), "dd MMM yyyy", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  {i.status === "pendente" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLink(i.token)}
                    >
                      <Copy className="h-4 w-4 mr-1" /> Link
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
