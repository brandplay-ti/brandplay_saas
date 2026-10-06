import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Upload as TusUpload } from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaymentScheduleFields } from "@/components/contracts/PaymentScheduleFields";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus,
  FileSignature,
  Trash2,
  Search,
  Upload,
  Download,
  FileText,
  Calendar as CalendarIcon,
  Building2,
  X,
  Pencil,
  Eye,
  Sparkles,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { ContractFileViewer } from "@/components/contracts/ContractFileViewer";
import { ContractAISummary } from "@/components/contracts/ContractAISummary";
import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import { AssetCatalogToolbar, filterAndSortAssets, type AssetSortBy } from "@/components/assets/AssetCatalogToolbar";
import { buildContractClauses, CONTRACT_SECTION_TITLES } from "@/lib/contractClauseTemplates";
import { generateContractDocx, downloadBlob } from "@/lib/contractDocx";

import { Switch } from "@/components/ui/switch";

type Status = Database["public"]["Enums"]["contract_status"];
type PayMethod = Database["public"]["Enums"]["payment_method"];

type Contract = {
  id: string;
  organization_id: string | null;
  contract_number: string | null;
  brand: string;
  title: string;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  status: Status;
  payment_method: PayMethod;
  installments: number;
  due_day: number | null;
  due_days?: number | null;
  custom_due_dates?: string[] | null;
  sponsor_id?: string | null;

  signatories: string | null;
  notes: string | null;
  property_id: string | null;
  opportunity_id: string | null;
  file_path: string | null;
  file_name: string | null;
  use_flat_value?: boolean | null;
  flat_value?: number | null;
  owner_id: string;
  ai_summary: string | null;
};

type Clause = { id: string; contract_id: string; title: string; content: string | null; position: number };
type AssetItem = { id: string; contract_id: string; asset_id?: string | null; name: string; quantity: number; unit_value: number; notes: string | null };
type Property = { id: string; name: string };
type Opportunity = { id: string; brand: string };

const STATUS_META: Record<Status, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
  em_assinatura: { label: "Em assinatura", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  ativo: { label: "Ativo", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  vencendo: { label: "Vencendo", className: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  encerrado: { label: "Encerrado", className: "bg-slate-500/15 text-slate-700 border-slate-500/30" },
  cancelado: { label: "Cancelado", className: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
};

const PAY_LABELS: Record<PayMethod, string> = {
  a_vista: "À vista",
  parcelado: "Parcelado",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  personalizado: "Personalizado",
};


const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

// Auto-detecta vencendo (próximos 30 dias) e encerrado
const computeAutoStatus = (c: Contract): Status => {
  if (c.status === "rascunho" || c.status === "em_assinatura" || c.status === "cancelado") return c.status;
  if (!c.end_date) return c.status;
  const end = new Date(c.end_date + "T23:59:59");
  const now = new Date();
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "encerrado";
  if (diffDays <= 30) return "vencendo";
  return "ativo";
};

export default function Contracts() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [form, setForm] = useState({
    contract_number: "",
    title: "",
    brand: "",
    total_value: "",
    start_date: "",
    end_date: "",
    status: "rascunho" as Status,
    payment_method: "a_vista" as PayMethod,
    installments: "1",
    due_day: "",
    due_days: "",
    custom_due_dates: [] as string[],

    signatories: "",
    notes: "",
    property_id: "none",
    opportunity_id: "none",
  });

  const fetchData = async () => {
    if (!orgId) {
      setContracts([]);
      setProperties([]);
      setOpportunities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: con }, { data: props }, { data: opps }] = await Promise.all([
      supabase.from("contracts").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("sports_properties").select("id, name").eq("organization_id", orgId).order("name"),
      supabase.from("opportunities").select("id, brand").eq("organization_id", orgId).order("brand"),
    ]);

    const list = (con as Contract[]) ?? [];
    // recomputa status automaticamente para Ativo/Vencendo/Encerrado
    const updates: { id: string; status: Status }[] = [];
    const computed = list.map((c) => {
      const newStatus = computeAutoStatus(c);
      if (newStatus !== c.status) updates.push({ id: c.id, status: newStatus });
      return { ...c, status: newStatus };
    });
    if (updates.length > 0) {
      await Promise.all(
        updates.map((u) => supabase.from("contracts").update({ status: u.status }).eq("id", u.id).eq("organization_id", orgId)),
      );
    }

    setContracts(computed);
    setProperties((props as Property[]) ?? []);
    setOpportunities((opps as Opportunity[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  useEffect(() => {
    const id = searchParams.get("contract");
    if (id && contracts.some((c) => c.id === id)) {
      setDetailId(id);
    }
  }, [searchParams, contracts]);

  const propertiesById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p.name])),
    [properties],
  );

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        (c.contract_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [contracts, search, statusFilter]);

  const totals = useMemo(() => {
    const ativos = contracts.filter((c) => c.status === "ativo" || c.status === "vencendo");
    return {
      ativos: ativos.length,
      mrr: ativos.reduce((s, c) => s + Number(c.total_value || 0), 0),
      vencendo: contracts.filter((c) => c.status === "vencendo").length,
    };
  }, [contracts]);

  const resetForm = () =>
    setForm({
      contract_number: "", title: "", brand: "", total_value: "",
      start_date: "", end_date: "", status: "rascunho", payment_method: "a_vista",
      installments: "1", due_day: "", due_days: "", custom_due_dates: [] as string[], signatories: "", notes: "",
      property_id: "none", opportunity_id: "none",
    });

  const handlePickOpportunity = async (oppId: string) => {
    setForm((f) => ({ ...f, opportunity_id: oppId }));
    if (oppId === "none" || !orgId) return;
    const { data } = await supabase.from("opportunities").select("*").eq("id", oppId).eq("organization_id", orgId).maybeSingle();
    if (data) {
      setForm((f) => ({
        ...f,
        brand: data.brand ?? f.brand,
        title: f.title || `Contrato - ${data.brand}`,
        total_value: f.total_value || String(data.value ?? ""),
        property_id: data.property_id ?? f.property_id,
        end_date: f.end_date || (data.expected_close_date ?? ""),
      }));
    }
  };

  const handleCreate = async () => {
    if (!user || !orgId) return;
    if (!form.title.trim() || !form.brand.trim()) {
      toast.error("Informe título e marca");
      return;
    }
    const { error } = await supabase.from("contracts").insert({
      owner_id: user.id,
      organization_id: orgId,
      contract_number: form.contract_number || null,
      title: form.title.trim(),
      brand: form.brand.trim(),
      total_value: Number(form.total_value) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      payment_method: form.payment_method,
      installments: Number(form.installments) || 1,
      due_day: form.due_day ? Number(form.due_day) : null,
      due_days: form.due_days ? Number(form.due_days) : null,
      custom_due_dates: form.custom_due_dates.filter(Boolean),
      signatories: form.signatories || null,

      notes: form.notes || null,
      property_id: form.property_id === "none" ? null : form.property_id,
      opportunity_id: form.opportunity_id === "none" ? null : form.opportunity_id,
    });
    if (error) {
      toast.error("Erro ao criar contrato");
      return;
    }
    toast.success("Contrato criado");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const c = contracts.find((x) => x.id === deleteId);
    if (c?.file_path) {
      await supabase.storage.from("contracts").remove([c.file_path]);
    }
    const { error } = await supabase.from("contracts").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Contrato removido");
    setDeleteId(null);
    setDetailId(null);
    fetchData();
  };

  const detail = contracts.find((c) => c.id === detailId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie contratos, cláusulas, ativos e arquivos assinados.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo contrato</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo contrato</DialogTitle>
              <DialogDescription>Cadastre um contrato manual ou a partir de uma oportunidade.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Origem (oportunidade)</Label>
                <Select value={form.opportunity_id} onValueChange={handlePickOpportunity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual (sem oportunidade)</SelectItem>
                    {opportunities.map((o) => (<SelectItem key={o.id} value={o.id}>{o.brand}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="num">Número</Label>
                  <Input id="num" value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} placeholder="CTR-2026-001" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brand">Marca *</Label>
                  <Input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Patrocínio master 2026" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="value">Valor total (R$)</Label>
                  <Input id="value" type="number" min="0" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="start">Início</Label>
                  <Input id="start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end">Fim</Label>
                  <Input id="end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_META) as Status[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Propriedade</Label>
                  <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Pagamento</Label>
                  <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as PayMethod })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PAY_LABELS) as PayMethod[]).map((p) => (
                        <SelectItem key={p} value={p}>{PAY_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inst">Parcelas</Label>
                  <Input id="inst" type="number" min="1" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="due">Dia venc.</Label>
                  <Input id="due" type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
                </div>
              </div>

              <PaymentScheduleFields
                dueDays={form.due_days}
                onDueDaysChange={(v) => setForm({ ...form, due_days: v })}
                dates={form.custom_due_dates}
                onDatesChange={(d) => setForm({ ...form, custom_due_dates: d })}
                startDate={form.start_date}
              />



              <div className="grid gap-2">
                <Label htmlFor="sig">Signatários</Label>
                <Input id="sig" value={form.signatories} onChange={(e) => setForm({ ...form, signatories: e.target.value })} placeholder="João Silva, Maria Santos" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Contratos ativos</p>
          <p className="text-2xl font-semibold mt-1">{totals.ativos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Receita contratada</p>
          <p className="text-2xl font-semibold mt-1">{formatBRL(totals.mrr)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Vencendo (30 dias)</p>
          <p className="text-2xl font-semibold mt-1 text-orange-600">{totals.vencendo}</p>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, marca ou número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.keys(STATUS_META) as Status[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando contratos...</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileSignature className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum contrato encontrado.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Propriedade</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetailId(c.id)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.contract_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{c.title}</TableCell>
                    <TableCell>{c.brand}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.property_id ? propertiesById[c.property_id] ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(c.start_date)} → {formatDate(c.end_date)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(Number(c.total_value))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_META[c.status].className}>
                        {STATUS_META[c.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ContractDetail
        contract={detail}
        propertiesById={propertiesById}
        properties={properties}
        opportunities={opportunities}
        onClose={() => {
          setDetailId(null);
          if (searchParams.has("contract")) {
            searchParams.delete("contract");
            setSearchParams(searchParams);
          }
        }}
        onChanged={fetchData}
        onDelete={(id) => setDeleteId(id)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Cláusulas, ativos vinculados e arquivo anexo serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContractDetail({
  contract,
  propertiesById,
  properties,
  opportunities,
  onClose,
  onChanged,
  onDelete,
}: {
  contract: Contract | null;
  propertiesById: Record<string, string>;
  properties: Property[];
  opportunities: Opportunity[];
  onClose: () => void;
  onChanged: () => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [signing, setSigning] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [newClause, setNewClause] = useState({ title: "", content: "" });
  const [newAsset, setNewAsset] = useState({ name: "", quantity: "1", unit_value: "" });
  const [assetSearch, setAssetSearch] = useState("");
  const [assetSort, setAssetSort] = useState<AssetSortBy>("category");
  const [assetCategoryFilter, setAssetCategoryFilter] = useState("all");
  const [assetCategories, setAssetCategories] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [hasTemplate, setHasTemplate] = useState(false);
  const [generatingClauses, setGeneratingClauses] = useState(false);
  const [confirmStructure, setConfirmStructure] = useState(false);
  const [editingClause, setEditingClause] = useState<{ id: string; title: string; content: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!contract) {
      setClauses([]);
      setAssets([]);
      return;
    }
    const load = async () => {
      const [{ data: cl }, { data: ass }] = await Promise.all([
        supabase.from("contract_clauses").select("*").eq("contract_id", contract.id).order("position"),
        supabase.from("contract_assets").select("*").eq("contract_id", contract.id).order("created_at"),
      ]);
      setClauses((cl as Clause[]) ?? []);
      if (contract.organization_id) {
        const { count } = await supabase
          .from("contract_clause_templates")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", contract.organization_id);
        setHasTemplate((count ?? 0) > 0);
      } else {
        setHasTemplate(false);
      }
      const list = (ass as AssetItem[]) ?? [];
      setAssets(list);
      const ids = Array.from(new Set(list.map((a) => a.asset_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: cat } = await supabase.from("assets").select("id,category").in("id", ids);
        const map: Record<string, string> = {};
        (cat ?? []).forEach((c: any) => { if (c.category) map[c.id] = c.category; });
        setAssetCategories(map);
      } else {
        setAssetCategories({});
      }

      // Sincroniza automaticamente a cláusula de dados cadastrais com o cadastro atual
      const registryClause = ((cl as Clause[]) ?? []).find((x) => x.title === CONTRACT_SECTION_TITLES[0]);
      if (registryClause) {
        const [{ data: sponsor }, { data: organization }] = await Promise.all([
          contract.sponsor_id
            ? supabase
                .from("sponsors")
                .select("name, legal_name, trade_name, tax_id, address, address_city, address_state, zip_code")
                .eq("id", contract.sponsor_id)
                .maybeSingle()
            : Promise.resolve({ data: null } as any),
          contract.organization_id
            ? supabase.from("organizations").select("*").eq("id", contract.organization_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        const fresh = buildContractClauses({
          sponsor: sponsor as any,
          organization: organization as any,
          contract: {
            title: contract.title,
            contract_number: contract.contract_number,
            brand: contract.brand,
            start_date: contract.start_date,
            end_date: contract.end_date,
          },
        })[0];
        if (fresh && fresh.content && fresh.content !== registryClause.content) {
          await supabase.from("contract_clauses").update({ content: fresh.content }).eq("id", registryClause.id);
          setClauses((prev) => prev.map((x) => (x.id === registryClause.id ? { ...x, content: fresh.content } : x)));
        }
      }
    };
    load();
  }, [contract?.id]);

  if (!contract) return null;

  const updateStatus = async (status: Status) => {
    const { error } = await supabase.from("contracts").update({ status }).eq("id", contract.id);
    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    toast.success("Status atualizado");
    onChanged();
  };

  const markAsSigned = async () => {
    if (contract.status === "ativo") return;
    if (assets.length === 0) {
      toast.error("Adicione ao menos um ativo antes de marcar como assinado.");
      return;
    }
    setSigning(true);
    const { error } = await supabase.from("contracts").update({ status: "ativo" as Status }).eq("id", contract.id);
    if (error) {
      setSigning(false);
      toast.error("Erro ao marcar contrato como assinado");
      return;
    }
    const { count } = await supabase
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contract.id);
    setSigning(false);
    toast.success("Contrato assinado", {
      description: `${count ?? 0} entrega(s) geradas a partir dos ativos do contrato.`,
      action: { label: "Ver entregas", onClick: () => navigate("/dashboard/entregas") },
    });
    onChanged();
  };



  const addClause = async () => {
    if (!newClause.title.trim()) return;
    const { error } = await supabase.from("contract_clauses").insert({
      contract_id: contract.id,
      organization_id: contract.organization_id,
      title: newClause.title.trim(),
      content: newClause.content || null,
      position: clauses.length,
    });
    if (error) {
      toast.error("Erro ao adicionar cláusula");
      return;
    }
    setNewClause({ title: "", content: "" });
    const { data } = await supabase.from("contract_clauses").select("*").eq("contract_id", contract.id).order("position");
    setClauses((data as Clause[]) ?? []);
  };

  const deleteClause = async (id: string) => {
    await supabase.from("contract_clauses").delete().eq("id", id);
    setClauses((prev) => prev.filter((c) => c.id !== id));
  };

  const saveClauseEdit = async () => {
    if (!editingClause) return;
    const { error } = await supabase
      .from("contract_clauses")
      .update({ title: editingClause.title.trim(), content: editingClause.content || null })
      .eq("id", editingClause.id);
    if (error) {
      toast.error("Erro ao salvar cláusula");
      return;
    }
    setClauses((prev) =>
      prev.map((c) => (c.id === editingClause.id ? { ...c, title: editingClause.title.trim(), content: editingClause.content } : c)),
    );
    setEditingClause(null);
    toast.success("Cláusula atualizada");
  };

  const saveAsDefaultTemplate = async () => {
    if (!contract.organization_id || !clauses.length) return;
    setSavingTemplate(true);
    try {
      await supabase.from("contract_clause_templates").delete().eq("organization_id", contract.organization_id);
      const { error } = await supabase.from("contract_clause_templates").insert(
        clauses.map((c, i) => ({
          organization_id: contract.organization_id,
          title: c.title,
          content: c.content,
          position: i,
        })),
      );
      if (error) throw error;
      setHasTemplate(true);
      toast.success("Padrão da organização atualizado");
    } catch {
      toast.error("Erro ao salvar o padrão");
    } finally {
      setSavingTemplate(false);
    }
  };


  const generateStructure = async () => {
    setGeneratingClauses(true);
    try {
      const [{ data: sponsor }, { data: organization }] = await Promise.all([
        contract.sponsor_id
          ? supabase
              .from("sponsors")
              .select("name, legal_name, trade_name, tax_id, address, address_city, address_state, zip_code")
              .eq("id", contract.sponsor_id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        contract.organization_id
          ? supabase.from("organizations").select("*").eq("id", contract.organization_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

      const built = buildContractClauses({
        sponsor: sponsor as any,
        organization: organization as any,
        contract: {
          title: contract.title,
          contract_number: contract.contract_number,
          brand: contract.brand,
          total_value: Number(contract.total_value ?? 0),
          flat_value: Number(contract.flat_value ?? 0),
          use_flat_value: contract.use_flat_value,
          start_date: contract.start_date,
          end_date: contract.end_date,
          payment_method_label: PAY_LABELS[contract.payment_method],
          installments: contract.installments,
          due_day: contract.due_day,
          due_days: contract.due_days,
          custom_due_dates: contract.custom_due_dates,
        },
        assets: assets.map((a) => ({
          name: a.name,
          quantity: Number(a.quantity),
          unit_value: Number(a.unit_value),
          notes: a.notes,
          category: a.asset_id ? assetCategories[a.asset_id] ?? null : null,
        })),
        propertyName: contract.property_id ? propertiesById[contract.property_id] : null,
      });

      // Se a organização tem um padrão salvo, ele define os textos; as seções
      // dinâmicas continuam sendo preenchidas automaticamente.
      const DYNAMIC_TITLES = new Set<string>([
        CONTRACT_SECTION_TITLES[0],
        CONTRACT_SECTION_TITLES[2],
        CONTRACT_SECTION_TITLES[5],
        CONTRACT_SECTION_TITLES[6],
      ]);
      let finalClauses = built;
      if (contract.organization_id) {
        const { data: tpl } = await supabase
          .from("contract_clause_templates")
          .select("title, content, position")
          .eq("organization_id", contract.organization_id)
          .order("position");
        if (tpl && tpl.length) {
          finalClauses = tpl.map((t: any) => ({
            title: t.title,
            content: DYNAMIC_TITLES.has(t.title)
              ? built.find((b) => b.title === t.title)?.content ?? t.content ?? ""
              : t.content ?? "",
          }));
        }
      }

      await supabase.from("contract_clauses").delete().eq("contract_id", contract.id);
      const { error } = await supabase.from("contract_clauses").insert(
        finalClauses.map((b, i) => ({
          contract_id: contract.id,
          organization_id: contract.organization_id,
          title: b.title,
          content: b.content,
          position: i,
        })),
      );
      if (error) throw error;
      const { data } = await supabase.from("contract_clauses").select("*").eq("contract_id", contract.id).order("position");
      setClauses((data as Clause[]) ?? []);
      toast.success("Estrutura do contrato gerada");
    } catch (e) {
      toast.error("Erro ao gerar estrutura do contrato");
    } finally {
      setGeneratingClauses(false);
      setConfirmStructure(false);
    }
  };


  const addAsset = async () => {
    if (!newAsset.name.trim()) return;
    const { error } = await supabase.from("contract_assets").insert({
      contract_id: contract.id,
      organization_id: contract.organization_id,
      name: newAsset.name.trim(),
      quantity: Number(newAsset.quantity) || 1,
      unit_value: Number(newAsset.unit_value) || 0,
    });
    if (error) {
      toast.error("Erro ao adicionar ativo");
      return;
    }
    setNewAsset({ name: "", quantity: "1", unit_value: "" });
    const { data } = await supabase.from("contract_assets").select("*").eq("contract_id", contract.id).order("created_at");
    setAssets((data as AssetItem[]) ?? []);
  };

  const deleteAsset = async (id: string) => {
    await supabase.from("contract_assets").delete().eq("id", id);
    setAssets((prev) => prev.filter((a) => a.id !== id));
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo deve ter até 20MB");
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${user.id}/${contract.id}-${Date.now()}.${ext}`;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Sessão inválida para upload");
      }

      const projectUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const storageUrl = projectUrl.replace(".supabase.co", ".storage.supabase.co");

      await new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(file, {
          endpoint: `${storageUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: "contracts",
            objectName: path,
            contentType: file.type || "application/pdf",
            cacheControl: "3600",
          },
          onError: reject,
          onSuccess: () => resolve(),
        });

        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          upload.start();
        }).catch(reject);
      });

      const { error: updErr } = await supabase
        .from("contracts")
        .update({ file_path: path, file_name: file.name })
        .eq("id", contract.id);

      if (updErr) {
        throw updErr;
      }

      toast.success("Arquivo enviado");
      onChanged();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Erro ao enviar arquivo: ${error instanceof Error ? error.message : "falha desconhecida"}`);
    } finally {
      setUploading(false);
    }
  };

  

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    const { data, error } = await supabase.functions.invoke("generate-contract-pdf", {
      body: { contract_id: contract.id },
    });
    setGeneratingPdf(false);
    if (error || !data?.pdf_path) {
      toast.error(`Erro ao gerar PDF: ${error?.message ?? "falha desconhecida"}`);
      return;
    }
    const { data: signed } = await supabase.storage.from("contracts").createSignedUrl(data.pdf_path, 60);
    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
    toast.success("Contrato em PDF gerado");
  };

  const handleGenerateDocx = async () => {
    if (!clauses.length) {
      toast.error("Gere a estrutura de cláusulas antes de exportar o documento");
      return;
    }
    setGeneratingDocx(true);
    try {
      const blob = await generateContractDocx({
        title: contract.title,
        contractNumber: contract.contract_number,
        brand: contract.brand,
        clauses: clauses.map((c) => ({ title: c.title, content: c.content })),
      });
      const safe = (contract.contract_number || contract.title || "contrato").replace(/[^\w\-]+/g, "_");
      downloadBlob(blob, `${safe}.docx`);
      toast.success("Documento Word gerado");
    } catch {
      toast.error("Erro ao gerar documento Word");
    } finally {
      setGeneratingDocx(false);
    }
  };

  const handleDownload = async () => {
    if (!contract.file_path) return;
    const { data, error } = await supabase.storage.from("contracts").createSignedUrl(contract.file_path, 60);
    if (error || !data) {
      toast.error("Erro ao gerar link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleRemoveFile = async () => {
    if (!contract.file_path) return;
    await supabase.storage.from("contracts").remove([contract.file_path]);
    await supabase.from("contracts").update({ file_path: null, file_name: null }).eq("id", contract.id);
    toast.success("Arquivo removido");
    onChanged();
  };

  const catOf = (a: AssetItem) =>
    (a.asset_id ? assetCategories[a.asset_id] : "")?.trim() || (a.asset_id ? "Sem categoria" : "Itens livres");
  const contractAssetCategories = Array.from(new Set(assets.map(catOf))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const visibleContractAssets = filterAndSortAssets(
    assets.map((a) => ({ ...a, category: catOf(a) })),
    { search: assetSearch, sortBy: assetSort, categoryFilter: assetCategoryFilter },
  );
  const groupedContractAssets = (() => {
    const map = new Map<string, typeof visibleContractAssets>();
    visibleContractAssets.forEach((a) => {
      const c = a.category;
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(a);
    });
    const groups = Array.from(map.entries()).map(([category, list]) => ({ category, list }));
    return assetSort === "category_desc"
      ? groups.sort((a, b) => b.category.localeCompare(a.category, "pt-BR"))
      : groups.sort((a, b) => a.category.localeCompare(b.category, "pt-BR"));
  })();

  const useFlatContract = !!contract.use_flat_value;
  const assetsTotal = assets.reduce((s, a) => s + a.quantity * Number(a.unit_value || 0), 0);

  const toggleFlatValue = async (enabled: boolean) => {
    const value = enabled ? (Number(contract.flat_value) || Number(contract.total_value) || assetsTotal) : assetsTotal;
    const { error } = await supabase
      .from("contracts")
      .update({ use_flat_value: enabled, flat_value: enabled ? value : 0, total_value: value })
      .eq("id", contract.id);
    if (error) { toast.error("Erro ao atualizar valor fechado"); return; }
    toast.success(enabled ? "Valor fechado ativado" : "Valor fechado desativado");
    onChanged();
  };

  const saveFlatValue = async (value: number) => {
    const { error } = await supabase
      .from("contracts")
      .update({ flat_value: value, total_value: value })
      .eq("id", contract.id);
    if (error) { toast.error("Erro ao salvar valor geral"); return; }
    toast.success("Valor geral atualizado");
    onChanged();
  };

  return (
    <Sheet open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate">{contract.title}</SheetTitle>
              <SheetDescription>
                {contract.contract_number && <span className="font-mono mr-2">{contract.contract_number}</span>}
                {contract.brand}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleGeneratePdf} disabled={generatingPdf}>
                <FileText className="h-3.5 w-3.5 mr-1" />
                {generatingPdf ? "Gerando..." : "Gerar PDF"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleGenerateDocx} disabled={generatingDocx}>
                <FileText className="h-3.5 w-3.5 mr-1" />
                {generatingDocx ? "Gerando..." : "Gerar Word"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />Editar
              </Button>
              <Badge variant="outline" className={STATUS_META[contract.status].className}>
                {STATUS_META[contract.status].label}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Quick info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Valor total" value={formatBRL(Number(contract.total_value))} />
            <Info label="Pagamento" value={`${PAY_LABELS[contract.payment_method]}${contract.installments > 1 ? ` (${contract.installments}x)` : ""}`} />
            <Info label="Início" value={formatDate(contract.start_date)} />
            <Info label="Fim" value={formatDate(contract.end_date)} />
            {contract.property_id && (
              <Info icon={<Building2 className="h-3 w-3" />} label="Propriedade" value={propertiesById[contract.property_id] ?? "—"} />
            )}
            {contract.due_day && <Info icon={<CalendarIcon className="h-3 w-3" />} label="Vencimento" value={`Dia ${contract.due_day}`} />}
          </div>

          {/* Assinatura + status */}
          <div className="space-y-3">
            {contract.status === "ativo" ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Contrato assinado — ativos enviados para Entregas.</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/dashboard/entregas")}>
                  Ver entregas
                </Button>
              </div>
            ) : (
              <Button onClick={markAsSigned} disabled={signing} className="w-full sm:w-auto">
                <PackageCheck className="h-4 w-4 mr-2" />
                {signing ? "Processando…" : "Marcar como assinado"}
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Mudar status:</Label>
              <Select value={contract.status} onValueChange={(v) => updateStatus(v as Status)}>
                <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


          <Tabs defaultValue="file">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="file">Arquivo</TabsTrigger>
              <TabsTrigger value="clauses">Cláusulas ({clauses.length})</TabsTrigger>
              <TabsTrigger value="assets">Ativos ({assets.length})</TabsTrigger>
              <TabsTrigger value="info">Detalhes</TabsTrigger>
              <TabsTrigger value="ia"><Sparkles className="h-3 w-3 mr-1" />IA</TabsTrigger>
            </TabsList>

            {/* Arquivo */}
            <TabsContent value="file" className="space-y-3 pt-4">
              {contract.file_path ? (
                <>
                  <Card className="p-4 flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{contract.file_name ?? "Contrato"}</p>
                      <p className="text-xs text-muted-foreground">Pré-visualização abaixo</p>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-1" />Ver
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-5xl">
                        <DialogHeader>
                          <DialogTitle className="truncate">{contract.file_name ?? "Contrato"}</DialogTitle>
                          <DialogDescription>Pré-visualização do arquivo</DialogDescription>
                        </DialogHeader>
                        <ContractFileViewer
                          filePath={contract.file_path}
                          fileName={contract.file_name}
                        />
                      </DialogContent>
                    </Dialog>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Sparkles className="h-4 w-4 mr-1" />Resumo
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Resumo por IA</DialogTitle>
                          <DialogDescription>Resumo executivo gerado a partir do contrato.</DialogDescription>
                        </DialogHeader>
                        <ContractAISummary
                          contractId={contract.id}
                          initialSummary={contract.ai_summary}
                          onSummaryUpdated={() => onChanged()}
                        />
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="outline" onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-1" />Baixar
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={handleRemoveFile}>
                      <X className="h-4 w-4" />
                    </Button>
                  </Card>
                </>
              ) : (
                <Card className="p-6 border-dashed text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">Anexe o PDF ou DOCX assinado</p>
                  <Button
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? "Enviando..." : "Selecionar arquivo"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf"
                    className="hidden"
                    onChange={handleUpload}
                  />
                </Card>
              )}
            </TabsContent>

            {/* Cláusulas */}
            <TabsContent value="clauses" className="space-y-3 pt-4">
              <Card className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Estrutura padrão do contrato</p>
                  <p className="text-xs text-muted-foreground">
                    Gera as 13 partes (dados cadastrais, objeto, ativos, obrigações, pagamento, vigência, rescisão, foro, assinaturas...) já preenchidas com os dados do patrocinador e da organização.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingTemplate || !clauses.length}
                    onClick={saveAsDefaultTemplate}
                  >
                    {savingTemplate ? "Salvando..." : "Salvar como padrão"}
                  </Button>
                  <Button
                    size="sm"
                    variant={clauses.length ? "outline" : "default"}
                    disabled={generatingClauses}
                    onClick={() => (clauses.length ? setConfirmStructure(true) : generateStructure())}
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    {generatingClauses ? "Gerando..." : clauses.length ? "Regerar" : "Gerar estrutura"}
                  </Button>
                </div>
              </Card>
              {hasTemplate && (
                <p className="text-xs text-muted-foreground">
                  Esta organização tem um padrão salvo — ele é usado ao gerar a estrutura (dados cadastrais, ativos, pagamento e vigência continuam sendo preenchidos automaticamente).
                </p>
              )}


              {clauses.map((cl) => (
                <Card key={cl.id} className="p-3">
                  {editingClause?.id === cl.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editingClause.title}
                        onChange={(e) => setEditingClause({ ...editingClause, title: e.target.value })}
                      />
                      <Textarea
                        rows={10}
                        value={editingClause.content}
                        onChange={(e) => setEditingClause({ ...editingClause, content: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveClauseEdit}>Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingClause(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm">{cl.title}</p>
                        {cl.content && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{cl.content}</p>}
                      </div>
                      <div className="flex shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingClause({ id: cl.id, title: cl.title, content: cl.content ?? "" })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteClause(cl.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}

              <AlertDialog open={confirmStructure} onOpenChange={setConfirmStructure}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Regerar estrutura padrão?</AlertDialogTitle>
                    <AlertDialogDescription>
                      As cláusulas atuais deste contrato serão substituídas pela estrutura padrão preenchida com os dados atuais.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={generateStructure}>Regerar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Card className="p-3 border-dashed space-y-2">
                <Input
                  placeholder="Título da cláusula (ex.: Exclusividade)"
                  value={newClause.title}
                  onChange={(e) => setNewClause({ ...newClause, title: e.target.value })}
                />
                <Textarea
                  placeholder="Conteúdo da cláusula..."
                  rows={2}
                  value={newClause.content}
                  onChange={(e) => setNewClause({ ...newClause, content: e.target.value })}
                />
                <Button size="sm" onClick={addClause} disabled={!newClause.title.trim()}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar cláusula
                </Button>
              </Card>
            </TabsContent>

            {/* Ativos */}
            <TabsContent value="assets" className="space-y-3 pt-4">
              <Card className="p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="text-sm">Valor geral (fechado)</Label>
                    <p className="text-xs text-muted-foreground">Ignora valores unitários e mostra apenas os ativos.</p>
                  </div>
                  <Switch checked={useFlatContract} onCheckedChange={toggleFlatValue} />
                </div>
                {useFlatContract && (
                  <Input
                    inputMode="decimal"
                    placeholder="Valor geral do contrato"
                    defaultValue={String(Number(contract.flat_value ?? contract.total_value ?? 0))}
                    onBlur={(e) => saveFlatValue(Number(e.target.value.replace(",", ".")) || 0)}
                  />
                )}
              </Card>

              <AssetCatalogToolbar
                search={assetSearch}
                onSearchChange={setAssetSearch}
                sortBy={assetSort}
                onSortChange={setAssetSort}
                categories={contractAssetCategories}
                categoryFilter={assetCategoryFilter}
                onCategoryChange={setAssetCategoryFilter}
                showValueSort={!useFlatContract}
              />
              {groupedContractAssets.map((group) => (
                <div key={group.category} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.category} <span className="font-normal">({group.list.length})</span>
                  </p>
                  {group.list.map((a) => (
                    <Card key={a.id} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {useFlatContract
                            ? `${a.quantity} un.`
                            : `${a.quantity}x · ${formatBRL(Number(a.unit_value))} = ${formatBRL(a.quantity * Number(a.unit_value))}`}
                        </p>
                        {a.notes && (
                          <p className="text-xs text-muted-foreground italic whitespace-pre-wrap mt-1">Obs.: {a.notes}</p>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAsset(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Card>
                  ))}
                </div>
              ))}
              {assets.length > 0 && (
                <div className="text-right text-sm font-semibold">
                  {useFlatContract
                    ? `Valor geral (fechado): ${formatBRL(Number(contract.flat_value ?? contract.total_value ?? 0))}`
                    : `Total dos ativos: ${formatBRL(assetsTotal)}`}
                </div>
              )}
              <Card className="p-3 border-dashed space-y-2">
                <Input
                  placeholder="Nome do ativo (ex.: Placa de campo)"
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                />
                <div className={useFlatContract ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
                  <Input
                    type="number" min="1"
                    placeholder="Qtd"
                    value={newAsset.quantity}
                    onChange={(e) => setNewAsset({ ...newAsset, quantity: e.target.value })}
                  />
                  {!useFlatContract && (
                    <Input
                      type="number" min="0"
                      placeholder="Valor unit."
                      value={newAsset.unit_value}
                      onChange={(e) => setNewAsset({ ...newAsset, unit_value: e.target.value })}
                    />
                  )}
                </div>

                <Button size="sm" onClick={addAsset} disabled={!newAsset.name.trim()}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar ativo
                </Button>
              </Card>
            </TabsContent>

            {/* Detalhes */}
            <TabsContent value="info" className="space-y-3 pt-4 text-sm">
              {contract.signatories && (
                <div>
                  <p className="text-xs text-muted-foreground">Signatários</p>
                  <p>{contract.signatories}</p>
                </div>
              )}
              {contract.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Observações</p>
                  <p className="whitespace-pre-wrap">{contract.notes}</p>
                </div>
              )}
              {!contract.signatories && !contract.notes && (
                <p className="text-muted-foreground">Sem informações adicionais.</p>
              )}
            </TabsContent>

            <TabsContent value="ia" className="pt-4">
              <NextStepsAI context="contract" targetId={contract.id} propertyId={contract.property_id} />
            </TabsContent>
          </Tabs>

          <div className="border-t pt-4 flex justify-between">
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(contract.id)}>
              <Trash2 className="h-4 w-4 mr-1" />Excluir contrato
            </Button>
          </div>
        </div>
      </SheetContent>
      <EditContractDialog
        contract={contract}
        open={editOpen}
        onOpenChange={setEditOpen}
        properties={properties}
        opportunities={opportunities}
        onSaved={() => {
          setEditOpen(false);
          onChanged();
        }}
      />
    </Sheet>
  );
}

function EditContractDialog({
  contract,
  open,
  onOpenChange,
  properties,
  opportunities,
  onSaved,
}: {
  contract: Contract;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  properties: Property[];
  opportunities: Opportunity[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    contract_number: contract.contract_number ?? "",
    title: contract.title,
    brand: contract.brand,
    total_value: String(contract.total_value ?? ""),
    start_date: contract.start_date ?? "",
    end_date: contract.end_date ?? "",
    status: contract.status,
    payment_method: contract.payment_method,
    installments: String(contract.installments ?? 1),
    due_day: contract.due_day ? String(contract.due_day) : "",
    due_days: contract.due_days ? String(contract.due_days) : "",
    custom_due_dates: (contract.custom_due_dates ?? []) as string[],
    signatories: contract.signatories ?? "",

    notes: contract.notes ?? "",
    property_id: contract.property_id ?? "none",
    opportunity_id: contract.opportunity_id ?? "none",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      contract_number: contract.contract_number ?? "",
      title: contract.title,
      brand: contract.brand,
      total_value: String(contract.total_value ?? ""),
      start_date: contract.start_date ?? "",
      end_date: contract.end_date ?? "",
      status: contract.status,
      payment_method: contract.payment_method,
      installments: String(contract.installments ?? 1),
      due_day: contract.due_day ? String(contract.due_day) : "",
      due_days: contract.due_days ? String(contract.due_days) : "",
      custom_due_dates: (contract.custom_due_dates ?? []) as string[],
      signatories: contract.signatories ?? "",

      notes: contract.notes ?? "",
      property_id: contract.property_id ?? "none",
      opportunity_id: contract.opportunity_id ?? "none",
    });
  }, [contract.id]);

  const handleSave = async () => {
    if (!form.title.trim() || !form.brand.trim()) {
      toast.error("Informe título e marca");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("contracts")
      .update({
        contract_number: form.contract_number || null,
        title: form.title.trim(),
        brand: form.brand.trim(),
        total_value: Number(form.total_value) || 0,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        payment_method: form.payment_method,
        installments: Number(form.installments) || 1,
        due_day: form.due_day ? Number(form.due_day) : null,
        due_days: form.due_days ? Number(form.due_days) : null,
        custom_due_dates: form.custom_due_dates.filter(Boolean),
        signatories: form.signatories || null,

        notes: form.notes || null,
        property_id: form.property_id === "none" ? null : form.property_id,
        opportunity_id: form.opportunity_id === "none" ? null : form.opportunity_id,
      })
      .eq("id", contract.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar alterações");
      return;
    }
    toast.success("Contrato atualizado");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar contrato</DialogTitle>
          <DialogDescription>Atualize qualquer informação do contrato.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Oportunidade vinculada</Label>
            <Select value={form.opportunity_id} onValueChange={(v) => setForm({ ...form, opportunity_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {opportunities.map((o) => (<SelectItem key={o.id} value={o.id}>{o.brand}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Número</Label>
              <Input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Marca *</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Valor (R$)</Label>
              <Input type="number" min="0" value={form.total_value} onChange={(e) => setForm({ ...form, total_value: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Início</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Fim</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_META) as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Propriedade</Label>
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Pagamento</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as PayMethod })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAY_LABELS) as PayMethod[]).map((p) => (
                    <SelectItem key={p} value={p}>{PAY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Parcelas</Label>
              <Input type="number" min="1" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Dia venc.</Label>
              <Input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} />
          </div>

          <PaymentScheduleFields
            dueDays={form.due_days}
            onDueDaysChange={(v) => setForm({ ...form, due_days: v })}
            dates={form.custom_due_dates}
            onDatesChange={(d) => setForm({ ...form, custom_due_dates: d })}
            startDate={form.start_date}
          />

          </div>

          <div className="grid gap-2">
            <Label>Signatários</Label>
            <Input value={form.signatories} onChange={(e) => setForm({ ...form, signatories: e.target.value })} />
          </div>

          <div className="grid gap-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
