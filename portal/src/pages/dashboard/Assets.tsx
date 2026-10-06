import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Boxes, Plus, Search, Star, Trash2, ImagePlus, Upload, X, Settings, FileSpreadsheet, LayoutGrid, List, Rows3, Lock, MapPin } from "lucide-react";
import AssetBulkImportDialog from "@/components/assets/AssetBulkImportDialog";
import { Checkbox } from "@/components/ui/checkbox";


interface Asset {
  id: string;
  organization_id: string | null;
  name: string;
  category: string;
  unit_value: number;
  quantity: number;
  status: string;
  notes: string | null;
  is_exclusive?: boolean;
  exclusivity_terms?: string[] | null;
  exclusive_sponsor_id?: string | null;
}

interface SponsorOption { id: string; name: string }

interface Property { id: string; name: string; }
interface Photo { id: string; storage_path: string; is_cover: boolean; position: number; url: string; }
interface Allocation { id?: string; asset_id: string; property_id: string; }

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const DEFAULT_CATEGORIES = ["Placa", "Naming", "Camisa", "Mídia digital", "Hospitality", "Ações", "Outro"];
const CATEGORIES = DEFAULT_CATEGORIES;
const CATEGORIES_KEY = "brandplay:asset-categories";

const EXCLUSIVITY_CHECKLIST = [
  "Exclusivo por categoria/segmento de mercado",
  "Sem marcas concorrentes no mesmo ativo",
  "Exclusividade em toda a temporada/evento",
  "Aprovação prévia da marca para uso do ativo",
  "Não pode ser dividido entre patrocinadores",
  "Direito de renovação preferencial",
];
const NEW_CATEGORY_VALUE = "__new_category__";
const MANAGE_CATEGORIES_VALUE = "__manage_categories__";

const loadCustomCategories = (): string[] => {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
};

export default function Assets() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [coverByAsset, setCoverByAsset] = useState<Record<string, string>>({});
  const [properties, setProperties] = useState<Property[]>([]);
  const [sponsors, setSponsors] = useState<SponsorOption[]>([]);
  const [allAllocations, setAllAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "compact">(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("assets:viewMode") : null;
    return saved === "list" || saved === "compact" || saved === "grid" ? saved : "grid";
  });
  useEffect(() => { localStorage.setItem("assets:viewMode", viewMode); }, [viewMode]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name_asc" | "name_desc" | "category" | "quantity_desc" | "quantity_asc" | "value_desc" | "value_asc" | "exclusive">("name_asc");
  const [exclusiveFilter, setExclusiveFilter] = useState<"all" | "only" | "none">("all");


  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    category: CATEGORIES[0],
    unit_value: "0",
    quantity: "1",
    notes: "",
    property_id: "__none__",
    is_exclusive: false,
    exclusivity_terms: [] as string[],
    exclusive_sponsor_id: "__none__",
  });
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const createFileRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Asset | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [editForm, setEditForm] = useState({
    name: "",
    category: CATEGORIES[0],
    unit_value: "0",
    quantity: "1",
    status: "disponivel",
    notes: "",
    is_exclusive: false,
    exclusivity_terms: [] as string[],
    exclusive_sponsor_id: "__none__",
  });
  const [saving, setSaving] = useState(false);

  const [customCategories, setCustomCategories] = useState<string[]>(() => loadCustomCategories());
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryTarget, setNewCategoryTarget] = useState<"create" | "edit">("create");
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);

  const allCategories = useMemo(() => {
    const set = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories]);
    assets.forEach((a) => a.category && set.add(a.category));
    const list = Array.from(set).filter((c) => c !== "Outro").sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (set.has("Outro")) list.push("Outro");
    return list;
  }, [customCategories, assets]);

  const confirmNewCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (!allCategories.includes(name)) {
      const next = [...customCategories, name];
      setCustomCategories(next);
      try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
    if (newCategoryTarget === "create") setForm((f) => ({ ...f, category: name }));
    else setEditForm((f) => ({ ...f, category: name }));
    setNewCategoryName("");
    setNewCategoryOpen(false);
  };

  const deleteCategory = (name: string) => {
    if (!customCategories.includes(name)) return;
    if (!confirm(`Excluir a categoria "${name}"?`)) return;
    const next = customCategories.filter((c) => c !== name);
    setCustomCategories(next);
    try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    if (categoryFilter === name) setCategoryFilter("all");
    if (form.category === name) setForm((f) => ({ ...f, category: "Outro" }));
    if (editForm.category === name) setEditForm((f) => ({ ...f, category: "Outro" }));
    toast({ title: "Categoria removida", description: `"${name}" foi excluída.` });
  };

  const openNewCategory = (target: "create" | "edit") => {
    setNewCategoryTarget(target);
    setNewCategoryName("");
    setNewCategoryOpen(true);
  };

  const load = async () => {
    if (!user || !orgId) return;
    setLoading(true);
    const [{ data: a }, { data: p }, { data: ph }, { data: sp }, { data: al }] = await Promise.all([
      supabase.from("assets").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("sports_properties").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("asset_photos" as any).select("asset_id,storage_path,is_cover").eq("organization_id", orgId).order("position"),
      supabase.from("sponsors").select("id,name").eq("organization_id", orgId).order("name"),
      supabase.from("asset_allocations" as any).select("asset_id,property_id").eq("organization_id", orgId),
    ]);
    setSponsors((sp ?? []) as SponsorOption[]);
    setAssets((a ?? []) as Asset[]);
    setProperties((p ?? []) as Property[]);
    setAllAllocations(((al ?? []) as unknown) as Allocation[]);
    const covers: Record<string, string> = {};
    (ph ?? []).forEach((row: any) => {
      if (covers[row.asset_id] && !row.is_cover) return;
      const { data } = supabase.storage.from("asset-photos").getPublicUrl(row.storage_path);
      covers[row.asset_id] = data.publicUrl;
    });
    setCoverByAsset(covers);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, orgId]);

  const filtered = useMemo(() => {
    const list = assets.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (exclusiveFilter === "only" && !(a as any).is_exclusive) return false;
      if (exclusiveFilter === "none" && (a as any).is_exclusive) return false;
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const sorted = [...list];
    switch (sortBy) {
      case "name_desc": sorted.sort((a, b) => b.name.localeCompare(a.name, "pt-BR")); break;
      case "category": sorted.sort((a, b) => (a.category || "").localeCompare(b.category || "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR")); break;
      case "quantity_desc": sorted.sort((a, b) => (Number((b as any).quantity) || 0) - (Number((a as any).quantity) || 0)); break;
      case "quantity_asc": sorted.sort((a, b) => (Number((a as any).quantity) || 0) - (Number((b as any).quantity) || 0)); break;
      case "value_desc": sorted.sort((a, b) => (Number((b as any).base_value) || 0) - (Number((a as any).base_value) || 0)); break;
      case "value_asc": sorted.sort((a, b) => (Number((a as any).base_value) || 0) - (Number((b as any).base_value) || 0)); break;
      case "exclusive": sorted.sort((a, b) => Number(!!(b as any).is_exclusive) - Number(!!(a as any).is_exclusive) || a.name.localeCompare(b.name, "pt-BR")); break;
      default: sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    return sorted;
  }, [assets, search, categoryFilter, sortBy, exclusiveFilter]);


  const sponsorName = (id?: string | null) => sponsors.find((sp) => sp.id === id)?.name ?? null;

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);
  const propertyNamesByAssetId = useMemo(() => {
    const map = new Map<string, string[]>();
    allAllocations.forEach((a) => {
      const name = propertyById.get(a.property_id);
      if (!name) return;
      const list = map.get(a.asset_id) ?? [];
      list.push(name);
      map.set(a.asset_id, list);
    });
    return map;
  }, [allAllocations, propertyById]);

  const assetProperties = (assetId: string) => propertyNamesByAssetId.get(assetId) ?? [];

  const createAsset = async () => {
    if (!user || !orgId || !form.name) return;
    setSaving(true);
    const { data: inserted, error } = await supabase
      .from("assets")
      .insert({
        owner_id: user.id,
        organization_id: orgId,
        name: form.name,
        category: form.category,
        unit_value: Number(form.unit_value) || 0,
        quantity: Number(form.quantity) || 1,
        status: "disponivel",
        notes: form.notes || null,
        is_exclusive: form.is_exclusive,
        exclusivity_terms: form.is_exclusive ? form.exclusivity_terms : [],
        exclusive_sponsor_id: form.is_exclusive && form.exclusive_sponsor_id !== "__none__" ? form.exclusive_sponsor_id : null,
      } as any)
      .select()
      .single();

    if (error || !inserted) {
      setSaving(false);
      return toast({ title: "Erro", description: error?.message || "Falha ao criar ativo", variant: "destructive" });
    }

    if (form.property_id && form.property_id !== "__none__") {
      await supabase.from("asset_allocations" as any).insert({
        asset_id: inserted.id,
        property_id: form.property_id,
        organization_id: orgId,
      });
    }

    for (let i = 0; i < createFiles.length; i++) {
      const file = createFiles[i];
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${inserted.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("asset-photos").upload(path, file);
      if (upErr) {
        toast({ title: "Falha no upload", description: upErr.message, variant: "destructive" });
        continue;
      }
      await supabase.from("asset_photos" as any).insert({
        asset_id: inserted.id,
        organization_id: orgId,
        storage_path: path,
        is_cover: i === 0,
        position: i,
      });
    }

    setSaving(false);
    toast({ title: "Ativo criado" });
    setDialogOpen(false);
    setForm({ name: "", category: CATEGORIES[0], unit_value: "0", quantity: "1", notes: "", property_id: "__none__", is_exclusive: false, exclusivity_terms: [], exclusive_sponsor_id: "__none__" });
    setCreateFiles([]);
    load();
  };

  const openDetail = async (asset: Asset) => {
    setSelected(asset);
    setEditForm({
      name: asset.name,
      category: asset.category,
      unit_value: String(asset.unit_value ?? 0),
      quantity: String(asset.quantity ?? 1),
      status: asset.status ?? "disponivel",
      notes: asset.notes ?? "",
      is_exclusive: Boolean(asset.is_exclusive),
      exclusivity_terms: asset.exclusivity_terms ?? [],
      exclusive_sponsor_id: asset.exclusive_sponsor_id ?? "__none__",
    });
    const [{ data: ph }, { data: al }] = await Promise.all([
      supabase.from("asset_photos" as any).select("*").eq("asset_id", asset.id).eq("organization_id", asset.organization_id).order("position"),
      supabase.from("asset_allocations" as any).select("id,property_id").eq("asset_id", asset.id).eq("organization_id", asset.organization_id),
    ]);
    setPhotos(
      (ph ?? []).map((p: any) => ({
        ...p,
        url: supabase.storage.from("asset-photos").getPublicUrl(p.storage_path).data.publicUrl,
      })),
    );
    setAllocations((al ?? []) as unknown as Allocation[]);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || !selected || !user) return;
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${selected.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("asset-photos").upload(path, file);
      if (upErr) {
        toast({ title: "Falha no upload", description: upErr.message, variant: "destructive" });
        continue;
      }
      const isFirst = photos.length === 0;
      await supabase.from("asset_photos" as any).insert({
        asset_id: selected.id,
        organization_id: selected.organization_id,
        storage_path: path,
        is_cover: isFirst,
        position: photos.length,
      });
    }
    openDetail(selected);
    load();
  };

  const setCover = async (photo: Photo) => {
    if (!selected || photo.is_cover) return;
    setPhotos((prev) => prev.map((p) => ({ ...p, is_cover: p.id === photo.id })));
    const { error: clearErr } = await supabase
      .from("asset_photos")
      .update({ is_cover: false })
      .eq("asset_id", selected.id);
    const { error: setErr } = await supabase
      .from("asset_photos")
      .update({ is_cover: true })
      .eq("id", photo.id);
    const error = clearErr || setErr;
    if (error) {
      toast({ title: "Erro ao definir capa", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Capa atualizada" });
    }
    openDetail(selected);
    load();
  };

  const deletePhoto = async (photo: Photo) => {
    await supabase.storage.from("asset-photos").remove([photo.storage_path]);
    await supabase.from("asset_photos").delete().eq("id", photo.id);
    if (selected) openDetail(selected);
    load();
  };

  const toggleAllocation = async (propertyId: string) => {
    if (!selected) return;
    const existing = allocations.find((a) => a.property_id === propertyId);
    if (existing) {
      await supabase.from("asset_allocations").delete().eq("id", existing.id);
    } else {
      await supabase.from("asset_allocations" as any).insert({ asset_id: selected.id, property_id: propertyId, organization_id: selected.organization_id });
    }
    openDetail(selected);
  };

  const saveAsset = async () => {
    if (!selected || !editForm.name.trim()) return;
    setSaving(true);
    const payload = {
      name: editForm.name.trim(),
      category: editForm.category,
      unit_value: Number(editForm.unit_value) || 0,
      quantity: Number(editForm.quantity) || 1,
      status: editForm.status,
      notes: editForm.notes.trim() || null,
      is_exclusive: editForm.is_exclusive,
      exclusivity_terms: editForm.is_exclusive ? editForm.exclusivity_terms : [],
      exclusive_sponsor_id: editForm.is_exclusive && editForm.exclusive_sponsor_id !== "__none__" ? editForm.exclusive_sponsor_id : null,
    };
    const { error } = await supabase.from("assets").update(payload as any).eq("id", selected.id);
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    setSelected({ ...selected, ...payload });
    toast({ title: "Ativo atualizado" });
    load();
  };


  const deleteAsset = async () => {
    if (!selected) return;
    if (!confirm("Excluir este ativo? Essa ação remove fotos e alocações.")) return;
    const { error } = await supabase.from("assets").delete().eq("id", selected.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setSelected(null);
    toast({ title: "Ativo excluído" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" /> Ativos
          </h1>
          <p className="text-sm text-muted-foreground">
            Catálogo global de ativos patrocináveis. Aloque em propriedades e use em contratos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Importar CSV
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo ativo
          </Button>
        </div>

      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <CardTitle className="text-base">{assets.length} ativos no catálogo</CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8 w-56"
                  placeholder="Buscar ativo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={categoryFilter} onValueChange={(v) => {
                if (v === MANAGE_CATEGORIES_VALUE) { setManageCategoriesOpen(true); return; }
                setCategoryFilter(v);
              }}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  <SelectSeparator />
                  {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectSeparator />
                  <SelectItem value={MANAGE_CATEGORIES_VALUE} className="text-primary font-medium">
                    <span className="flex items-center gap-2"><Settings className="h-3.5 w-3.5" /> Gerenciar categorias</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select value={exclusiveFilter} onValueChange={(v) => setExclusiveFilter(v as any)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os ativos</SelectItem>
                  <SelectItem value="only">Somente exclusivos</SelectItem>
                  <SelectItem value="none">Não exclusivos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Nome (A–Z)</SelectItem>
                  <SelectItem value="name_desc">Nome (Z–A)</SelectItem>
                  <SelectItem value="category">Categoria (A–Z)</SelectItem>
                  <SelectItem value="quantity_desc">Quantidade (maior)</SelectItem>
                  <SelectItem value="quantity_asc">Quantidade (menor)</SelectItem>
                  <SelectItem value="value_desc">Valor (maior)</SelectItem>
                  <SelectItem value="value_asc">Valor (menor)</SelectItem>
                  <SelectItem value="exclusive">Exclusivos primeiro</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center rounded-md border p-0.5">
                {([
                  { v: "grid" as const, icon: LayoutGrid, label: "Cartões" },
                  { v: "list" as const, icon: List, label: "Lista" },
                  { v: "compact" as const, icon: Rows3, label: "Compacto" },
                ]).map(({ v, icon: Icon, label }) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={viewMode === v ? "secondary" : "ghost"}
                    className="h-8 px-2"
                    aria-label={label}
                    title={label}
                    onClick={() => setViewMode(v)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>

          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum ativo cadastrado. Clique em "Novo ativo" para começar.
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openDetail(a)}
                  className="text-left rounded-lg border bg-card hover:shadow-md transition-shadow overflow-hidden"
                >
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {coverByAsset[a.id] ? (
                      <img src={coverByAsset[a.id]} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <Boxes className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium truncate">{a.name}</h3>
                      <Badge variant="outline" className="shrink-0">{a.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {fmtBRL(Number(a.unit_value))} · qtd {a.quantity}
                    </p>
                    {(() => {
                      const props = assetProperties(a.id);
                      return props.length > 0 ? (
                        <p className="text-xs text-muted-foreground flex items-start gap-1">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{props.join(" · ")}</span>
                        </p>
                      ) : null;
                    })()}
                    {a.is_exclusive && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1">
                        <p className="text-xs font-medium flex items-center gap-1 text-amber-700 dark:text-amber-400">
                          <Lock className="h-3 w-3" /> Exclusivo para uma única marca
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {sponsorName(a.exclusive_sponsor_id) ? `Marca: ${sponsorName(a.exclusive_sponsor_id)}` : "Marca ainda não definida"}
                        </p>
                        {(a.exclusivity_terms?.length ?? 0) > 0 && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">
                            {a.exclusivity_terms!.join(" · ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : viewMode === "list" ? (
            <div className="divide-y rounded-lg border">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openDetail(a)}
                  className="w-full text-left flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="h-14 w-20 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                    {coverByAsset[a.id] ? (
                      <img src={coverByAsset[a.id]} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <Boxes className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-medium truncate">{a.name}</h3>
                      {a.is_exclusive && (
                        <Badge variant="outline" className="shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400 gap-1">
                          <Lock className="h-3 w-3" /> Exclusivo{sponsorName(a.exclusive_sponsor_id) ? ` · ${sponsorName(a.exclusive_sponsor_id)}` : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.is_exclusive && (a.exclusivity_terms?.length ?? 0) > 0
                        ? a.exclusivity_terms!.join(" · ")
                        : a.notes || "Sem observações"}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 hidden sm:inline-flex">{a.category}</Badge>
                  {(() => {
                    const props = assetProperties(a.id);
                    return props.length > 0 ? (
                      <div className="shrink-0 hidden md:flex flex-col w-40 text-xs">
                        <span className="text-muted-foreground flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" /> Propriedades
                        </span>
                        <span className="truncate font-medium">{props.join(" · ")}</span>
                      </div>
                    ) : (
                      <div className="shrink-0 hidden md:flex flex-col w-40 text-xs">
                        <span className="text-muted-foreground">—</span>
                      </div>
                    );
                  })()}
                  <div className="text-right shrink-0 w-32">
                    <p className="text-sm font-medium">{fmtBRL(Number(a.unit_value))}</p>
                    <p className="text-xs text-muted-foreground">qtd {a.quantity}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openDetail(a)}
                  className="w-full text-left flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="flex-1 truncate flex items-center gap-1.5">
                    {a.is_exclusive && <Lock className="h-3 w-3 shrink-0 text-amber-600" aria-label="Exclusivo" />}
                    <span className="truncate">{a.name}</span>
                    {a.is_exclusive && sponsorName(a.exclusive_sponsor_id) && (
                      <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0 hidden md:inline">({sponsorName(a.exclusive_sponsor_id)})</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{a.category}</span>
                  {(() => {
                    const props = assetProperties(a.id);
                    return props.length > 0 ? (
                      <span className="text-xs text-muted-foreground shrink-0 hidden md:flex items-center gap-1 w-40 truncate">
                        <MapPin className="h-3 w-3 shrink-0" /> {props.join(" · ")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0 hidden md:inline w-40">—</span>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">×{a.quantity}</span>
                  <span className="font-medium shrink-0 w-28 text-right">{fmtBRL(Number(a.unit_value))}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>

      </Card>

      <AssetBulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        orgId={orgId}
        userId={user?.id ?? null}
        properties={properties}
        existingNames={assets.map((a) => a.name)}
        knownCategories={allCategories}
        onCategoriesCreated={(names) => {
          const next = Array.from(new Set([...customCategories, ...names]));
          setCustomCategories(next);
          try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        }}
        onImported={load}
      />

      {/* Novo ativo */}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setForm({ name: "", category: CATEGORIES[0], unit_value: "0", quantity: "1", notes: "", property_id: "__none__", is_exclusive: false, exclusivity_terms: [], exclusive_sponsor_id: "__none__" });
          setCreateFiles([]);
        }
        setDialogOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo ativo</DialogTitle>
            <DialogDescription>Cadastre um ativo no catálogo global.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => {
                    if (v === NEW_CATEGORY_VALUE) { openNewCategory("create"); return; }
                    if (v === MANAGE_CATEGORIES_VALUE) { setManageCategoriesOpen(true); return; }
                    setForm({ ...form, category: v });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectSeparator />
                    <SelectItem value={NEW_CATEGORY_VALUE}>+ Nova categoria…</SelectItem>
                    <SelectItem value={MANAGE_CATEGORIES_VALUE} className="text-primary font-medium">
                      <span className="flex items-center gap-2"><Settings className="h-3.5 w-3.5" /> Gerenciar categorias</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Propriedade (opcional)</Label>
                <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v === "__none__" ? "__none__" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor unitário (R$)</Label>
                <Input type="number" step="0.01" value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: e.target.value })} />
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="asset-exclusive"
                  checked={form.is_exclusive}
                  onCheckedChange={(v) => setForm({ ...form, is_exclusive: v === true, exclusivity_terms: v === true ? form.exclusivity_terms : [] })}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="asset-exclusive" className="cursor-pointer">Ativo exclusivo para uma única marca</Label>
                  <p className="text-xs text-muted-foreground">Marque as condições de exclusividade que se aplicam a este ativo.</p>
                </div>
              </div>
              {form.is_exclusive && (
                <div className="space-y-2 pl-6">
                  {EXCLUSIVITY_CHECKLIST.map((item) => {
                    const checked = form.exclusivity_terms.includes(item);
                    return (
                      <label key={item} className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setForm({
                              ...form,
                              exclusivity_terms: v === true
                                ? [...form.exclusivity_terms, item]
                                : form.exclusivity_terms.filter((t) => t !== item),
                            })
                          }
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                  <div className="space-y-1.5 pt-1">
                    <Label>Marca vinculada (exclusividade)</Label>
                    <Select value={form.exclusive_sponsor_id} onValueChange={(v) => setForm({ ...form, exclusive_sponsor_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecionar marca" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma marca definida</SelectItem>
                        {sponsors.map((sp) => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">Fotos</Label>
              <input
                ref={createFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) setCreateFiles((prev) => [...prev, ...Array.from(e.target.files as FileList)]);
                  if (createFileRef.current) createFileRef.current.value = "";
                }}
              />
              {createFiles.length === 0 ? (
                <button
                  type="button"
                  onClick={() => createFileRef.current?.click()}
                  className="w-full border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                >
                  <Upload className="h-6 w-6 mx-auto mb-2" />
                  Clique para adicionar fotos do ativo
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {createFiles.map((file, idx) => (
                      <div key={idx} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                        <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <Badge className="absolute top-1 left-1 bg-primary text-primary-foreground gap-1">
                            <Star className="h-3 w-3" /> Capa
                          </Badge>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 h-7 w-7 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setCreateFiles((prev) => prev.filter((_, i) => i !== idx))}
                          title="Remover foto"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => createFileRef.current?.click()}
                      className="border border-dashed rounded-md aspect-square flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <ImagePlus className="h-6 w-6" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">A primeira foto será a capa.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createAsset} disabled={!form.name || saving}>
              {saving ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>
                  {selected.category} · {fmtBRL(Number(selected.unit_value))} · qtd {selected.quantity}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-6">
                <div className="space-y-3 rounded-lg border p-3">
                  <Label className="text-sm font-medium">Editar ativo</Label>
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Categoria</Label>
                      <Select
                        value={editForm.category}
                        onValueChange={(v) => {
                          if (v === NEW_CATEGORY_VALUE) { openNewCategory("edit"); return; }
                          if (v === MANAGE_CATEGORIES_VALUE) { setManageCategoriesOpen(true); return; }
                          setEditForm({ ...editForm, category: v });
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          <SelectSeparator />
                          <SelectItem value={NEW_CATEGORY_VALUE}>+ Nova categoria…</SelectItem>
                          <SelectItem value={MANAGE_CATEGORIES_VALUE} className="text-primary font-medium">
                            <span className="flex items-center gap-2"><Settings className="h-3.5 w-3.5" /> Gerenciar categorias</span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disponivel">Disponível</SelectItem>
                          <SelectItem value="reservado">Reservado</SelectItem>
                          <SelectItem value="vendido">Vendido</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Valor unitário (R$)</Label>
                      <Input type="number" step="0.01" value={editForm.unit_value} onChange={(e) => setEditForm({ ...editForm, unit_value: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade</Label>
                      <Input type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Observações</Label>
                    <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                  </div>
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="asset-exclusive-edit"
                        checked={editForm.is_exclusive}
                        onCheckedChange={(v) => setEditForm({ ...editForm, is_exclusive: v === true, exclusivity_terms: v === true ? editForm.exclusivity_terms : [] })}
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor="asset-exclusive-edit" className="cursor-pointer">Ativo exclusivo para uma única marca</Label>
                        <p className="text-xs text-muted-foreground">Marque as condições de exclusividade que se aplicam a este ativo.</p>
                      </div>
                    </div>
                    {editForm.is_exclusive && (
                      <div className="space-y-2 pl-6">
                        {EXCLUSIVITY_CHECKLIST.map((item) => {
                          const checked = editForm.exclusivity_terms.includes(item);
                          return (
                            <label key={item} className="flex items-start gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setEditForm({
                                    ...editForm,
                                    exclusivity_terms: v === true
                                      ? [...editForm.exclusivity_terms, item]
                                      : editForm.exclusivity_terms.filter((t) => t !== item),
                                  })
                                }
                              />
                              <span>{item}</span>
                            </label>
                          );
                        })}
                        <div className="space-y-1.5 pt-1">
                          <Label>Marca vinculada (exclusividade)</Label>
                          <Select value={editForm.exclusive_sponsor_id} onValueChange={(v) => setEditForm({ ...editForm, exclusive_sponsor_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Selecionar marca" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhuma marca definida</SelectItem>
                              {sponsors.map((sp) => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                    )}
                  </div>
                  <Button size="sm" onClick={saveAsset} disabled={saving || !editForm.name.trim()}>
                    {saving ? "Salvando…" : "Salvar alterações"}
                  </Button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm">Galeria</Label>
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                      <ImagePlus className="h-4 w-4 mr-2" /> Adicionar
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => uploadPhotos(e.target.files)}
                    />
                  </div>
                  {photos.length === 0 ? (
                    <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                      <Upload className="h-6 w-6 mx-auto mb-2" />
                      Nenhuma foto. Adicione imagens do ativo.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((p) => (
                        <div key={p.id} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                          <img src={p.url} alt="" className="w-full h-full object-cover" />
                          {p.is_cover && (
                            <Badge className="absolute top-1 left-1 bg-primary text-primary-foreground gap-1">
                              <Star className="h-3 w-3" /> Capa
                            </Badge>
                          )}
                          <div className="absolute inset-0 z-10 flex items-start justify-end p-1 gap-1 pointer-events-none">
                            <Button
                              type="button"
                              size="icon"
                              variant={p.is_cover ? "default" : "secondary"}
                              className="h-7 w-7 shadow-sm pointer-events-auto"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCover(p); }}
                              title={p.is_cover ? "Esta é a capa" : "Definir como capa"}
                              aria-label={p.is_cover ? "Foto de capa" : "Definir como capa"}
                            >
                              <Star className={`h-4 w-4 ${p.is_cover ? "fill-current text-yellow-500" : ""}`} />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="destructive"
                              className="h-7 w-7 shadow-sm pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); deletePhoto(p); }}
                              title="Remover foto"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-sm">Alocação em propriedades</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Marque as propriedades onde este ativo está disponível.
                  </p>
                  {properties.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma propriedade cadastrada.</p>
                  ) : (
                    <div className="space-y-1">
                      {properties.map((p) => {
                        const checked = !!allocations.find((a) => a.property_id === p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAllocation(p.id)}
                              className="accent-primary"
                            />
                            <span className="text-sm">{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>




                <div className="border-t pt-4">
                  <Button variant="destructive" size="sm" onClick={deleteAsset}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir ativo
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Nova categoria */}
      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>Crie uma categoria personalizada para seus ativos.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Nome da categoria</Label>
            <Input
              autoFocus
              value={newCategoryName}
              maxLength={40}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmNewCategory(); }}
              placeholder="Ex.: Ativação digital"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewCategoryOpen(false)}>Cancelar</Button>
            <Button onClick={confirmNewCategory} disabled={!newCategoryName.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciar categorias */}
      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Gerenciar categorias</DialogTitle>
            <DialogDescription>Exclua categorias personalizadas que não são mais usadas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {allCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
            ) : (
              allCategories.map((c) => (
                <div key={c} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{c}</span>
                  {customCategories.includes(c) ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteCategory(c)}
                      title="Excluir categoria"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Padrão</span>
                  )}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setManageCategoriesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
