import { useEffect, useState } from "react";
import { Loader2, Mail, UserPlus, Shield, Trash2, Copy, Check, RotateCcw, X, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization, type OrgRole } from "@/hooks/useOrganization";

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  comercial: "Comercial",
  operacional: "Operacional",
  financeiro: "Financeiro",
};

const ROLE_DESC: Record<OrgRole, string> = {
  owner: "Controle total da organização",
  admin: "Gerencia equipe e todos os módulos",
  comercial: "CRM, propostas, contratos e cotas",
  operacional: "Entregas, propriedades e ativos",
  financeiro: "Contratos, parcelas e relatórios",
};

const ROLE_OPTIONS: OrgRole[] = ["admin", "comercial", "operacional", "financeiro"];

type Member = {
  id: string;
  user_id: string;
  role: OrgRole;
  status: string;
  created_at: string;
  profile?: { full_name: string | null } | null;
  email?: string;
};

type Invite = {
  id: string;
  email: string;
  role: OrgRole;
  status: string;
  expires_at: string;
  token: string;
  created_at: string;
};

export const TeamManagement = () => {
  const { toast } = useToast();
  const { orgId, isAdmin, role: myRole, loading: orgLoading } = useOrganization();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("comercial");
  const [inviteOpen, setInviteOpen] = useState(false);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<OrgRole>("comercial");

  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const [m, i] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id, user_id, role, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("organization_invites")
        .select("id, email, role, status, expires_at, token, created_at")
        .eq("organization_id", orgId)
        .eq("status", "pendente")
        .order("created_at", { ascending: false }),
    ]);
    const rawMembers = (m.data as any[]) ?? [];
    const userIds = rawMembers.map((r) => r.user_id);
    let profileMap: Record<string, { full_name: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name }]));
    }
    setMembers(rawMembers.map((r) => ({ ...r, profile: profileMap[r.user_id] ?? null })));
    setInvites((i.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const callFn = async (payload: any) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-team-access", { body: payload });
    setBusy(false);
    if (error || data?.error) {
      toast({
        title: "Erro",
        description: error?.message || data?.error || "Falha na operação",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const ok = await callFn({
      action: "invite",
      email: inviteEmail.trim(),
      role: inviteRole,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Convite enviado" });
      setInviteEmail("");
      setInviteOpen(false);
      load();
    }
  };

  const handleCreate = async () => {
    if (!createEmail.trim() || createPassword.length < 6) {
      toast({ title: "Preencha e-mail e senha (mín. 6)", variant: "destructive" });
      return;
    }
    const ok = await callFn({
      action: "create_user",
      email: createEmail.trim(),
      password: createPassword,
      full_name: createName,
      role: createRole,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Usuário criado", description: "E-mail enviado com credenciais." });
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      setCreateOpen(false);
      load();
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: OrgRole) => {
    const ok = await callFn({
      action: "update_role",
      member_id: memberId,
      role: newRole,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Papel atualizado" });
      load();
    }
  };

  const handleRevoke = async (memberId: string) => {
    if (!confirm("Revogar acesso deste membro?")) return;
    const ok = await callFn({
      action: "revoke",
      member_id: memberId,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Acesso revogado" });
      load();
    }
  };

  const handleReactivate = async (memberId: string) => {
    const ok = await callFn({
      action: "reactivate",
      member_id: memberId,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Acesso reativado" });
      load();
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    const ok = await callFn({
      action: "resend_invite",
      invite_id: inviteId,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Convite reenviado" });
      load();
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Cancelar este convite?")) return;
    const ok = await callFn({
      action: "revoke_invite",
      invite_id: inviteId,
      organization_id: orgId,
    });
    if (ok) {
      toast({ title: "Convite cancelado" });
      load();
    }
  };

  const copyInviteLink = (token: string, email: string) => {
    const link = `${window.location.origin}/auth?invite=${token}&email=${encodeURIComponent(email)}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Apenas administradores podem gerenciar a equipe. Seu papel: <Badge variant="outline">{ROLE_LABEL[myRole!]}</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Membros da equipe</CardTitle>
            <CardDescription>{members.filter((m) => m.status === "ativo").length} membro(s) ativo(s)</CardDescription>
          </div>
          <div className="flex gap-2">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Mail className="h-4 w-4 mr-2" /> Enviar convite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar por e-mail</DialogTitle>
                  <DialogDescription>O membro receberá um link para criar a conta dele.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="membro@empresa.com"
                    />
                  </div>
                  <div>
                    <Label>Papel</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            <div>
                              <div>{ROLE_LABEL[r]}</div>
                              <div className="text-xs text-muted-foreground">{ROLE_DESC[r]}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleInvite} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Enviar convite
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" /> Criar conta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar conta de membro</DialogTitle>
                  <DialogDescription>Defina e-mail e senha temporária. O membro receberá por e-mail.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={createName} onChange={(e) => setCreateName(e.target.value)} />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
                  </div>
                  <div>
                    <Label>Senha temporária (mín. 6 caracteres)</Label>
                    <Input
                      type="text"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Ex: Bem-vindo123"
                    />
                  </div>
                  <div>
                    <Label>Papel</Label>
                    <Select value={createRole} onValueChange={(v) => setCreateRole(v as OrgRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar conta
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.profile?.full_name || "—"}</div>
                  </TableCell>
                  <TableCell>
                    {m.role === "owner" ? (
                      <Badge variant="secondary">{ROLE_LABEL.owner}</Badge>
                    ) : (
                      <Select
                        value={m.role}
                        onValueChange={(v) => handleUpdateRole(m.id, v as OrgRole)}
                        disabled={busy}
                      >
                        <SelectTrigger className="w-40 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "ativo" ? "outline" : "destructive"}>{m.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {m.role !== "owner" && m.status === "ativo" && (
                      <Button size="icon" variant="ghost" onClick={() => handleRevoke(m.id)} disabled={busy} title="Desativar acesso">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    {m.role !== "owner" && m.status !== "ativo" && (
                      <Button size="icon" variant="ghost" onClick={() => handleReactivate(m.id)} disabled={busy} title="Reativar acesso">
                        <RotateCcw className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
            <CardDescription>{invites.length} aguardando aceite</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead className="w-64 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABEL[i.role]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(i.expires_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => copyInviteLink(i.token, i.email)}>
                        {copiedToken === i.token ? (
                          <><Check className="h-3.5 w-3.5 mr-1" /> Copiado</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5 mr-1" /> Link</>
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleResendInvite(i.id)} disabled={busy}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reenviar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRevokeInvite(i.id)} disabled={busy}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
