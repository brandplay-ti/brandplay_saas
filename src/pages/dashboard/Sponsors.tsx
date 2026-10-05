import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Plus, Search, LayoutGrid, Rows3, Download, Archive, ArchiveRestore, Merge, ArrowUpDown } from "lucide-react";
import { LogoFrame, logoFrameIconClass } from "@/components/LogoFrame";
import { SponsorProfileFields, emptySponsorProfile, sponsorProfileToPayload, type SponsorProfileValue } from "@/components/sponsors/SponsorProfileFields";
import {
  HEALTH_CLASS, HEALTH_LABEL, LIFECYCLE_CLASS, LIFECYCLE_LABEL, LIFECYCLE_ORDER,
  PRIORITY_LABEL, type Health, type Lifecycle, type Priority,
  formatBRL, formatDate, daysSince, toCsv, downloadCsv,
} from "@/lib/crmAccount";

const db = supabase as any;
const VIEW_KEY = "crm_sponsors_view_v1";

interface SponsorRow {
  id: string;
  name: string;
  trade_name: string | null;
  segment: string | null;
  logo_path: string | null;
  website: string | null;
  lifecycle: Lifecycle;
  priority: Priority;
  health: Health;
  account_owner_id: string | null;
  last_contact_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  archived_at: string | null;
  tags: string[] | null;
  openOpportunities: number;
  openValue: number;
  activeContracts: number;
  contractedValue: number;
  overdueInstallments: number;
  lateDeliveries: number;
}

type SortKey = "name" | "lifecycle" | "priority" | "openValue" | "contractedValue" | "last_contact_at";

const logoUrl = (p: string | null) =>
  p ? supabase.storage.from("sponsor-logos").getPublicUrl(p).data.publicUrl : null;

export default function Sponsors() {
  const { user } = useAuth();
  const { orgId, can, isAdmin } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(VIEW_KEY) || "{}"); } catch { return {}; }
  })();

  const [layout, setLayout] = useState<"table" | "cards">(stored.layout ?? "table");
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>(stored.lifecycleFilter ?? "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(stored.priorityFilter ?? "all");
  const [healthFilter, setHealthFilter] = useState<string>(stored.healthFilter ?? "all");
  const [ownerFilter, setOwnerFilter] = useState<string>(stored.ownerFilter ?? "all");
  const [showArchived, setShowArchived] = useState<boolean>(stored.showArchived ?? false);
  const [sortKey, setSortKey] = useState<SortKey>(stored.sortKey ?? "name");
  const [sortAsc, setSortAsc] = useState<boolean>(stored.sortAsc ?? true);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [form, setForm] = useState({ name: "", trade_name: "", segment: "", website: "", domain: "", priority: "B" as Priority, lifecycle: "prospect" as Lifecycle, notes: "" });
  const [profile, setProfile] = useState<SponsorProfileValue>(emptySponsorProfile());

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ layout, lifecycleFilter, priorityFilter, healthFilter, ownerFilter, showArchived, sortKey, sortAsc }));
  }, [layout, lifecycleFilter, priorityFilter, healthFilter, ownerFilter, showArchived, sortKey, sortAsc]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [sp, opps, contracts, inst, dels, mem] = await Promise.all([
      db.from("sponsors")
        .select("id,name,trade_name,segment,logo_path,website,lifecycle,priority,health,account_owner_id,last_contact_at,next_action,next_action_at,archived_at,tags")
        .eq("organization_id", orgId)
        .order("name"),
      db.from("opportunities").select("id,sponsor_id,stage,value").eq("organization_id", orgId).not("sponsor_id", "is", null),
      db.from("contracts").select("id,sponsor_id,status,total_value").eq("organization_id", orgId).not("sponsor_id", "is", null),
      db.from("installments").select("id,sponsor_id,status").not("sponsor_id", "is", null),
      db.from("deliveries").select("id,sponsor_id,status,due_date").eq("organization_id", orgId).not("sponsor_id", "is", null),
      supabase.from("organization_members").select("user_id, profiles:profiles(id, full_name)").eq("organization_id", orgId).eq("status", "ativo"),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const byId = new Map<string, SponsorRow>();
    ((sp.data ?? []) as any[]).forEach((s) => byId.set(s.id, {
      ...s,
      openOpportunities: 0, openValue: 0, activeContracts: 0, contractedValue: 0,
      overdueInstallments: 0, lateDeliveries: 0,
    }));

    ((opps.data ?? []) as any[]).forEach((o) => {
      const r = byId.get(o.sponsor_id); if (!r) return;
      if (o.stage !== "fechado" && o.stage !== "perdido") { r.openOpportunities += 1; r.openValue += Number(o.value ?? 0); }
    });
    ((contracts.data ?? []) as any[]).forEach((c) => {
      const r = byId.get(c.sponsor_id); if (!r) return;
      if (c.status === "ativo") { r.activeContracts += 1; r.contractedValue += Number(c.total_value ?? 0); }
    });
    ((inst.data ?? []) as any[]).forEach((i) => {
      const r = byId.get(i.sponsor_id); if (!r) return;
      if (i.status === "atrasado") r.overdueInstallments += 1;
    });
    ((dels.data ?? []) as any[]).forEach((d) => {
      const r = byId.get(d.sponsor_id); if (!r) return;
      if (d.status !== "aprovada" && d.status !== "entregue" && d.due_date && d.due_date < today) r.lateDeliveries += 1;
    });

    setRows(Array.from(byId.values()));
    setMembers(((mem.data ?? []) as any[]).map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name?.trim() || "Sem nome",
    })));
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!showArchived && r.archived_at) return false;
      if (showArchived && !r.archived_at) return false;
      if (lifecycleFilter !== "all" && r.lifecycle !== lifecycleFilter) return false;
      if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
      if (healthFilter !== "all" && r.health !== healthFilter) return false;
      if (ownerFilter !== "all" && r.account_owner_id !== ownerFilter) return false;
      if (term) {
        const hay = [r.name, r.trade_name, r.segment, r.website, (r.tags ?? []).join(" ")].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return list.sort((a, b) => {
      switch (sortKey) {
        case "openValue": return (a.openValue - b.openValue) * dir;
        case "contractedValue": return (a.contractedValue - b.contractedValue) * dir;
        case "lifecycle": return (LIFECYCLE_ORDER.indexOf(a.lifecycle) - LIFECYCLE_ORDER.indexOf(b.lifecycle)) * dir;
        case "priority": return a.priority.localeCompare(b.priority) * dir;
        case "last_contact_at": return ((a.last_contact_at ?? "") > (b.last_contact_at ?? "") ? 1 : -1) * dir;
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [rows, search, lifecycleFilter, priorityFilter, healthFilter, ownerFilter, showArchived, sortKey, sortAsc]);

  const kpis = useMemo(() => {
    const active = rows.filter((r) => !r.archived_at);
    return {
      total: active.length,
      clients: active.filter((r) => r.lifecycle === "cliente_ativo").length,
      openValue: active.reduce((s, r) => s + r.openValue, 0),
      contractedValue: active.reduce((s, r) => s + r.contractedValue, 0),
      atRisk: active.filter((r) => r.health === "risco" || r.overdueInstallments > 0 || r.lateDeliveries > 0).length,
      noNextAction: active.filter((r) => !r.next_action).length,
    };
  }, [rows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const create = async () => {
    if (!user || !orgId || !form.name.trim()) return;
    const { data, error } = await db.from("sponsors").insert({
      owner_id: user.id,
      organization_id: orgId,
      name: form.name.trim(),
      segment: form.segment.trim() || null,

      website: form.website.trim() || null,
      domain: form.domain.trim() || null,
      priority: form.priority,
      lifecycle: form.lifecycle,
      account_owner_id: user.id,
      notes: form.notes.trim() || null,
      ...sponsorProfileToPayload(profile),
      trade_name: profile.trade_name.trim() || form.trade_name.trim() || null,

    }).select("id").single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    await db.from("sponsor_crm_profiles").insert({
      sponsor_id: data.id, organization_id: orgId, owner_id: user.id,
      segment: form.segment.trim() || null, notes: form.notes.trim() || null,
    });
    toast({ title: "Conta criada" });
    setOpen(false);
    setForm({ name: "", trade_name: "", segment: "", website: "", domain: "", priority: "B", lifecycle: "prospect", notes: "" });
    setProfile(emptySponsorProfile());
    load();
  };


  const bulkUpdate = async (patch: Record<string, unknown>) => {
    if (selectedIds.length === 0) return;
    const { error } = await db.from("sponsors").update(patch).in("id", selectedIds);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Contas atualizadas", description: `${selectedIds.length} registro(s).` });
    setSelectedIds([]);
    load();
  };

  const bulkArchive = async (archive: boolean) => {
    for (const id of selectedIds) {
      const { error } = await db.rpc(archive ? "archive_sponsor" : "unarchive_sponsor",
        archive ? { _sponsor_id: id, _reason: "Arquivado em lote" } : { _sponsor_id: id });
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    toast({ title: archive ? "Contas arquivadas" : "Contas restauradas" });
    setSelectedIds([]);
    load();
  };

  const doMerge = async () => {
    if (!mergeTarget || selectedIds.length === 0) return;
    for (const id of selectedIds.filter((i) => i !== mergeTarget)) {
      const { error } = await db.rpc("merge_sponsors", { _target_id: mergeTarget, _duplicate_id: id });
      if (error) return toast({ title: "Erro ao mesclar", description: error.message, variant: "destructive" });
    }
    toast({ title: "Contas mescladas", description: "O histórico foi preservado e a duplicada foi arquivada." });
    setMergeOpen(false);
    setSelectedIds([]);
    load();
  };

  const exportCsv = () => {
    const data = filtered.map((r) => ({
      Conta: r.name,
      "Nome comercial": r.trade_name ?? "",
      Segmento: r.segment ?? "",
      "Ciclo de vida": LIFECYCLE_LABEL[r.lifecycle],
      Prioridade: r.priority,
      Saúde: HEALTH_LABEL[r.health],
      "Negociações abertas": r.openOpportunities,
      "Valor em negociação": r.openValue,
      "Contratos ativos": r.activeContracts,
      "Valor contratado": r.contractedValue,
      "Último contato": r.last_contact_at ?? "",
      "Próxima ação": r.next_action ?? "",
      "Parcelas em atraso": r.overdueInstallments,
      "Entregas atrasadas": r.lateDeliveries,
    }));
    downloadCsv(`patrocinadores-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data));
  };

  const allSelected = filtered.length > 0 && selectedIds.length === filtered.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Patrocinadores
          </h1>
          <p className="text-sm text-muted-foreground">Conta 360º: relacionamento, negociações, contratos, entregas e resultados.</p>
        </div>
        {can("crm") && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nova conta</Button>}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Contas ativas", value: String(kpis.total) },
          { label: "Clientes ativos", value: String(kpis.clients) },
          { label: "Em negociação", value: formatBRL(kpis.openValue) },
          { label: "Contratado", value: formatBRL(kpis.contractedValue) },
          { label: "Em risco", value: String(kpis.atRisk) },
          { label: "Sem próxima ação", value: String(kpis.noNextAction) },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold">{k.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <CardTitle className="text-base">{filtered.length} conta(s)</CardTitle>
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8 w-56" placeholder="Buscar conta, marca, segmento…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Ciclo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os ciclos</SelectItem>
                  {LIFECYCLE_ORDER.map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_LABEL[l]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Prioridade</SelectItem>
                  {(["A", "B", "C"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Saúde" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Saúde</SelectItem>
                  {(Object.keys(HEALTH_LABEL) as Health[]).map((h) => <SelectItem key={h} value={h}>{HEALTH_LABEL[h]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Responsável</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant={showArchived ? "default" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)}>
                <Archive className="h-4 w-4 mr-2" /> Arquivadas
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-2" /> CSV</Button>
              <Button variant="outline" size="icon" onClick={() => setLayout(layout === "table" ? "cards" : "table")} title="Alternar visualização">
                {layout === "table" ? <LayoutGrid className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
              <span className="text-sm">{selectedIds.length} selecionada(s)</span>
              <Select onValueChange={(v) => bulkUpdate({ lifecycle: v })}>
                <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Alterar ciclo" /></SelectTrigger>
                <SelectContent>{LIFECYCLE_ORDER.filter((l) => l !== "arquivado").map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_LABEL[l]}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={(v) => bulkUpdate({ priority: v })}>
                <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Prioridade" /></SelectTrigger>
                <SelectContent>{(["A", "B", "C"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
              <Select onValueChange={(v) => bulkUpdate({ account_owner_id: v })}>
                <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              {isAdmin && (
                <>
                  {showArchived ? (
                    <Button size="sm" variant="outline" onClick={() => bulkArchive(false)}><ArchiveRestore className="h-4 w-4 mr-2" /> Restaurar</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => bulkArchive(true)}><Archive className="h-4 w-4 mr-2" /> Arquivar</Button>
                  )}
                  <Button size="sm" variant="outline" disabled={selectedIds.length < 2} onClick={() => { setMergeTarget(selectedIds[0]); setMergeOpen(true); }}>
                    <Merge className="h-4 w-4 mr-2" /> Mesclar
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar</Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma conta encontrada com os filtros atuais.</p>
          ) : layout === "cards" ? (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => navigate(`/dashboard/patrocinadores/${s.id}`)} className="text-left rounded-lg border bg-card p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <LogoFrame src={logoUrl(s.logo_path)} alt={s.name} size="md" fallback={<Users className={`${logoFrameIconClass("md")} text-muted-foreground`} />} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium truncate">{s.name}</h3>
                        <Badge variant="outline" className={LIFECYCLE_CLASS[s.lifecycle]}>{LIFECYCLE_LABEL[s.lifecycle]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.segment ?? "—"}</p>
                      <p className="text-xs mt-2">{formatBRL(s.openValue)} em negociação · {s.activeContracts} contrato(s) ativo(s)</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">Próxima ação: {s.next_action ?? "não definida"}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={allSelected} onCheckedChange={(v) => setSelectedIds(v ? filtered.map((r) => r.id) : [])} />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>Conta <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("lifecycle")}>Ciclo</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("priority")}>Prio.</TableHead>
                    <TableHead>Saúde</TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("openValue")}>Em negociação</TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => toggleSort("contractedValue")}>Contratado</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("last_contact_at")}>Último contato</TableHead>
                    <TableHead>Próxima ação</TableHead>
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => {
                    const d = daysSince(s.last_contact_at);
                    return (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => navigate(`/dashboard/patrocinadores/${s.id}`)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(s.id)}
                            onCheckedChange={(v) => setSelectedIds((prev) => (v ? [...prev, s.id] : prev.filter((i) => i !== s.id)))}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <LogoFrame src={logoUrl(s.logo_path)} alt={s.name} size="sm" fallback={<Users className={`${logoFrameIconClass("sm")} text-muted-foreground`} />} />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{s.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.segment ?? "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className={LIFECYCLE_CLASS[s.lifecycle]}>{LIFECYCLE_LABEL[s.lifecycle]}</Badge></TableCell>
                        <TableCell>{s.priority}</TableCell>
                        <TableCell><Badge variant="outline" className={HEALTH_CLASS[s.health]}>{HEALTH_LABEL[s.health]}</Badge></TableCell>
                        <TableCell className="text-right">{formatBRL(s.openValue)}</TableCell>
                        <TableCell className="text-right">{formatBRL(s.contractedValue)}</TableCell>
                        <TableCell className="text-xs">{formatDate(s.last_contact_at)}{d !== null && <span className="text-muted-foreground"> ({d}d)</span>}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{s.next_action ?? <span className="text-muted-foreground">Não definida</span>}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {s.overdueInstallments > 0 && <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">{s.overdueInstallments} parcela(s)</Badge>}
                            {s.lateDeliveries > 0 && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600 border-amber-500/30">{s.lateDeliveries} entrega(s)</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova conta</DialogTitle><DialogDescription>Cadastre um patrocinador no CRM.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Razão social / nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome comercial</Label><Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} /></div>
              <div><Label>Segmento</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="Ex: Bebidas" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Ciclo de vida</Label>
                <Select value={form.lifecycle} onValueChange={(v: Lifecycle) => setForm({ ...form, lifecycle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LIFECYCLE_ORDER.filter((l) => l !== "arquivado").map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_LABEL[l]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v: Priority) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(["A", "B", "C"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
              <div><Label>Domínio</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="marca.com.br" /></div>
            </div>
            <div><Label>Notas internas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <SponsorProfileFields value={profile} onChange={setProfile} />
          </div>

          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create} disabled={!form.name.trim()}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar contas</DialogTitle>
            <DialogDescription>Escolha a conta que permanecerá. As demais serão arquivadas e todo o histórico será transferido — nada é excluído.</DialogDescription>
          </DialogHeader>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger><SelectValue placeholder="Conta principal" /></SelectTrigger>
            <SelectContent>
              {rows.filter((r) => selectedIds.includes(r.id)).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>Cancelar</Button>
            <Button onClick={doMerge} disabled={!mergeTarget}>Mesclar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
