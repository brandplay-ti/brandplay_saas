import { useEffect, useMemo, useState } from "react";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MissingInfoDialog, focusMissingField, type MissingInfoState } from "@/components/common/MissingInfoDialog";
import { Switch } from "@/components/ui/switch";
import { FileText, Plus, Search, Trash2, Send, FileDown, CheckCircle2, XCircle, RefreshCw, Briefcase, FileSignature, List, LayoutGrid, Rows3, Pencil, Lock, SlidersHorizontal } from "lucide-react";
import { GenerateProposalAIDialog, type GeneratedProposal } from "@/components/proposals/GenerateProposalAIDialog";
import { ProposalWizardDialog } from "@/components/proposals/ProposalWizardDialog";
import { ProposalVersionsEditor } from "@/components/proposals/ProposalVersionsEditor";
import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import { AssetCatalogToolbar, type AssetSortBy } from "@/components/assets/AssetCatalogToolbar";


type Status = "rascunho" | "enviada" | "aceita" | "recusada" | "expirada";
interface Proposal {
  id: string; title: string; proposal_number: string | null; brand: string | null;
  sponsor_id: string | null; property_id: string | null; total_value: number;
  status: Status; valid_until: string | null; message: string | null; pdf_path: string | null;
  converted_opportunity_id: string | null; converted_contract_id: string | null;
  use_flat_value?: boolean | null; flat_value?: number | null; created_at?: string | null;
}
interface Sponsor { id: string; name: string; }
interface Property { id: string; name: string; }
interface Funnel { id: string; name: string; is_default?: boolean | null; }
interface Asset { id: string; name: string; unit_value: number; category: string; is_exclusive?: boolean; }
interface Tier { id: string; name: string; value: number; property_id: string | null; }
interface Item { id: string; asset_id: string | null; name: string; description?: string | null; notes?: string | null; quantity: number; unit_value: number; position: number; }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatConversionValidationMessage = (missing: string[]) =>
  `Complete antes de converter: ${missing.join(", ")}.`;

const statusUI: Record<Status, { label: string; cls: string }> = {
  rascunho: { label: "Rascunho", cls: "bg-muted text-muted-foreground border-border" },
  enviada: { label: "Enviada", cls: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  aceita: { label: "Aceita", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  recusada: { label: "Recusada", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  expirada: { label: "Expirada", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
};

type ProposalTemplateKey = "initial" | "meeting_followup" | "renewal";

const PROPOSAL_TEMPLATES: Record<ProposalTemplateKey, { label: string; tone: string }> = {
  initial: { label: "Apresentação inicial", tone: "apresentar uma oportunidade de parceria" },
  meeting_followup: { label: "Pós-reunião", tone: "dar sequência à conversa e formalizar os próximos passos" },
  renewal: { label: "Renovação", tone: "renovar a parceria com novas entregas e objetivos" },
};

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const addDaysInput = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
};
const formatDateBR = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "prazo a definir";
const escapeHtml = (value: string | number) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));

export default function Proposals() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [funnelTarget, setFunnelTarget] = useState<Proposal | null>(null);
  const [funnelMandatory, setFunnelMandatory] = useState(false);
  const [funnelChoice, setFunnelChoice] = useState<string>("");
  const [sendingFunnel, setSendingFunnel] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sponsorFilter, setSponsorFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [validityFilter, setValidityFilter] = useState<"all" | "expired" | "7d" | "30d" | "none">("all");
  const [valueFilter, setValueFilter] = useState<"all" | "under10k" | "10k50k" | "50k100k" | "100kplus">("all");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "value_desc" | "value_asc" | "title" | "validity">("recent");
  const [showFilters, setShowFilters] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", brand: "", sponsor_id: "", property_id: "", valid_until: "", message: "" });
  const [templateKey, setTemplateKey] = useState<ProposalTemplateKey>("initial");

  const [selected, setSelected] = useState<Proposal | null>(null);
  const [detailTab, setDetailTab] = useState("items");
  const [missingInfo, setMissingInfo] = useState<MissingInfoState | null>(null);
  const [contractChoice, setContractChoice] = useState<{ open: boolean; contractId: string | null }>({ open: false, contractId: null });
  const [items, setItems] = useState<Item[]>([]);
  const [generating, setGenerating] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemOrigin, setItemOrigin] = useState<"all" | "catalog" | "custom">("all");
  const [itemSort, setItemSort] = useState<AssetSortBy | "position">("position");
  const [itemView, setItemView] = useState<"list" | "grid" | "compact">("list");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [itemCategoryFilter, setItemCategoryFilter] = useState("all");
  const [itemQtyFilter, setItemQtyFilter] = useState<"all" | "1" | "2plus" | "5plus" | "10plus">("all");
  const [itemValueFilter, setItemValueFilter] = useState<"all" | "under1k" | "1k5k" | "5k10k" | "10kplus">("all");
  const [itemExclusiveFilter, setItemExclusiveFilter] = useState<"all" | "only" | "none">("all");

  const load = async () => {
    if (!orgId) {
      setProposals([]);
      setSponsors([]);
      setProperties([]);
      setAssets([]);
      setTiers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: pr }, { data: sp }, { data: pp }, { data: as }, { data: tr }, { data: fn }] = await Promise.all([
      supabase.from("proposals").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("sponsors").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("sports_properties").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("assets").select("id,name,unit_value,category,is_exclusive").eq("organization_id", orgId).order("name"),
      supabase.from("sponsorship_tiers").select("id,name,value,property_id").eq("organization_id", orgId).order("value", { ascending: false }),
      supabase.from("pipeline_funnels" as any).select("id,name,is_default").eq("organization_id", orgId).order("name"),
    ]);
    setProposals((pr ?? []) as Proposal[]);
    setSponsors((sp ?? []) as Sponsor[]);
    setProperties((pp ?? []) as Property[]);
    setFunnels(((fn ?? []) as any[]) as Funnel[]);
    setAssets(((as ?? []) as any[]).map((a) => ({ ...a, unit_value: Number(a.unit_value) })));
    setTiers(((tr ?? []) as any[]).map((t) => ({ ...t, value: Number(t.value) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: proposals.length };
    proposals.forEach((p) => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return counts;
  }, [proposals]);

  const activeFilterCount = [
    statusFilter !== "all",
    sponsorFilter !== "all",
    propertyFilter !== "all",
    validityFilter !== "all",
    valueFilter !== "all",
    search.trim().length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setSponsorFilter("all");
    setPropertyFilter("all");
    setValidityFilter("all");
    setValueFilter("all");
    setSortBy("recent");
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysUntil = (date: string | null) => {
      if (!date) return null;
      const d = new Date(`${date}T00:00:00`);
      return Math.round((d.getTime() - today.getTime()) / 86400000);
    };

    const list = proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (sponsorFilter !== "all" && p.sponsor_id !== sponsorFilter) return false;
      if (propertyFilter !== "all" && p.property_id !== propertyFilter) return false;

      if (validityFilter !== "all") {
        const diff = daysUntil(p.valid_until);
        if (validityFilter === "none" && p.valid_until) return false;
        if (validityFilter === "expired" && (diff === null || diff >= 0)) return false;
        if (validityFilter === "7d" && (diff === null || diff < 0 || diff > 7)) return false;
        if (validityFilter === "30d" && (diff === null || diff < 0 || diff > 30)) return false;
      }

      const value = Number(p.total_value) || 0;
      if (valueFilter === "under10k" && value >= 10000) return false;
      if (valueFilter === "10k50k" && (value < 10000 || value >= 50000)) return false;
      if (valueFilter === "50k100k" && (value < 50000 || value >= 100000)) return false;
      if (valueFilter === "100kplus" && value < 100000) return false;

      if (term) {
        const sponsorName = sponsors.find((s) => s.id === p.sponsor_id)?.name ?? "";
        const propertyName = properties.find((pr) => pr.id === p.property_id)?.name ?? "";
        const haystack = [p.title, p.proposal_number, p.brand, sponsorName, propertyName, p.message]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "value_desc": return Number(b.total_value) - Number(a.total_value);
        case "value_asc": return Number(a.total_value) - Number(b.total_value);
        case "title": return a.title.localeCompare(b.title, "pt-BR");
        case "validity": return (a.valid_until ?? "9999-12-31").localeCompare(b.valid_until ?? "9999-12-31");
        case "oldest": return (a.created_at ?? "").localeCompare(b.created_at ?? "");
        default: return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }
    });
    return sorted;
  }, [proposals, search, statusFilter, sponsorFilter, propertyFilter, validityFilter, valueFilter, sortBy, sponsors, properties]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, p) => sum + (Number(p.total_value) || 0), 0),
    [filtered],
  );

  const fillFromTemplate = (key: ProposalTemplateKey = templateKey) => {
    const sponsor = sponsors.find((s) => s.id === form.sponsor_id);
    const property = properties.find((p) => p.id === form.property_id);
    const brand = form.brand.trim() || sponsor?.name || "Marca";
    const sponsorName = sponsor?.name || brand;
    const propertyName = property?.name || "propriedade selecionada";
    const validUntil = form.valid_until || addDaysInput(7);
    const template = PROPOSAL_TEMPLATES[key];
    const title = form.title.trim() || `Proposta ${propertyName} · ${brand}`;
    const message = [
      `Olá, ${sponsorName}.`,
      `Preparamos este rascunho para ${template.tone} entre ${brand} e ${propertyName}.`,
      `A proposta consolida os ativos e entregas recomendados para conectar a marca ao público da propriedade, com validade até ${formatDateBR(validUntil)}.`,
      "Fico à disposição para ajustar escopo, formatos e cronograma antes do envio final.",
    ].join("\n\n");
    setForm({ ...form, title, brand: form.brand || brand, valid_until: validUntil, message });
  };

  const create = async () => {
    if (!user || !orgId || !form.title) return;
    const { data, error } = await supabase.from("proposals").insert({
      owner_id: user.id, organization_id: orgId, title: form.title,
      brand: form.brand || null, sponsor_id: form.sponsor_id || null,
      property_id: form.property_id || null, valid_until: form.valid_until || null,
      message: form.message || null,
    }).select().single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    const sponsor = sponsors.find((s) => s.id === form.sponsor_id);
    const property = properties.find((p) => p.id === form.property_id);
    const brand = form.brand || sponsor?.name || "Marca";
    const template = PROPOSAL_TEMPLATES[templateKey];
    await supabase.from("proposal_versions").insert([
      {
        proposal_id: data.id,
        owner_id: user.id,
        channel: "email",
        title: `Proposta ${property?.name ?? "de patrocínio"} para ${brand}`,
        content: `<p>Olá, ${escapeHtml(sponsor?.name ?? brand)}.</p><p>${escapeHtml(form.message || `Segue rascunho da proposta para ${template.tone} com a ${property?.name ?? "propriedade selecionada"}.`)}</p><p>Prazo de validade: <strong>${escapeHtml(formatDateBR(form.valid_until || null))}</strong>.</p><p>Posso ajustar qualquer ponto antes do envio final.</p>`,
        metadata: { subject: `Proposta ${property?.name ?? "de patrocínio"} para ${brand}`, template: templateKey },
      },
      {
        proposal_id: data.id,
        owner_id: user.id,
        channel: "whatsapp",
        title: "WhatsApp",
        content: `Olá, ${sponsor?.name ?? brand}. Preparei a proposta ${property?.name ? `para ${property.name}` : "de patrocínio"}, válida até ${formatDateBR(form.valid_until || null)}. Posso te enviar agora para revisão?`,
        metadata: { template: templateKey },
      },
    ]);
    toast({ title: "Proposta criada" });
    setOpen(false);
    setForm({ title: "", brand: "", sponsor_id: "", property_id: "", valid_until: "", message: "" });
    setTemplateKey("initial");
    await load();
    if (data) openDetail(data as Proposal);
  };

  const openDetail = async (p: Proposal) => {
    setSelected(p);
    const { data } = await supabase.from("proposal_items").select("*").eq("proposal_id", p.id).order("position");
    setItems((data ?? []) as Item[]);
  };

  const itemsTotal = useMemo(() => items.reduce((s, i) => s + i.quantity * Number(i.unit_value), 0), [items]);
  const useFlat = !!selected?.use_flat_value;
  const flatValue = Number(selected?.flat_value ?? 0);
  const total = useFlat ? flatValue : itemsTotal;

  const itemCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const a = assets.find((x) => x.id === i.asset_id);
      if (a?.category) set.add(a.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, assets]);

  const visibleItems = useMemo(() => {
    let list = [...items];
    if (itemOrigin === "catalog") list = list.filter((i) => !!i.asset_id);
    if (itemOrigin === "custom") list = list.filter((i) => !i.asset_id);
    const q = itemSearch.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    if (itemCategoryFilter !== "all") {
      list = list.filter((i) => assets.find((x) => x.id === i.asset_id)?.category === itemCategoryFilter);
    }
    if (itemQtyFilter !== "all") {
      const min = { "1": 1, "2plus": 2, "5plus": 5, "10plus": 10 }[itemQtyFilter];
      if (min) list = list.filter((i) => i.quantity >= min);
    }
    if (itemValueFilter !== "all") {
      list = list.filter((i) => {
        const sub = i.quantity * Number(i.unit_value);
        switch (itemValueFilter) {
          case "under1k": return sub < 1000;
          case "1k5k": return sub >= 1000 && sub <= 5000;
          case "5k10k": return sub > 5000 && sub <= 10000;
          case "10kplus": return sub > 10000;
        }
        return true;
      });
    }
    if (itemExclusiveFilter !== "all") {
      list = list.filter((i) => {
        const a = assets.find((x) => x.id === i.asset_id);
        const isExclusive = !!a?.is_exclusive;
        return itemExclusiveFilter === "only" ? isExclusive : !isExclusive;
      });
    }
    list.sort((a, b) => {
      const av = a.quantity * Number(a.unit_value);
      const bv = b.quantity * Number(b.unit_value);
      const cat = (i: typeof a) => assets.find((x) => x.id === i.asset_id)?.category ?? "";
      switch (itemSort) {
        case "name_asc": return a.name.localeCompare(b.name, "pt-BR");
        case "name_desc": return b.name.localeCompare(a.name, "pt-BR");
        case "category": return cat(a).localeCompare(cat(b), "pt-BR") || a.name.localeCompare(b.name, "pt-BR");
        case "quantity_desc": return b.quantity - a.quantity;
        case "quantity_asc": return a.quantity - b.quantity;
        case "value_desc": return bv - av;
        case "value_asc": return av - bv;
        default: return a.position - b.position;
      }
    });

    return list;
  }, [items, itemOrigin, itemSearch, itemSort, itemCategoryFilter, itemQtyFilter, itemValueFilter, itemExclusiveFilter, assets]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, typeof visibleItems>();
    visibleItems.forEach((i) => {
      const a = assets.find((x) => x.id === i.asset_id);
      const cat = a?.category?.trim() || (i.asset_id ? "Sem categoria" : "Itens livres");
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(i);
    });
    return Array.from(map.entries())
      .map(([category, list]) => ({
        category,
        list,
        subtotal: list.reduce((s, i) => s + i.quantity * Number(i.unit_value), 0),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "pt-BR"));
  }, [visibleItems, assets]);


  const persistTotal = async (newTotal: number) => {
    if (!selected) return;
    await supabase.from("proposals").update({ total_value: newTotal }).eq("id", selected.id);
  };

  const setFlatMode = async (enabled: boolean) => {
    if (!selected) return;
    const value = enabled ? (Number(selected.flat_value) || itemsTotal) : 0;
    const next = { ...selected, use_flat_value: enabled, flat_value: value, total_value: enabled ? value : itemsTotal };
    setSelected(next);
    await supabase.from("proposals")
      .update({ use_flat_value: enabled, flat_value: value, total_value: next.total_value })
      .eq("id", selected.id);
    setProposals((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  };

  const saveFlatValue = async (value: number) => {
    if (!selected) return;
    const next = { ...selected, flat_value: value, total_value: value };
    setSelected(next);
    await supabase.from("proposals").update({ flat_value: value, total_value: value }).eq("id", selected.id);
    setProposals((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  };


  const addItemFromAsset = async (assetId: string) => {
    if (!selected) return;
    const a = assets.find((x) => x.id === assetId);
    if (!a) return;
    await supabase.from("proposal_items").insert({
      proposal_id: selected.id, asset_id: a.id, name: a.name, quantity: 1, unit_value: a.unit_value, position: items.length,
    });
    openDetail(selected);
  };

  const addItemsFromTier = async (tierId: string) => {
    if (!selected) return;
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const { data: ta } = await supabase.from("tier_assets").select("asset_id,quantity").eq("tier_id", tierId);
    const rows = (ta ?? []).map((row: any, idx: number) => {
      const a = assets.find((x) => x.id === row.asset_id);
      return {
        proposal_id: selected.id,
        asset_id: row.asset_id,
        name: a?.name ?? "Ativo",
        quantity: Number(row.quantity) || 1,
        unit_value: a?.unit_value ?? 0,
        position: items.length + idx,
      };
    });
    if (rows.length === 0) {
      await supabase.from("proposal_items").insert({
        proposal_id: selected.id, name: `Cota ${tier.name}`, quantity: 1, unit_value: Number(tier.value) || 0, position: items.length,
      });
    } else {
      await supabase.from("proposal_items").insert(rows);
    }
    await supabase.from("proposals").update({ total_value: Number(tier.value) || 0 }).eq("id", selected.id);
    toast({ title: "Cota aplicada", description: `${tier.name} adicionada à proposta.` });
    openDetail(selected);
  };

  const addCustomItem = async () => {
    if (!selected) return;
    await supabase.from("proposal_items").insert({
      proposal_id: selected.id, name: "Novo item", quantity: 1, unit_value: 0, position: items.length,
    });
    openDetail(selected);
  };
  const updateItem = async (it: Item, patch: Partial<Item>) => {
    await supabase.from("proposal_items").update(patch).eq("id", it.id);
    openDetail(selected!);
  };
  const removeItem = async (it: Item) => {
    await supabase.from("proposal_items").delete().eq("id", it.id);
    openDetail(selected!);
  };

  const generatePdf = async () => {
    if (!selected) return;
    await persistTotal(total);
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("generate-proposal-pdf", { body: { proposal_id: selected.id } });
    setGenerating(false);
    if (error) return toast({ title: "Erro ao gerar PDF", description: error.message, variant: "destructive" });
    toast({ title: "PDF gerado" });
    if (data?.pdf_path) {
      const { data: signed } = await supabase.storage.from("proposals").createSignedUrl(data.pdf_path, 60);
      if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
      setSelected({ ...selected, pdf_path: data.pdf_path });
      load();
    }
  };

  const downloadPdf = async () => {
    if (!selected?.pdf_path) return;
    const { data } = await supabase.storage.from("proposals").createSignedUrl(selected.pdf_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const REJECTION_REASONS = ["Preço acima do orçamento", "Sem verba no momento", "Escolheu concorrente", "Timing inadequado", "Falta de fit com a marca", "Sem retorno / desistiu", "Outro"];
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  const updateStatus = async (status: Status, extra?: Record<string, unknown>) => {
    if (!selected) return;
    const patch: any = { status, ...(extra ?? {}) };
    if (status === "enviada") patch.sent_at = new Date().toISOString();
    if (status === "aceita" || status === "recusada") patch.decided_at = new Date().toISOString();
    if (status !== "recusada") { patch.rejection_reason = null; patch.rejection_notes = null; }
    const { data, error } = await supabase
      .from("proposals")
      .update(patch)
      .eq("id", selected.id)
      .select()
      .maybeSingle();
    if (error) {
      toast({ title: "Não foi possível salvar o status", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      toast({
        title: "Sem permissão para alterar esta proposta",
        description: "Você precisa de acesso de escrita ao CRM desta organização.",
        variant: "destructive",
      });
      return;
    }
    setSelected({ ...selected, ...(data as any) });
    toast({ title: `Status atualizado para ${status}` });
    load();
  };


  const confirmRejection = async () => {
    const reason = rejectReason === "Outro" ? rejectNotes.trim() : rejectReason;
    if (!reason) return;
    await updateStatus("recusada", {
      rejection_reason: rejectReason,
      rejection_notes: rejectNotes.trim() || null,
    });
    setRejectOpen(false);
    setRejectReason("");
    setRejectNotes("");
    if (selected) openFunnelDialog(selected, true);
  };


  const openFunnelDialog = (p: Proposal, mandatory = false) => {
    setFunnelMandatory(mandatory);
    setFunnelTarget(p);
    setFunnelChoice(mandatory ? "" : (funnels.find((f) => f.is_default)?.id ?? funnels[0]?.id ?? ""));
  };

  const sendToFunnel = async () => {
    if (!funnelTarget || !funnelChoice || !user || !orgId) return;
    setSendingFunnel(true);
    try {
      if (funnelTarget.converted_opportunity_id) {
        const { error } = await supabase
          .from("opportunities")
          .update({ pipeline_funnel_id: funnelChoice } as any)
          .eq("id", funnelTarget.converted_opportunity_id);
        if (error) throw error;
      } else {
        const sponsor = sponsors.find((s) => s.id === funnelTarget.sponsor_id);
        const { data, error } = await supabase.from("opportunities").insert({
          owner_id: user.id,
          organization_id: orgId,
          brand: sponsor?.name ?? funnelTarget.brand ?? "Marca",
          property_id: funnelTarget.property_id,
          sponsor_id: funnelTarget.sponsor_id,
          value: Number(funnelTarget.total_value) || 0,
          stage: "proposta_enviada",
          pipeline_funnel_id: funnelChoice,
        } as any).select().single();
        if (error) throw error;
        await supabase.from("proposals").update({ converted_opportunity_id: (data as any).id }).eq("id", funnelTarget.id);
      }
      toast({ title: "Proposta enviada ao funil", description: funnels.find((f) => f.id === funnelChoice)?.name ?? "" });
      setFunnelMandatory(false);
      setFunnelTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSendingFunnel(false);
    }
  };

  const convertToOpportunity = async () => {
    if (!selected || !user || !orgId) return;
    await persistTotal(total);
    const sponsor = sponsors.find((s) => s.id === selected.sponsor_id);
    const { data, error } = await supabase.from("opportunities").insert({
      owner_id: user.id,
      organization_id: orgId,
      brand: sponsor?.name ?? selected.brand ?? "Marca",
      property_id: selected.property_id,
      sponsor_id: selected.sponsor_id,
      value: total,
      stage: "proposta_enviada",
    }).select().single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    await supabase.from("proposals").update({ converted_opportunity_id: data!.id }).eq("id", selected.id);
    toast({ title: "Oportunidade criada", description: "Disponível em /dashboard/pipeline" });
    setSelected({ ...selected, converted_opportunity_id: data!.id });
    load();
  };

  const updateProposalField = async (field: "sponsor_id" | "property_id" | "valid_until", value: string | null) => {
    if (!selected) return;
    const { error } = await supabase.from("proposals").update({ [field]: value } as any).eq("id", selected.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setSelected({ ...selected, [field]: value } as Proposal);
    load();
  };

  const goToProposalField = (field: string) => {
    if (field === "itens/ativos" || field === "valor") {
      setDetailTab("items");
      focusMissingField(field === "valor" ? "valor" : "itens");
      return;
    }
    setDetailTab("info");
    focusMissingField(field);
  };

  const convertToContract = async () => {
    if (!selected || !user || !orgId) return;
    const missingFields: string[] = [];
    if (!selected.sponsor_id) missingFields.push("sponsor");
    if (!selected.property_id) missingFields.push("propriedade");
    if (!total || total <= 0) missingFields.push("valor");
    if (items.length === 0) missingFields.push("itens/ativos");
    if (!selected.valid_until) missingFields.push("data prevista");
    if (missingFields.length > 0) {
      setMissingInfo({
        title: "Não é possível gerar o contrato",
        description: "Clique em cada item para ir direto ao campo que precisa ser preenchido.",
        items: missingFields.map((f) => ({ label: f, onAction: () => goToProposalField(f) })),
        actionLabel: missingFields.includes("itens/ativos") ? "Ir para Itens" : "Ir para Info",
        onAction: () => goToProposalField(missingFields[0]),
      });
      return;
    }
    // Cadastro fiscal do patrocinador é obrigatório para gerar contrato
    const { data: sponsorRow } = await supabase
      .from("sponsors")
      .select("id,name,legal_name,tax_id,address")
      .eq("id", selected.sponsor_id!)
      .maybeSingle();
    const sponsorMissing: string[] = [];
    if (!sponsorRow?.legal_name?.trim()) sponsorMissing.push("Razão social");
    if (!sponsorRow?.tax_id?.trim()) sponsorMissing.push("CNPJ");
    if (!sponsorRow?.address?.trim()) sponsorMissing.push("Endereço");
    if (sponsorMissing.length > 0) {
      const goToSponsor = () => navigate(`/dashboard/patrocinadores/${selected.sponsor_id}?edit=1`);
      setMissingInfo({
        title: "Conclua o cadastro do patrocinador",
        description: `Para gerar o contrato, complete o cadastro de ${sponsorRow?.name ?? "patrocinador"}.`,
        items: sponsorMissing.map((f) => ({ label: f, onAction: goToSponsor })),
        actionLabel: "Concluir cadastro do patrocinador",
        onAction: goToSponsor,
      });
      return;
    }
    await persistTotal(total);
    const sponsor = sponsors.find((s) => s.id === selected.sponsor_id);
    const { data: c, error } = await supabase.from("contracts").insert({
      owner_id: user.id,
      organization_id: orgId,
      title: selected.title,
      brand: sponsor?.name ?? selected.brand ?? "Marca",
      sponsor_id: selected.sponsor_id,
      property_id: selected.property_id,
      total_value: total,
      use_flat_value: useFlat,
      flat_value: useFlat ? total : 0,
      status: "rascunho",
    }).select().single();
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    if (items.length > 0) {
      const { error: copyError } = await supabase.rpc("copy_proposal_items_to_contract", {
        _contract_id: c!.id,
        _proposal_id: selected.id,
      });
      if (copyError) {
        console.error("copy_proposal_items_to_contract error", copyError);
        // Fallback: manual copy
        await supabase.from("contract_assets").insert(items.map((i) => ({
          contract_id: c!.id, asset_id: i.asset_id, name: i.name, quantity: i.quantity, unit_value: i.unit_value,
        })));
      }
    }

    await supabase.from("proposals").update({ converted_contract_id: c!.id, status: "aceita" as Status, decided_at: new Date().toISOString() }).eq("id", selected.id).eq("organization_id", orgId);
    setSelected({ ...selected, converted_contract_id: c!.id, status: "aceita" });
    setContractChoice({ open: true, contractId: c!.id });
    load();
  };

  const deleteProposal = async (p?: Proposal) => {
    const target = p ?? selected;
    if (!target || !confirm("Excluir esta proposta? Esta ação não pode ser desfeita.")) return;
    await supabase.from("proposals").delete().eq("id", target.id);
    if (selected?.id === target.id) setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Propostas</h1>
          <p className="text-sm text-muted-foreground">Builder a partir de ativos, com PDF e conversão para pipeline/contrato.</p>
        </div>
        <div className="flex gap-2">
          <GenerateProposalAIDialog
            sponsors={sponsors}
            properties={properties}
            onGenerated={async (g) => {
              if (!user || !orgId) return;
              const total = g.items.reduce((s, i) => s + i.quantity * Number(i.unit_value), 0);
              const sponsor = sponsors.find((s) => s.id === g.sponsor_id);
              const { data, error } = await supabase.from("proposals").insert({
                owner_id: user.id,
                organization_id: orgId,
                title: g.title,
                brand: sponsor?.name ?? null,
                sponsor_id: g.sponsor_id,
                property_id: g.property_id,
                message: g.message,
                total_value: total,
              }).select().single();
              if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
              if (data && g.items.length > 0) {
                await supabase.from("proposal_items").insert(
                  g.items.map((it, idx) => ({
                    proposal_id: data.id,
                    name: it.name,
                    description: it.description ?? null,
                    quantity: it.quantity,
                    unit_value: it.unit_value,
                    position: idx,
                  }))
                );
              }
              await load();
              if (data) openDetail(data as Proposal);
            }}
          />
          <ProposalWizardDialog sponsors={sponsors} properties={properties} onSaved={load} />
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nova proposta</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {filtered.length === proposals.length
                  ? `${proposals.length} propostas`
                  : `${filtered.length} de ${proposals.length} propostas`}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Total filtrado: {fmtBRL(filteredTotal)}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 w-64"
                  placeholder="Buscar por título, nº, marca, patrocinador…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigas</SelectItem>
                  <SelectItem value="value_desc">Maior valor</SelectItem>
                  <SelectItem value="value_asc">Menor valor</SelectItem>
                  <SelectItem value="validity">Validade (próxima)</SelectItem>
                  <SelectItem value="title">Título (A-Z)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <XCircle className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["all", ...Object.keys(statusUI)] as string[]).map((key) => {
              const label = key === "all" ? "Todos" : statusUI[key as Status].label;
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {label} ({statusCounts[key] ?? 0})
                </button>
              );
            })}
          </div>

          {showFilters && (
            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Patrocinador</Label>
                <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Propriedade</Label>
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Validade</Label>
                <Select value={validityFilter} onValueChange={(v) => setValidityFilter(v as typeof validityFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer</SelectItem>
                    <SelectItem value="expired">Vencidas</SelectItem>
                    <SelectItem value="7d">Vencem em 7 dias</SelectItem>
                    <SelectItem value="30d">Vencem em 30 dias</SelectItem>
                    <SelectItem value="none">Sem data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Faixa de valor</Label>
                <Select value={valueFilter} onValueChange={(v) => setValueFilter(v as typeof valueFilter)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer</SelectItem>
                    <SelectItem value="under10k">Até R$ 10 mil</SelectItem>
                    <SelectItem value="10k50k">R$ 10 mil – 50 mil</SelectItem>
                    <SelectItem value="50k100k">R$ 50 mil – 100 mil</SelectItem>
                    <SelectItem value="100kplus">Acima de R$ 100 mil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          : filtered.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma proposta.</p>
          : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const sponsor = sponsors.find((s) => s.id === p.sponsor_id);
                return (
                  <button key={p.id} onClick={() => openDetail(p)} className="w-full text-left rounded-md border p-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{p.title}</h3>
                          {p.proposal_number && <span className="text-xs text-muted-foreground">#{p.proposal_number}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{sponsor?.name ?? p.brand ?? "—"}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="font-medium text-sm">{fmtBRL(Number(p.total_value))}</div>
                          {p.valid_until && <div className="text-[10px] text-muted-foreground">até {p.valid_until}</div>}
                        </div>
                        <Badge variant="outline" className={statusUI[p.status].cls}>{statusUI[p.status].label}</Badge>
                        <span
                          role="button"
                          tabIndex={0}
                          title="Enviar para funil"
                          onClick={(e) => { e.stopPropagation(); openFunnelDialog(p); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openFunnelDialog(p); } }}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        >
                          <Briefcase className="h-3.5 w-3.5" /> Funil
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          title="Excluir proposta"
                          onClick={(e) => { e.stopPropagation(); deleteProposal(p); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); deleteProposal(p); } }}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enviar para funil */}
      <Dialog open={!!funnelTarget} onOpenChange={(o) => { if (!o && !funnelMandatory) { setFunnelTarget(null); } }}>
        <DialogContent onInteractOutside={(e) => { if (funnelMandatory) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (funnelMandatory) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>{funnelMandatory ? "Escolha um novo funil" : "Enviar para funil"}</DialogTitle>
            <DialogDescription>
              {funnelMandatory
                ? "A proposta foi recusada. Selecione obrigatoriamente o funil para onde esta oportunidade deve seguir."
                : "Escolha o funil onde esta proposta deve aparecer no pipeline."}
            </DialogDescription>
          </DialogHeader>
          {funnels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum funil cadastrado. Crie um funil no Pipeline.</p>
          ) : (
            <div className="space-y-1">
              <Label>Funil {funnelMandatory && <span className="text-destructive">*</span>}</Label>
              <Select value={funnelChoice} onValueChange={setFunnelChoice}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            {!funnelMandatory && <Button variant="outline" onClick={() => setFunnelTarget(null)}>Cancelar</Button>}
            <Button onClick={sendToFunnel} disabled={!funnelChoice || sendingFunnel}>
              {sendingFunnel ? "Enviando…" : funnelMandatory ? "Confirmar funil" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova proposta */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova proposta</DialogTitle><DialogDescription>Use um template para gerar um rascunho pronto para envio.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div><Label>Template</Label>
                <Select value={templateKey} onValueChange={(v) => setTemplateKey(v as ProposalTemplateKey)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PROPOSAL_TEMPLATES).map(([key, template]) => <SelectItem key={key} value={key}>{template.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => fillFromTemplate()}><FileText className="h-4 w-4 mr-2" /> Preencher</Button>
            </div>
            <div><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Patrocinador</Label>
                <Select value={form.sponsor_id || "none"} onValueChange={(v) => setForm({ ...form, sponsor_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— sem cadastro —</SelectItem>{sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Propriedade</Label>
                <Select value={form.property_id || "none"} onValueChange={(v) => setForm({ ...form, property_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">— nenhuma —</SelectItem>{properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Marca livre (se sem cadastro)</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
              <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
            </div>
            <div><Label>Mensagem</Label><Textarea rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={create} disabled={!form.title}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe / builder */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto" expandable>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center justify-between gap-3">
                  <span>{selected.title}</span>
                  <Badge variant="outline" className={statusUI[selected.status].cls}>{statusUI[selected.status].label}</Badge>
                </SheetTitle>
                <SheetDescription>
                  {selected.proposal_number && `#${selected.proposal_number} · `}
                  {sponsors.find((s) => s.id === selected.sponsor_id)?.name ?? selected.brand ?? "—"}
                </SheetDescription>
              </SheetHeader>

              <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-6">
                <TabsList className="grid grid-cols-5">
                  <TabsTrigger value="items">Itens</TabsTrigger>
                  <TabsTrigger value="versions">Versões IA</TabsTrigger>
                  <TabsTrigger value="actions">Ações</TabsTrigger>
                  <TabsTrigger value="info">Info</TabsTrigger>
                  <TabsTrigger value="ia">IA</TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="space-y-3 pt-4">
                  <div className="flex gap-2">
                    <Select onValueChange={(v) => v && addItemFromAsset(v)}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="+ Ativo do catálogo" /></SelectTrigger>
                      <SelectContent>
                        {assets.length === 0 ? <SelectItem value="empty" disabled>Nenhum ativo</SelectItem>
                        : assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} — {fmtBRL(a.unit_value)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={addCustomItem}><Plus className="h-4 w-4 mr-2" /> Item livre</Button>
                  </div>

                  <Select onValueChange={(v) => v && addItemsFromTier(v)}>
                    <SelectTrigger><SelectValue placeholder="+ Aplicar cota cadastrada" /></SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const list = tiers.filter((t) => !selected.property_id || t.property_id === selected.property_id);
                        return list.length === 0
                          ? <SelectItem value="empty" disabled>Nenhuma cota cadastrada</SelectItem>
                          : list.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {fmtBRL(t.value)}</SelectItem>);
                      })()}
                    </SelectContent>
                  </Select>

                  <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label className="text-sm">Valor geral (fechado)</Label>
                        <p className="text-xs text-muted-foreground">Desconsidera os valores unitários dos itens.</p>
                      </div>
                      <Switch checked={useFlat} onCheckedChange={setFlatMode} />
                    </div>
                    {useFlat && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={flatValue}
                          onChange={(e) => setSelected({ ...selected, flat_value: Number(e.target.value) })}
                          onBlur={(e) => saveFlatValue(Number(e.target.value))}
                          className="w-48"
                        />
                        <span className="text-xs text-muted-foreground">Os valores unitários dos itens são ignorados e ficam ocultos.</span>
                      </div>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
                      Adicione ativos do catálogo ou itens livres.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {useFlat && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                          Valor geral ativo: os custos por item ficam ocultos — apenas os ativos entregues são exibidos.
                        </div>
                      )}

                      <AssetCatalogToolbar
                        search={itemSearch}
                        onSearchChange={setItemSearch}
                        sortBy={itemSort as AssetSortBy}
                        onSortChange={(v) => setItemSort(v)}
                        categories={itemCategories}
                        categoryFilter={itemCategoryFilter}
                        onCategoryChange={setItemCategoryFilter}
                        exclusiveFilter={itemExclusiveFilter}
                        onExclusiveChange={setItemExclusiveFilter}
                        viewMode={itemView}
                        onViewModeChange={setItemView}
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={itemOrigin} onValueChange={(v) => setItemOrigin(v as any)}>
                          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            <SelectItem value="catalog">Do catálogo</SelectItem>
                            <SelectItem value="custom">Itens livres</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={itemQtyFilter} onValueChange={(v) => setItemQtyFilter(v as any)}>
                          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Quantidade" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas quantidades</SelectItem>
                            <SelectItem value="1">1 unidade</SelectItem>
                            <SelectItem value="2plus">2+ unidades</SelectItem>
                            <SelectItem value="5plus">5+ unidades</SelectItem>
                            <SelectItem value="10plus">10+ unidades</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={itemValueFilter} onValueChange={(v) => setItemValueFilter(v as any)}>
                          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Valor" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos valores</SelectItem>
                            <SelectItem value="under1k">Até R$1.000</SelectItem>
                            <SelectItem value="1k5k">R$1.001–5.000</SelectItem>
                            <SelectItem value="5k10k">R$5.001–10.000</SelectItem>
                            <SelectItem value="10kplus">Acima de R$10.000</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setItemSearch("");
                            setItemSort("position");
                            setItemCategoryFilter("all");
                            setItemExclusiveFilter("all");
                            setItemOrigin("all");
                            setItemQtyFilter("all");
                            setItemValueFilter("all");
                          }}
                        >
                          Limpar filtros
                        </Button>
                      </div>


                      {visibleItems.length === 0 ? (
                        <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                          Nenhum item encontrado com os filtros atuais.
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {groupedItems.map((group) => (
                            <div key={group.category} className="space-y-2">
                              <div className="flex items-center justify-between gap-2 border-b pb-1">
                                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {group.category} <span className="font-normal">({group.list.length})</span>
                                </span>
                                {!useFlat && (
                                  <span className="text-xs font-medium text-primary">{fmtBRL(group.subtotal)}</span>
                                )}
                              </div>

                              {itemView === "grid" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  {group.list.map((it) => (
                                    <div key={it.id} role="button" tabIndex={0} onClick={() => setEditingItem({ ...it })} onKeyDown={(e) => e.key === "Enter" && setEditingItem({ ...it })}
                                      className="rounded-md border p-3 cursor-pointer hover:border-primary/60 hover:bg-muted/40 transition-colors">
                                      <div className="flex items-start justify-between gap-2">
                                        <span className="text-sm font-medium line-clamp-2">{it.name}</span>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); removeItem(it); }}><Trash2 className="h-4 w-4" /></Button>
                                      </div>
                                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{it.quantity}x{useFlat ? "" : ` ${fmtBRL(Number(it.unit_value))}`}</span>
                                        <Badge variant="outline" className="text-[10px]">{it.asset_id ? "Catálogo" : "Livre"}</Badge>
                                      </div>
                                      {it.description && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">{it.description}</p>}
                                      {it.notes && <p className="mt-1 text-xs text-muted-foreground italic whitespace-pre-wrap">Obs.: {it.notes}</p>}
                                      {!useFlat && <div className="mt-1 text-sm font-semibold text-primary">{fmtBRL(it.quantity * Number(it.unit_value))}</div>}
                                    </div>
                                  ))}
                                </div>
                              ) : itemView === "compact" ? (
                                <div className="rounded-md border divide-y">
                                  {group.list.map((it) => (
                                    <div key={it.id} role="button" tabIndex={0} onClick={() => setEditingItem({ ...it })} onKeyDown={(e) => e.key === "Enter" && setEditingItem({ ...it })}
                                      className="px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">{it.quantity}x {it.name}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {!useFlat && <span className="text-xs font-medium">{fmtBRL(it.quantity * Number(it.unit_value))}</span>}
                                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); removeItem(it); }}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                      </div>
                                      {it.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{it.description}</p>}
                                      {it.notes && <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">Obs.: {it.notes}</p>}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {group.list.map((it) => (
                                    <div key={it.id} role="button" tabIndex={0} onClick={() => setEditingItem({ ...it })} onKeyDown={(e) => e.key === "Enter" && setEditingItem({ ...it })}
                                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:border-primary/60 hover:bg-muted/40 transition-colors">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium truncate">{it.name}</span>
                                          <Badge variant="outline" className="text-[10px]">{it.asset_id ? "Catálogo" : "Livre"}</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{it.quantity}{useFlat ? " un." : ` × ${fmtBRL(Number(it.unit_value))}`}</p>
                                        {it.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{it.description}</p>}
                                        {it.notes && <p className="text-xs text-muted-foreground italic whitespace-pre-wrap mt-1">Obs.: {it.notes}</p>}
                                      </div>
                                      {!useFlat && <span className="text-sm font-semibold">{fmtBRL(it.quantity * Number(it.unit_value))}</span>}
                                      <Pencil className="h-4 w-4 text-muted-foreground" />
                                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); removeItem(it); }}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}


                      <div className="flex justify-between items-center border-t pt-3">
                        <span className="text-sm text-muted-foreground">{useFlat ? "Total (valor geral)" : "Total"}</span>
                        <span className="text-lg font-bold text-primary">{fmtBRL(total)}</span>
                      </div>
                    </div>
                  )}

                </TabsContent>

                <TabsContent value="versions" className="pt-4">
                  <ProposalVersionsEditor proposalId={selected.id} />
                </TabsContent>

                <TabsContent value="actions" className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={generatePdf} disabled={generating || items.length === 0}>
                      {generating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
                      Gerar PDF
                    </Button>
                    <Button variant="outline" onClick={downloadPdf} disabled={!selected.pdf_path}>
                      <FileDown className="h-4 w-4 mr-2" /> Baixar PDF
                    </Button>
                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Alterar status</Label>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant={selected.status === "enviada" ? "default" : "outline"} className={selected.status === "enviada" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} onClick={() => updateStatus("enviada")}><Send className="h-4 w-4 mr-2" /> Enviada</Button>
                      <Button size="sm" variant={selected.status === "aceita" ? "default" : "outline"} className={selected.status === "aceita" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} onClick={() => updateStatus("aceita")}><CheckCircle2 className="h-4 w-4 mr-2" /> Aceita</Button>
                      <Button size="sm" variant={selected.status === "recusada" ? "destructive" : "outline"} className={selected.status === "recusada" ? "ring-2 ring-destructive ring-offset-2 ring-offset-background" : ""} onClick={() => { setRejectReason((selected as any).rejection_reason ?? ""); setRejectNotes((selected as any).rejection_notes ?? ""); setRejectOpen(true); }}><XCircle className="h-4 w-4 mr-2" /> Recusada</Button>
                      <Button size="sm" variant={selected.status === "rascunho" ? "secondary" : "ghost"} className={selected.status === "rascunho" ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} onClick={() => updateStatus("rascunho")}>Rascunho</Button>
                    </div>
                    {selected.status === "recusada" && (selected as any).rejection_reason && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                        <span className="font-medium">Motivo da recusa:</span> {(selected as any).rejection_reason}
                        {(selected as any).rejection_notes && (
                          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{(selected as any).rejection_notes}</p>
                        )}
                      </div>
                    )}

                  </div>

                  <div className="border-t pt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">Conversão</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={convertToOpportunity} disabled={!!selected.converted_opportunity_id}>
                        <Briefcase className="h-4 w-4 mr-2" />
                        {selected.converted_opportunity_id ? "Oportunidade criada" : "→ Pipeline"}
                      </Button>
                      <Button variant="outline" onClick={convertToContract} disabled={!!selected.converted_contract_id}>
                        <FileSignature className="h-4 w-4 mr-2" />
                        {selected.converted_contract_id ? "Contrato criado" : "→ Contrato"}
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <Button variant="destructive" size="sm" onClick={() => deleteProposal()}><Trash2 className="h-4 w-4 mr-2" /> Excluir proposta</Button>
                  </div>
                </TabsContent>

                <TabsContent value="info" className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1 p-1" data-field="sponsor">
                      <Label className="text-xs text-muted-foreground">Patrocinador</Label>
                      <Select value={selected.sponsor_id ?? "none"} onValueChange={(v) => updateProposalField("sponsor_id", v === "none" ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— nenhum —</SelectItem>{sponsors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 p-1" data-field="propriedade">
                      <Label className="text-xs text-muted-foreground">Propriedade</Label>
                      <Select value={selected.property_id ?? "none"} onValueChange={(v) => updateProposalField("property_id", v === "none" ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">— nenhuma —</SelectItem>{properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 p-1" data-field="data prevista">
                      <Label className="text-xs text-muted-foreground">Válido até</Label>
                      <Input type="date" value={selected.valid_until ?? ""} onChange={(e) => updateProposalField("valid_until", e.target.value || null)} />
                    </div>
                    <div className="space-y-1 p-1" data-field="valor">
                      <Label className="text-xs text-muted-foreground">Total</Label>
                      <div className="font-medium">{fmtBRL(Number(selected.total_value))}</div>
                      <p className="text-xs text-muted-foreground">Ajuste em Itens ou no valor fechado.</p>
                    </div>
                  </div>
                  {selected.message && (
                    <div><Label className="text-xs text-muted-foreground">Mensagem</Label><p className="text-sm whitespace-pre-wrap">{selected.message}</p></div>
                  )}
                </TabsContent>

                <TabsContent value="ia" className="pt-4">
                  <NextStepsAI context="proposal" targetId={selected.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <MissingInfoDialog state={missingInfo} onOpenChange={(o) => !o && setMissingInfo(null)} />

      {/* Escolha após criar contrato */}
      <Dialog open={contractChoice.open} onOpenChange={(o) => !o && setContractChoice((v) => ({ ...v, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              Contrato criado
            </DialogTitle>
            <DialogDescription>
              O contrato foi gerado a partir desta proposta. O que deseja fazer agora?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setContractChoice({ open: false, contractId: null });
                toast({ title: "Continuando na proposta" });
              }}
            >
              Continuar na proposta
            </Button>
            <Button
              onClick={() => {
                const id = contractChoice.contractId;
                setContractChoice({ open: false, contractId: null });
                if (id) navigate(`/dashboard/contratos?contract=${id}`);
              }}
            >
              Ir para o contrato
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar item */}
      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
            <DialogDescription>Ajuste nome, descrição, observação, quantidade e valor unitário do item da proposta.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} /></div>
              <div>
                <Label>Descrição</Label>
                <Textarea rows={2} value={editingItem.description ?? ""} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} />
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea
                  rows={2}
                  placeholder="Visível na proposta, no PDF e nas próximas etapas (contrato/entregas)"
                  value={editingItem.notes ?? ""}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Aparece logo abaixo da descrição do item em todas as etapas.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Quantidade</Label><Input type="number" min={1} value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: Number(e.target.value) })} /></div>
                <div><Label>Valor unitário</Label><Input type="number" step="0.01" value={editingItem.unit_value} onChange={(e) => setEditingItem({ ...editingItem, unit_value: Number(e.target.value) })} /></div>
              </div>
              <div className="text-sm text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{fmtBRL(editingItem.quantity * Number(editingItem.unit_value))}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingItem(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!editingItem) return;
                await updateItem(editingItem, {
                  name: editingItem.name,
                  description: editingItem.description?.trim() ? editingItem.description : null,
                  notes: editingItem.notes?.trim() ? editingItem.notes : null,
                  quantity: editingItem.quantity,
                  unit_value: editingItem.unit_value,
                });
                setEditingItem(null);
              }}
            >Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da recusa</DialogTitle>
            <DialogDescription>Informe por que a proposta foi recusada. Este campo é obrigatório.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {REJECTION_REASONS.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={rejectReason === r ? "default" : "outline"}
                  onClick={() => setRejectReason(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {rejectReason === "Outro" ? "Descreva o motivo *" : "Comentário (opcional)"}
              </Label>
              <Textarea
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Detalhe o contexto da recusa..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason || (rejectReason === "Outro" && !rejectNotes.trim())}
              onClick={confirmRejection}
            >
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
