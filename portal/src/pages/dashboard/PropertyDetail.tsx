import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { LogoFrame, logoFrameIconClass } from "@/components/LogoFrame";
import {
  ArrowLeft,
  Trophy,
  Calendar,
  Users,
  Loader2,
  Boxes,
  Plus,
  Layers,
  TrendingUp,
  CalendarDays,
  History,
  Pencil,
  Trash2,
  Crown,
  Globe,
  Copy,
  Inbox,
  ExternalLink,
  FileText,
  FileSignature,
  Building2,
  Image as ImageIcon,
  ListChecks,
  Search,
  LayoutGrid,
  List as ListIcon,
  Rows3,
  Eye,
  EyeOff,
  Check,
  X,
  ClipboardPaste,
  FileSpreadsheet,
  FileDown,

} from "lucide-react";

import PropertyMediaGallery from "@/components/property/PropertyMediaGallery";
import PropertyChecklist from "@/components/property/PropertyChecklist";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SponsorSocialDashboard } from "@/components/sponsors/SponsorProfileFields";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

interface Property {
  id: string;
  name: string;
  category: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  audience_estimate: number | null;
  description: string | null;
  parent_property_id: string | null;
  season_year: number | null;
  created_at: string;
  public_slug: string | null;
  is_published: boolean;
  public_headline: string | null;
  public_about: string | null;
  about?: string | null;
  social_links?: Record<string, string> | null;
  social_stats?: Record<string, any> | null;
  locations?: string[] | null;
  final_location?: string | null;
  fans_count?: number | null;
  prize_pool?: number | null;
  participants_count?: number | null;
  teams_count?: number | null;
  key_notes?: string | null;
}

interface Lead {
  id: string;
  contact_name: string;
  email: string;
  company: string | null;
  phone: string | null;
  message: string | null;
  budget_range: string | null;
  status: string;
  tier_id: string | null;
  created_at: string;
  created_opportunity_id: string | null;
}

interface Tier {
  id: string;
  name: string;
  level: string;
  value: number;
  total_slots: number;
  description: string | null;
  benefits: string | null;
  color: string;
  position: number;
  sales_count?: number;
  assets_count?: number;
}

interface AllocatedAsset {
  id: string;
  name: string;
  category: string;
  unit_value: number;
  quantity: number;
  status: string;
  cover_url: string | null;
  in_tier?: boolean;
  sold?: boolean;
  is_exclusive?: boolean;
  exclusivity_terms?: string[] | null;
  exclusive_sponsor_id?: string | null;
}

interface PropertyEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: string;
}

interface TierSale {
  id: string;
  tier_id: string;
  brand: string | null;
  status: string;
  sold_at: string;
  sponsor_id: string | null;
  contract_id: string | null;
}

interface ProposalRow {
  id: string;
  title: string;
  brand: string | null;
  total_value: number;
  status: string;
  created_at: string;
  sent_at: string | null;
}

interface ContractRow {
  id: string;
  title: string;
  brand: string;
  total_value: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  sponsor_id: string | null;
}

interface ActiveSponsor {
  id: string;
  name: string;
  logo_url: string | null;
  segment: string | null;
  contracts_count: number;
  total_value: number;
  active_tiers: string[];
}

type TierTemplate = { name: string; level: string; color: string };

const DEFAULT_TIER_TEMPLATES: TierTemplate[] = [
  { name: "Master", level: "master", color: "#facc15" },
  { name: "Ouro", level: "gold", color: "#f59e0b" },
  { name: "Prata", level: "silver", color: "#94a3b8" },
  { name: "Bronze", level: "bronze", color: "#a16207" },
];

const TIER_TEMPLATES_KEY = "brandplay:tier-templates";

function loadTierTemplates(): TierTemplate[] {
  try {
    const raw = localStorage.getItem(TIER_TEMPLATES_KEY);
    if (!raw) return DEFAULT_TIER_TEMPLATES;
    const parsed = JSON.parse(raw) as TierTemplate[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TIER_TEMPLATES;
    return DEFAULT_TIER_TEMPLATES.map((d) => {
      const found = parsed.find((p) => p.level === d.level);
      return found?.name ? { ...d, name: found.name } : d;
    });
  } catch {
    return DEFAULT_TIER_TEMPLATES;
  }
}


const EVENT_TYPES = [
  { value: "jogo", label: "Jogo" },
  { value: "evento", label: "Evento" },
  { value: "ativacao", label: "Ativação" },
  { value: "reuniao", label: "Reunião" },
  { value: "deadline", label: "Deadline" },
];

const ASSET_STATUS_COLOR: Record<string, string> = {
  ativo: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  inativo: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  manutencao: "bg-amber-500/10 text-amber-700 border-amber-500/30",
};

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem(`propertyTab:${id}`) || "dashboard"
  );
  useEffect(() => {
    try { localStorage.setItem(`propertyTab:${id}`, activeTab); } catch { /* ignore */ }
  }, [activeTab, id]);
  const [kpisVisible, setKpisVisible] = useState(true);
  const [property, setProperty] = useState<Property | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierSales, setTierSales] = useState<TierSale[]>([]);
  const [tierAssetsMap, setTierAssetsMap] = useState<Record<string, string[]>>({});
  const [tierAssetQtyMap, setTierAssetQtyMap] = useState<Record<string, Record<string, number>>>({});
  const [assets, setAssets] = useState<AllocatedAsset[]>([]);
  const [events, setEvents] = useState<PropertyEvent[]>([]);
  const [seasons, setSeasons] = useState<Property[]>([]);
  const [contractsAgg, setContractsAgg] = useState<{ total: number; count: number }>({
    total: 0,
    count: 0,
  });
  const [proposalsCount, setProposalsCount] = useState(0);

  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [tierAssetSearch, setTierAssetSearch] = useState("");
  const [tierAssetCategory, setTierAssetCategory] = useState("all");
  const [tierAssetSort, setTierAssetSort] = useState("name_asc");
  const [showTierMap, setShowTierMap] = useState(false);
  const [mapEditAsset, setMapEditAsset] = useState<AllocatedAsset | null>(null);
  const [mapEditForm, setMapEditForm] = useState<{
    name: string;
    category: string;
    unit_value: string;
    quantity: string;
    tierQty: Record<string, number>;
  }>({ name: "", category: "", unit_value: "", quantity: "1", tierQty: {} });
  const [mapEditSaving, setMapEditSaving] = useState(false);
  const [pasteMapOpen, setPasteMapOpen] = useState(false);
  const [pasteMapText, setPasteMapText] = useState("");
  const [pasteMapSaving, setPasteMapSaving] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const [mapCategory, setMapCategory] = useState("all");
  const [mapStatus, setMapStatus] = useState("all");
  const [mapSort, setMapSort] = useState("name_asc");
  const [mapView, setMapView] = useState<"grid" | "list" | "compact">(
    () => (localStorage.getItem("propertyAssetsView") as "grid" | "list" | "compact") || "grid"
  );
  const [mapShowValues, setMapShowValues] = useState<boolean>(
    () => localStorage.getItem("propertyAssetsShowValues") !== "false"
  );
  const [assetDeliveries, setAssetDeliveries] = useState<
    {
      id: string;
      title: string;
      status: string;
      asset_type: string | null;
      due_date: string | null;
      brand: string | null;
      sponsor_id: string | null;
      sponsors?: { id: string; name: string } | null;
    }[]
  >([]);

  const deliveriesByAsset = useMemo(() => {
    const map: Record<string, typeof assetDeliveries> = {};
    for (const d of assetDeliveries) {
      const keys = new Set<string>();
      if (d.title) keys.add(d.title.trim().toLowerCase());
      if (d.asset_type) keys.add(d.asset_type.trim().toLowerCase());
      for (const k of keys) (map[k] = map[k] ?? []).push(d);
    }
    return map;
  }, [assetDeliveries]);

  const DELIVERY_STATUS_META: Record<string, { label: string; className: string }> = {
    pendente: { label: "Pendente", className: "bg-muted text-muted-foreground border-transparent" },
    em_producao: { label: "Em produção", className: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
    entregue: { label: "Entregue", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
    aprovada: { label: "Aprovada", className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
    atrasada: { label: "Atrasada", className: "bg-destructive/10 text-destructive border-destructive/30" },
  };

  const STATUS_ORDER = ["atrasada", "pendente", "em_producao", "entregue", "aprovada"];

  const deliveryInfoFor = (a: AllocatedAsset) => {
    const list = deliveriesByAsset[a.name.trim().toLowerCase()] ?? [];
    if (list.length === 0) return null;
    // Agrupa por patrocinador (fallback: marca)
    const groups = new Map<
      string,
      { key: string; sponsorId: string | null; label: string; items: typeof list }
    >();
    for (const d of list) {
      const sponsorName = d.sponsors?.name || d.brand || "Sem patrocinador";
      const key = d.sponsor_id || sponsorName;
      if (!groups.has(key))
        groups.set(key, { key, sponsorId: d.sponsor_id ?? null, label: sponsorName, items: [] });
      groups.get(key)!.items.push(d);
    }
    const resolved = Array.from(groups.values()).map((g) => {
      const worst = [...g.items].sort(
        (x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status)
      )[0];
      const done = g.items.filter((d) => d.status === "entregue" || d.status === "aprovada").length;
      return { ...g, worst, done, total: g.items.length };
    });
    resolved.sort((a, b) => a.label.localeCompare(b.label));
    return resolved;
  };

  const AssetDeliveryCell = ({ asset, compact }: { asset: AllocatedAsset; compact?: boolean }) => {
    const groups = deliveryInfoFor(asset);
    if (!groups)
      return <span className="text-[10px] text-muted-foreground">Sem entrega</span>;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => {
          const meta = DELIVERY_STATUS_META[g.worst.status] ?? DELIVERY_STATUS_META.pendente;
          return (
            <Link
              key={g.key}
              to={`/dashboard/entregas?delivery=${g.worst.id}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border bg-card/50 px-1.5 py-0.5 hover:underline"
              title={`${g.label} · abrir no módulo de Entregas`}
            >
              <Badge variant="outline" className={`text-[10px] px-1.5 ${meta.className}`}>
                {meta.label}
              </Badge>
              <span className="text-[10px] font-medium truncate max-w-[110px]">{g.label}</span>
              {!compact && (
                <span className="text-[10px] text-muted-foreground">
                  {g.done}/{g.total}
                </span>
              )}
              <ExternalLink className="h-3 w-3 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    );
  };


  const mapCategories = useMemo(
    () => Array.from(new Set(assets.map((a) => a.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [assets]
  );

  const filteredMapAssets = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    let list = assets.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q) && !(a.category || "").toLowerCase().includes(q)) return false;
      if (mapCategory !== "all" && a.category !== mapCategory) return false;
      if (mapStatus === "sold" && !a.sold) return false;
      if (mapStatus === "in_tier" && (!a.in_tier || a.sold)) return false;
      if (mapStatus === "livre" && (a.in_tier || a.sold)) return false;
      if (mapStatus === "exclusive" && !a.is_exclusive) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (mapSort) {
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "category":
          return (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name);
        case "value_desc":
          return (b.unit_value || 0) - (a.unit_value || 0);
        case "value_asc":
          return (a.unit_value || 0) - (b.unit_value || 0);
        case "quantity_desc":
          return (b.quantity || 0) - (a.quantity || 0);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [assets, mapSearch, mapCategory, mapStatus, mapSort]);


  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const [tierForm, setTierForm] = useState({
    name: "",
    level: "custom",
    value: "",
    total_slots: "1",
    description: "",
    benefits: "",
    color: "#64748b",
    selectedAssets: [] as string[],
    assetQty: {} as Record<string, number>,
  });

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    event_type: "jogo",
    starts_at: "",
    ends_at: "",
    location: "",
    description: "",
  });

  const [leads, setLeads] = useState<Lead[]>([]);
  const [pubForm, setPubForm] = useState({
    public_slug: "",
    is_published: false,
    public_headline: "",
    public_about: "",
  });
  const [savingPub, setSavingPub] = useState(false);

  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [seasonForm, setSeasonForm] = useState({
    name: "",
    season_year: new Date().getFullYear() + 1,
    start_date: "",
    end_date: "",
  });

  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [activeSponsors, setActiveSponsors] = useState<ActiveSponsor[]>([]);
  const [checklistItems, setChecklistItems] = useState<
    { id: string; status: string; due_date: string | null; title: string }[]
  >([]);

  const loadedOnceRef = useRef(false);

  const loadAll = async () => {
    if (!id) return;
    // Só mostra o spinner na primeira carga: refresh após alterações mantém a tela.
    if (!loadedOnceRef.current) setLoading(true);

    const [
      { data: prop },
      { data: tiersData },
      { data: salesData },
      { data: tierAssetsData },
      { data: allocData },
      { data: eventsData },
      { data: contractsData },
      { data: proposalsData },
    ] = await Promise.all([
      supabase.from("sports_properties").select("*").eq("id", id).maybeSingle(),
      supabase.from("sponsorship_tiers").select("*").eq("property_id", id).order("position"),
      supabase.from("tier_sales").select("*"),
      supabase.from("tier_assets").select("tier_id, asset_id, quantity"),
      supabase
        .from("asset_allocations")
        .select("asset:assets(id,name,category,unit_value,quantity,status,is_exclusive,exclusivity_terms,exclusive_sponsor_id), photos:assets(asset_photos(storage_path,is_cover,position))")
        .eq("property_id", id),
      supabase
        .from("property_events")
        .select("*")
        .eq("property_id", id)
        .order("starts_at", { ascending: true }),
      supabase
        .from("contracts")
        .select("id, title, brand, total_value, status, start_date, end_date, sponsor_id")
        .eq("property_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("proposals")
        .select("id, title, brand, total_value, status, created_at, sent_at")
        .eq("property_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (!prop) {
      toast.error("Propriedade não encontrada");
      navigate("/dashboard/propriedades");
      return;
    }

    setProperty(prop as Property);
    setPubForm({
      public_slug: (prop as any).public_slug ?? "",
      is_published: (prop as any).is_published ?? false,
      public_headline: (prop as any).public_headline ?? "",
      public_about: (prop as any).public_about ?? "",
    });

    // Carrega leads
    const { data: leadsData } = await supabase
      .from("property_leads")
      .select("*")
      .eq("property_id", id)
      .order("created_at", { ascending: false });
    setLeads((leadsData as Lead[]) ?? []);

    // Carrega checklist
    const { data: checklistData } = await supabase
      .from("property_checklist_items")
      .select("id, status, due_date, title")
      .eq("property_id", id);
    setChecklistItems((checklistData as any[]) ?? []);

    // Carrega entregas da propriedade (para o mapa de ativos)
    const { data: deliveriesData } = await supabase
      .from("deliveries")
      .select("id, title, status, asset_type, due_date, brand, sponsor_id, sponsors(id, name)")
      .eq("property_id", id);
    setAssetDeliveries((deliveriesData as any[]) ?? []);



    // Carrega temporadas (mesma raiz)
    const rootId = (prop as Property).parent_property_id ?? prop.id;
    const { data: seasonsData } = await supabase
      .from("sports_properties")
      .select("*")
      .or(`id.eq.${rootId},parent_property_id.eq.${rootId}`)
      .order("season_year", { ascending: false, nullsFirst: false });
    setSeasons((seasonsData as Property[]) ?? []);

    // tier_assets map
    const taMap: Record<string, string[]> = {};
    const qtyMap: Record<string, Record<string, number>> = {};
    (tierAssetsData ?? []).forEach((row: any) => {
      taMap[row.tier_id] = taMap[row.tier_id] ?? [];
      taMap[row.tier_id].push(row.asset_id);
      qtyMap[row.tier_id] = qtyMap[row.tier_id] ?? {};
      qtyMap[row.tier_id][row.asset_id] = Number(row.quantity) || 1;
    });
    setTierAssetsMap(taMap);
    setTierAssetQtyMap(qtyMap);

    // tiers + filtro de vendas dessa propriedade
    const tiersList = (tiersData as Tier[]) ?? [];
    const tierIds = new Set(tiersList.map((t) => t.id));
    const propSales = (salesData as TierSale[] ?? []).filter((s) => tierIds.has(s.tier_id));
    setTierSales(propSales);

    const tiersWithCounts = tiersList.map((t) => ({
      ...t,
      sales_count: propSales.filter((s) => s.tier_id === t.id).length,
      assets_count: (taMap[t.id] ?? []).length,
    }));
    setTiers(tiersWithCounts);

    // assets alocados + status venda
    const soldAssetIds = new Set<string>();
    propSales.forEach((s) => {
      (taMap[s.tier_id] ?? []).forEach((aid) => soldAssetIds.add(aid));
    });
    const tieredAssetIds = new Set<string>();
    tiersList.forEach((t) => (taMap[t.id] ?? []).forEach((aid) => tieredAssetIds.add(aid)));

    const mapped: AllocatedAsset[] = (allocData ?? []).map((row: any) => {
      const photos = row.photos?.asset_photos ?? [];
      const cover =
        photos.find((ph: any) => ph.is_cover) ??
        [...photos].sort((a: any, b: any) => a.position - b.position)[0];
      const url = cover
        ? supabase.storage.from("asset-photos").getPublicUrl(cover.storage_path).data.publicUrl
        : null;
      return {
        id: row.asset.id,
        name: row.asset.name,
        category: row.asset.category,
        unit_value: Number(row.asset.unit_value),
        quantity: row.asset.quantity,
        status: row.asset.status,
        cover_url: url,
        in_tier: tieredAssetIds.has(row.asset.id),
        sold: soldAssetIds.has(row.asset.id),
        is_exclusive: Boolean(row.asset.is_exclusive),
        exclusivity_terms: row.asset.exclusivity_terms ?? [],
        exclusive_sponsor_id: row.asset.exclusive_sponsor_id ?? null,
      };
    });
    setAssets(mapped);
    setEvents((eventsData as PropertyEvent[]) ?? []);

    const cTotal = (contractsData ?? []).reduce(
      (s: number, c: any) => s + Number(c.total_value || 0),
      0
    );
    setContractsAgg({ total: cTotal, count: contractsData?.length ?? 0 });
    setContracts((contractsData as ContractRow[]) ?? []);
    setProposals((proposalsData as ProposalRow[]) ?? []);
    setProposalsCount((proposalsData as any[])?.length ?? 0);

    // Patrocinadores ativos: agrega contratos ativos por sponsor + cotas vendidas com sponsor_id
    const activeContracts = ((contractsData as ContractRow[]) ?? []).filter(
      (c) => c.status === "ativo" || c.status === "vencendo"
    );
    const sponsorIds = new Set<string>();
    activeContracts.forEach((c) => c.sponsor_id && sponsorIds.add(c.sponsor_id));
    propSales.forEach((s) => s.sponsor_id && sponsorIds.add(s.sponsor_id));

    if (sponsorIds.size > 0) {
      const { data: sponsorsData } = await supabase
        .from("sponsors")
        .select("id, name, logo_path, segment")
        .in("id", Array.from(sponsorIds));

      const aggregated: ActiveSponsor[] = (sponsorsData ?? []).map((sp: any) => {
        const sContracts = activeContracts.filter((c) => c.sponsor_id === sp.id);
        const sTiers = propSales
          .filter((s) => s.sponsor_id === sp.id)
          .map((s) => tiersList.find((t) => t.id === s.tier_id)?.name)
          .filter(Boolean) as string[];
        return {
          id: sp.id,
          name: sp.name,
          logo_url: sp.logo_path
            ? supabase.storage.from("sponsor-logos").getPublicUrl(sp.logo_path).data.publicUrl
            : null,
          segment: sp.segment,
          contracts_count: sContracts.length,
          total_value: sContracts.reduce((sum, c) => sum + Number(c.total_value || 0), 0),
          active_tiers: Array.from(new Set(sTiers)),
        };
      });
      setActiveSponsors(aggregated);
    } else {
      setActiveSponsors([]);
    }

    loadedOnceRef.current = true;
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const tierRevenue = tierSales.reduce((sum, s) => {
      const tier = tiers.find((t) => t.id === s.tier_id);
      return sum + (tier?.value ?? 0);
    }, 0);
    const totalSlots = tiers.reduce((s, t) => s + t.total_slots, 0);
    const soldSlots = tierSales.length;
    const occupancy = totalSlots > 0 ? Math.round((soldSlots / totalSlots) * 100) : 0;
    const potentialRevenue = tiers.reduce((s, t) => s + t.value * t.total_slots, 0);
    return {
      contractedRevenue: contractsAgg.total,
      tierRevenue,
      potentialRevenue,
      occupancy,
      soldSlots,
      totalSlots,
    };
  }, [tiers, tierSales, contractsAgg]);

  // ===== Checklist summary =====
  const checklistSummary = useMemo(() => {
    const total = checklistItems.length;
    const done = checklistItems.filter((c) => c.status === "concluido").length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = checklistItems.filter(
      (c) => c.status !== "concluido" && c.due_date && new Date(c.due_date) < today,
    ).length;
    const pending = total - done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const upcoming = checklistItems
      .filter((c) => c.status !== "concluido")
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .slice(0, 5);
    return { total, done, pending, overdue, pct, upcoming, today };
  }, [checklistItems]);

  // ===== Tier handlers =====
  const openTierDialog = (tier?: Tier) => {
    if (tier) {
      setEditingTier(tier);
      setTierForm({
        name: tier.name,
        level: tier.level,
        value: String(tier.value),
        total_slots: String(tier.total_slots),
        description: tier.description ?? "",
        benefits: tier.benefits ?? "",
        color: tier.color,
        selectedAssets: tierAssetsMap[tier.id] ?? [],
        assetQty: tierAssetQtyMap[tier.id] ?? {},
      });
    } else {
      setEditingTier(null);
      setTierForm({
        name: "",
        level: "custom",
        value: "",
        total_slots: "1",
        description: "",
        benefits: "",
        color: "#64748b",
        selectedAssets: [],
        assetQty: {},
      });
    }
    setTierDialogOpen(true);
  };

  const [tierTemplates, setTierTemplates] = useState<TierTemplate[]>(() => loadTierTemplates());
  const [editingTemplates, setEditingTemplates] = useState(false);



  const applyTemplate = (tpl: TierTemplate) => {
    setTierForm((f) => ({ ...f, name: tpl.name, level: tpl.level, color: tpl.color }));
  };

  const renameTemplate = (level: string, name: string) => {
    setTierTemplates((prev) => {
      const next = prev.map((t) => (t.level === level ? { ...t, name } : t));
      try {
        localStorage.setItem(TIER_TEMPLATES_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const resetTemplates = () => {
    try { localStorage.removeItem(TIER_TEMPLATES_KEY); } catch { /* ignore */ }
    setTierTemplates(DEFAULT_TIER_TEMPLATES);
  };


  const saveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;

    const payload = {
      property_id: id,
      owner_id: user.id,
      name: tierForm.name,
      level: tierForm.level,
      value: Number(tierForm.value || 0),
      total_slots: parseInt(tierForm.total_slots) || 1,
      description: tierForm.description || null,
      benefits: tierForm.benefits || null,
      color: tierForm.color,
      position: editingTier?.position ?? tiers.length,
    };

    let tierId = editingTier?.id;
    if (editingTier) {
      const { error } = await supabase
        .from("sponsorship_tiers")
        .update(payload)
        .eq("id", editingTier.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("sponsorship_tiers")
        .insert(payload)
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      tierId = data.id;
    }

    if (tierId) {
      // sync tier_assets
      await supabase.from("tier_assets").delete().eq("tier_id", tierId);
      if (tierForm.selectedAssets.length > 0) {
        await supabase.from("tier_assets").insert(
          tierForm.selectedAssets.map((aid) => ({
            tier_id: tierId!,
            asset_id: aid,
            quantity: Math.max(1, Number(tierForm.assetQty[aid]) || 1),
          }))
        );
      }
    }

    toast.success(editingTier ? "Cota atualizada" : "Cota criada");
    setTierDialogOpen(false);
    loadAll();
  };

  // ===== Edição rápida pelo Mapa das cotas =====
  const openMapAssetEditor = (asset: AllocatedAsset) => {
    const tierQty: Record<string, number> = {};
    tiers.forEach((t) => {
      tierQty[t.id] = tierAssetQtyMap[t.id]?.[asset.id] ?? 0;
    });
    setMapEditForm({
      name: asset.name,
      category: asset.category,
      unit_value: String(asset.unit_value ?? 0),
      quantity: String(asset.quantity ?? 1),
      tierQty,
    });
    setMapEditAsset(asset);
  };

  const saveMapAsset = async () => {
    if (!mapEditAsset) return;
    setMapEditSaving(true);
    try {
      const { error: assetErr } = await supabase
        .from("assets")
        .update({
          name: mapEditForm.name,
          category: mapEditForm.category,
          unit_value: Number(mapEditForm.unit_value || 0),
          quantity: parseInt(mapEditForm.quantity) || 1,
        })
        .eq("id", mapEditAsset.id);
      if (assetErr) throw assetErr;

      for (const t of tiers) {
        const qty = Math.max(0, Number(mapEditForm.tierQty[t.id]) || 0);
        const current = tierAssetQtyMap[t.id]?.[mapEditAsset.id] ?? 0;
        if (qty === current) continue;
        if (qty === 0) {
          const { error } = await supabase
            .from("tier_assets")
            .delete()
            .eq("tier_id", t.id)
            .eq("asset_id", mapEditAsset.id);
          if (error) throw error;
        } else if (current === 0) {
          const { error } = await supabase
            .from("tier_assets")
            .insert({ tier_id: t.id, asset_id: mapEditAsset.id, quantity: qty });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("tier_assets")
            .update({ quantity: qty })
            .eq("tier_id", t.id)
            .eq("asset_id", mapEditAsset.id);
          if (error) throw error;
        }
      }

      toast.success("Ativo atualizado");
      setMapEditAsset(null);
      loadAll();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar ativo");
    } finally {
      setMapEditSaving(false);
    }
  };

  // ===== Copiar / colar a tabela do mapa das cotas =====
  const buildTierMapTSV = () => {
    const header = ["Ativo", "Categoria", "Valor", ...tiers.map((t) => t.name)];
    const rows = [...assets]
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((a) => [
        a.name,
        a.category,
        String(a.unit_value ?? 0).replace(".", ","),
        ...tiers.map((t) => String(tierAssetQtyMap[t.id]?.[a.id] ?? 0)),
      ]);
    const totals = [
      "Total por cota",
      "",
      "",
      ...tiers.map((t) => {
        const qtys = tierAssetQtyMap[t.id] ?? {};
        const total = assets.reduce((s, a) => s + (a.unit_value || 0) * (qtys[a.id] || 0), 0);
        return String(total).replace(".", ",");
      }),
    ];
    return [header, ...rows, totals].map((r) => r.join("\t")).join("\n");
  };

  const copyTierMap = async () => {
    const tsv = buildTierMapTSV();
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success("Tabela copiada — cole no Excel ou Google Sheets");
    } catch {
      setPasteMapText(tsv);
      setPasteMapOpen(true);
      toast.message("Copie o conteúdo abaixo manualmente");
    }
  };

  const exportTierMapXLS = async () => {
    const XLSX = await import("xlsx");
    const header = ["Ativo", "Categoria", "Valor", ...tiers.map((t) => t.name)];
    const rows = [...assets]
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((a) => [
        a.name,
        a.category,
        Number(a.unit_value ?? 0),
        ...tiers.map((t) => tierAssetQtyMap[t.id]?.[a.id] ?? 0),
      ]);
    const totalUnits = [
      "Total de unidades",
      "",
      "",
      ...tiers.map((t) =>
        Object.values(tierAssetQtyMap[t.id] ?? {}).reduce((s, q) => s + (q || 0), 0)
      ),
    ];
    const totalValue = [
      "Total (R$)",
      "",
      "",
      ...tiers.map((t) => {
        const qtys = tierAssetQtyMap[t.id] ?? {};
        return assets.reduce((s, a) => s + (a.unit_value || 0) * (qtys[a.id] || 0), 0);
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, [], totalUnits, totalValue]);
    ws["!cols"] = [{ wch: 38 }, { wch: 20 }, { wch: 14 }, ...tiers.map(() => ({ wch: 14 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapa das cotas");
    const safe = (property?.name ?? "propriedade").replace(/[^\w\- ]+/g, "").trim() || "propriedade";
    XLSX.writeFile(wb, `mapa-cotas-${safe}.xlsx`);
    toast.success("Planilha exportada");
  };

  // ===== Exportação do Mapa de Ativos (XLS / PDF) =====
  const assetMapRows = () =>
    filteredMapAssets.map((a) => {
      const groups = deliveryInfoFor(a) ?? [];
      const statusLabel = a.sold ? "Vendido" : a.in_tier ? "Em cota" : "Disponível";
      return {
        asset: a,
        statusLabel,
        exclusive: a.is_exclusive ? "Sim" : "Não",
        terms: (a.exclusivity_terms ?? []).join(", "),
        groups: groups.map((g) => ({
          sponsor: g.label,
          status: (DELIVERY_STATUS_META[g.worst.status] ?? DELIVERY_STATUS_META.pendente).label,
          progress: `${g.done}/${g.total}`,
          url: `${window.location.origin}/dashboard/entregas?delivery=${g.worst.id}`,
        })),
      };
    });

  const exportAssetMapXLS = async () => {
    const rows = assetMapRows();
    if (rows.length === 0) return toast.error("Nenhum ativo para exportar");
    const XLSX = await import("xlsx");
    const header = [
      "Ativo",
      "Categoria",
      "Quantidade",
      ...(mapShowValues ? ["Valor unitário", "Valor total"] : []),
      "Status do ativo",
      "Exclusivo",
      "Termos de exclusividade",
      "Patrocinador",
      "Status da entrega",
      "Progresso",
      "Link da entrega",
    ];
    const body: any[][] = [];
    rows.forEach((r) => {
      const base = [
        r.asset.name,
        r.asset.category,
        Number(r.asset.quantity ?? 0),
        ...(mapShowValues
          ? [Number(r.asset.unit_value ?? 0), Number(r.asset.unit_value ?? 0) * Number(r.asset.quantity ?? 0)]
          : []),
        r.statusLabel,
        r.exclusive,
        r.terms,
      ];
      if (r.groups.length === 0) body.push([...base, "—", "Sem entrega", "", ""]);
      else r.groups.forEach((g) => body.push([...base, g.sponsor, g.status, g.progress, g.url]));
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = header.map((h, i) => ({ wch: i === 0 ? 38 : h.length + 8 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mapa de ativos");
    const safe = (property?.name ?? "propriedade").replace(/[^\w\- ]+/g, "").trim() || "propriedade";
    XLSX.writeFile(wb, `mapa-ativos-${safe}.xlsx`);
    toast.success("Planilha exportada");
  };

  const exportAssetMapPDF = () => {
    const rows = assetMapRows();
    if (rows.length === 0) return toast.error("Nenhum ativo para exportar");
    const esc = (s: string) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const money = (n: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

    const trs = rows
      .map((r) => {
        const deliveries =
          r.groups.length === 0
            ? '<span class="muted">Sem entrega</span>'
            : r.groups
                .map(
                  (g) =>
                    `<div class="dv"><a href="${esc(g.url)}">${esc(g.sponsor)}</a> — <b>${esc(
                      g.status
                    )}</b> <span class="muted">(${esc(g.progress)})</span></div>`
                )
                .join("");
        return `<tr class="${r.asset.is_exclusive ? "excl" : ""}">
          <td><b>${esc(r.asset.name)}</b>${
            r.terms ? `<div class="muted">${esc(r.terms)}</div>` : ""
          }</td>
          <td>${esc(r.asset.category)}</td>
          <td class="c">${r.asset.quantity ?? 0}</td>
          ${
            mapShowValues
              ? `<td class="r">${money(Number(r.asset.unit_value ?? 0))}</td><td class="r">${money(
                  Number(r.asset.unit_value ?? 0) * Number(r.asset.quantity ?? 0)
                )}</td>`
              : ""
          }
          <td class="c">${esc(r.statusLabel)}</td>
          <td class="c">${r.asset.is_exclusive ? "★ Sim" : "Não"}</td>
          <td>${deliveries}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
      <title>Mapa de ativos — ${esc(property?.name ?? "")}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; color: #111827; font-size: 11px; }
        h1 { font-size: 18px; margin: 0 0 2px; }
        .sub { color: #6b7280; font-size: 11px; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; text-align: left; }
        th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        td.c { text-align: center; } td.r { text-align: right; }
        .muted { color: #6b7280; font-size: 10px; }
        tr.excl td { background: #fffbeb; }
        a { color: #1d4ed8; text-decoration: none; }
        .dv { margin-bottom: 2px; }
      </style></head><body>
      <h1>Mapa de ativos</h1>
      <div class="sub">${esc(property?.name ?? "")} · ${rows.length} ativo(s) · gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <table><thead><tr>
        <th>Ativo</th><th>Categoria</th><th>Qtd</th>
        ${mapShowValues ? "<th>Valor unit.</th><th>Valor total</th>" : ""}
        <th>Status</th><th>Exclusivo</th><th>Entregas (patrocinador · status)</th>
      </tr></thead><tbody>${trs}</tbody></table>
      <script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script>
      </body></html>`;

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return toast.error("Permita pop-ups para gerar o PDF");
    win.document.write(html);
    win.document.close();
  };




  const parseNum = (v: string) => {
    const s = (v ?? "").trim().replace(/[^\d,.-]/g, "");
    if (!s) return 0;
    const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    return Number(norm) || 0;
  };

  const applyPastedTierMap = async () => {
    const lines = pasteMapText.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return toast.error("Cole a tabela com cabeçalho e linhas");
    const split = (l: string) => (l.includes("\t") ? l.split("\t") : l.split(";"));
    const header = split(lines[0]).map((h) => h.trim().toLowerCase());
    const tierCols: { tierId: string; index: number }[] = [];
    tiers.forEach((t) => {
      const idx = header.findIndex((h) => h === t.name.trim().toLowerCase());
      if (idx >= 0) tierCols.push({ tierId: t.id, index: idx });
    });
    if (tierCols.length === 0) return toast.error("Nenhuma cota reconhecida no cabeçalho");
    const valueIdx = header.findIndex((h) => h.startsWith("valor"));

    setPasteMapSaving(true);
    try {
      let updated = 0;
      const notFound: string[] = [];
      for (const line of lines.slice(1)) {
        const cells = split(line);
        const name = (cells[0] ?? "").trim();
        if (!name || name.toLowerCase().startsWith("total")) continue;
        const asset = assets.find((a) => a.name.trim().toLowerCase() === name.toLowerCase());
        if (!asset) {
          notFound.push(name);
          continue;
        }
        if (valueIdx >= 0 && (cells[valueIdx] ?? "").trim()) {
          const val = parseNum(cells[valueIdx]);
          if (val !== (asset.unit_value ?? 0)) {
            await supabase.from("assets").update({ unit_value: val }).eq("id", asset.id);
          }
        }
        for (const { tierId, index } of tierCols) {
          const raw = (cells[index] ?? "").trim().toLowerCase();
          const qty = ["x", "-", "", "0", "✕", "✗"].includes(raw)
            ? 0
            : ["✓", "v", "sim", "check", "true"].includes(raw)
              ? 1
              : Math.max(0, Math.round(parseNum(raw)));
          const current = tierAssetQtyMap[tierId]?.[asset.id] ?? 0;
          if (qty === current) continue;
          if (qty === 0) {
            await supabase.from("tier_assets").delete().eq("tier_id", tierId).eq("asset_id", asset.id);
          } else if (current === 0) {
            await supabase.from("tier_assets").insert({ tier_id: tierId, asset_id: asset.id, quantity: qty });
          } else {
            await supabase
              .from("tier_assets")
              .update({ quantity: qty })
              .eq("tier_id", tierId)
              .eq("asset_id", asset.id);
          }
        }
        updated++;
      }
      toast.success(
        `${updated} ativo(s) atualizado(s)${notFound.length ? ` · ${notFound.length} não encontrado(s)` : ""}`
      );
      setPasteMapOpen(false);
      setPasteMapText("");
      loadAll();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao aplicar tabela");
    } finally {
      setPasteMapSaving(false);
    }
  };



  const deleteTier = async (tierId: string) => {
    if (!confirm("Excluir esta cota? Vendas associadas serão removidas.")) return;
    const { error } = await supabase.from("sponsorship_tiers").delete().eq("id", tierId);
    if (error) return toast.error(error.message);
    toast.success("Cota excluída");
    loadAll();
  };

  const reserveSlot = async (tier: Tier, brand: string) => {
    if (!user || !brand.trim()) return;
    const { error } = await supabase.from("tier_sales").insert({
      tier_id: tier.id,
      owner_id: user.id,
      brand: brand.trim(),
      status: "vendida",
    });
    if (error) return toast.error(error.message);
    toast.success(`Vaga reservada em ${tier.name}`);
    loadAll();
  };

  const releaseSlot = async (saleId: string) => {
    const { error } = await supabase.from("tier_sales").delete().eq("id", saleId);
    if (error) return toast.error(error.message);
    toast.success("Vaga liberada");
    loadAll();
  };

  // ===== Event handlers =====
  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    const { error } = await supabase.from("property_events").insert({
      property_id: id,
      owner_id: user.id,
      title: eventForm.title,
      event_type: eventForm.event_type,
      starts_at: new Date(eventForm.starts_at).toISOString(),
      ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : null,
      location: eventForm.location || null,
      description: eventForm.description || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Evento adicionado");
    setEventDialogOpen(false);
    setEventForm({
      title: "",
      event_type: "jogo",
      starts_at: "",
      ends_at: "",
      location: "",
      description: "",
    });
    loadAll();
  };

  const deleteEvent = async (evId: string) => {
    if (!confirm("Excluir este evento?")) return;
    const { error } = await supabase.from("property_events").delete().eq("id", evId);
    if (error) return toast.error(error.message);
    toast.success("Evento excluído");
    loadAll();
  };

  // ===== Public page handler =====
  const savePublicSettings = async () => {
    if (!id) return;
    if (pubForm.is_published && !pubForm.public_slug.trim()) {
      toast.error("Defina uma URL personalizada antes de publicar.");
      return;
    }
    setSavingPub(true);
    const { error } = await supabase
      .from("sports_properties")
      .update({
        public_slug: pubForm.public_slug.trim() || null,
        is_published: pubForm.is_published,
        public_headline: pubForm.public_headline.trim() || null,
        public_about: pubForm.public_about.trim() || null,
      })
      .eq("id", id);
    setSavingPub(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Esta URL já está em uso. Escolha outra.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success(pubForm.is_published ? "Página publicada!" : "Configurações salvas");
    loadAll();
  };

  // ===== Season handlers =====
  const createSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !property) return;
    const rootId = property.parent_property_id ?? property.id;
    const { data, error } = await supabase
      .from("sports_properties")
      .insert({
        owner_id: user.id,
        name: seasonForm.name || `${property.name} ${seasonForm.season_year}`,
        category: property.category,
        status: "planejamento",
        start_date: seasonForm.start_date || null,
        end_date: seasonForm.end_date || null,
        parent_property_id: rootId,
        season_year: seasonForm.season_year,
      })
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Nova edição criada");
    setSeasonDialogOpen(false);
    navigate(`/dashboard/propriedades/${data.id}`);
  };

  if (loading || !property) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const upcomingEvents = events.filter((e) => new Date(e.starts_at) >= new Date());
  const pastEvents = events.filter((e) => new Date(e.starts_at) < new Date());

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* HEADER */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/propriedades")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-12 w-12 rounded-lg bg-gradient-brand text-primary-foreground flex items-center justify-center">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{property.name}</h1>
              <p className="text-sm text-muted-foreground">
                {property.category}
                {property.season_year && ` · Temporada ${property.season_year}`}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto">{property.status}</Badge>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Visão rápida da propriedade</p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => setKpisVisible((v) => !v)}
            aria-label={kpisVisible ? "Ocultar KPIs" : "Mostrar KPIs"}
          >
            {kpisVisible ? (
              <>
                <EyeOff className="h-4 w-4" /> Ocultar
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" /> Mostrar
              </>
            )}
          </Button>
        </div>
        {kpisVisible && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" /> Receita contratada
                </div>
                <div className="text-2xl font-bold mt-1">{fmtBRL(kpis.contractedRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">{contractsAgg.count} contrato(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Crown className="h-3.5 w-3.5" /> Receita por cotas
                </div>
                <div className="text-2xl font-bold mt-1">{fmtBRL(kpis.tierRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  de {fmtBRL(kpis.potentialRevenue)} potencial
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> Ocupação de cotas
                </div>
                <div className="text-2xl font-bold mt-1">{kpis.occupancy}%</div>
                <Progress value={kpis.occupancy} className="h-1.5 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {kpis.soldSlots}/{kpis.totalSlots} vagas
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Público estimado
                </div>
                <div className="text-2xl font-bold mt-1">
                  {property.audience_estimate?.toLocaleString("pt-BR") ?? "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {proposalsCount} proposta(s)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" /> Checklist
                </div>
                <div className="text-2xl font-bold mt-1">{checklistSummary.pct}%</div>
                <Progress value={checklistSummary.pct} className="h-1.5 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {checklistSummary.done}/{checklistSummary.total} concluídas
                  {checklistSummary.overdue > 0 && (
                    <span className="text-destructive"> · {checklistSummary.overdue} atrasada(s)</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard">Visão geral</TabsTrigger>
          <TabsTrigger value="tiers">Cotas</TabsTrigger>
          <TabsTrigger value="assets">Mapa de ativos</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="seasons">Temporadas</TabsTrigger>
          <TabsTrigger value="proposals">
            <FileText className="h-3.5 w-3.5 mr-1" />
            Propostas {proposals.length > 0 && <Badge variant="secondary" className="ml-1.5">{proposals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="contracts">
            <FileSignature className="h-3.5 w-3.5 mr-1" />
            Contratos {contracts.length > 0 && <Badge variant="secondary" className="ml-1.5">{contracts.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sponsors">
            <Building2 className="h-3.5 w-3.5 mr-1" />
            Patrocinadores {activeSponsors.length > 0 && <Badge variant="secondary" className="ml-1.5">{activeSponsors.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="gallery">
            <ImageIcon className="h-3.5 w-3.5 mr-1" />
            Galeria
          </TabsTrigger>
          <TabsTrigger value="checklist">
            <ListChecks className="h-3.5 w-3.5 mr-1" />
            Checklist
          </TabsTrigger>
          <TabsTrigger value="public">
            <Globe className="h-3.5 w-3.5 mr-1" />
            Página pública
          </TabsTrigger>
          <TabsTrigger value="leads">
            <Inbox className="h-3.5 w-3.5 mr-1" />
            Leads {leads.length > 0 && <Badge variant="secondary" className="ml-1.5">{leads.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="about">Sobre &amp; Dados</TabsTrigger>
        </TabsList>

        {/* SOBRE & DADOS */}
        <TabsContent value="about" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Sobre</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {property?.about || "Sem descrição. Edite a propriedade para adicionar."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Principais dados</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Locais</p>
                {(property?.locations ?? []).length ? (
                  <div className="flex flex-wrap gap-1">
                    {(property?.locations ?? []).map((l) => (
                      <Badge key={l} variant="secondary">{l}</Badge>
                    ))}
                  </div>
                ) : <p className="text-sm">—</p>}
              </div>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Local da final", value: property?.final_location || "—" },
                  { label: "Torcedores", value: property?.fans_count != null ? new Intl.NumberFormat("pt-BR").format(Number(property.fans_count)) : "—" },
                  { label: "Premiação", value: property?.prize_pool != null ? fmtBRL(Number(property.prize_pool)) : "—" },
                  { label: "Participantes", value: property?.participants_count != null ? new Intl.NumberFormat("pt-BR").format(Number(property.participants_count)) : "—" },
                  { label: "Times", value: property?.teams_count != null ? new Intl.NumberFormat("pt-BR").format(Number(property.teams_count)) : "—" },
                ].map((k) => (
                  <div key={k.label} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-sm font-semibold break-words">{k.value}</p>
                  </div>
                ))}
              </div>
              {property?.key_notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{property.key_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <SponsorSocialDashboard
            links={(property?.social_links ?? {}) as Record<string, string>}
            stats={(property?.social_stats ?? {}) as Record<string, any>}
          />
        </TabsContent>


        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" /> Próximos eventos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento agendado.</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.slice(0, 5).map((e) => (
                      <div key={e.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/40">
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{e.title}</p>
                          <p className="text-xs text-muted-foreground">{fmtDateTime(e.starts_at)}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">{e.event_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Crown className="h-4 w-4" /> Status das cotas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tiers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma cota cadastrada.</p>
                ) : (
                  <div className="space-y-3">
                    {tiers.map((t) => {
                      const sold = t.sales_count ?? 0;
                      const pct = t.total_slots > 0 ? (sold / t.total_slots) * 100 : 0;
                      return (
                        <div key={t.id}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: t.color }}
                              />
                              <span className="font-medium">{t.name}</span>
                            </div>
                            <span className="text-muted-foreground">
                              {sold}/{t.total_slots}
                            </span>
                          </div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> Resumo do checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checklistSummary.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma tarefa cadastrada no checklist desta propriedade.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{checklistSummary.pct}% concluído</span>
                    <span className="text-muted-foreground">
                      {checklistSummary.done} de {checklistSummary.total}
                    </span>
                  </div>
                  <Progress value={checklistSummary.pct} className="h-2" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Concluídas</p>
                      <p className="text-xl font-bold text-emerald-600">{checklistSummary.done}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                      <p className="text-xl font-bold">{checklistSummary.pending}</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">Atrasadas</p>
                      <p
                        className={`text-xl font-bold ${
                          checklistSummary.overdue > 0 ? "text-destructive" : ""
                        }`}
                      >
                        {checklistSummary.overdue}
                      </p>
                    </div>
                  </div>

                  {checklistSummary.upcoming.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Próximas tarefas
                      </p>
                      <ul className="space-y-1.5">
                        {checklistSummary.upcoming.map((item) => {
                          const isOverdue =
                            item.due_date && new Date(item.due_date) < checklistSummary.today;
                          return (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm"
                            >
                              <span className="truncate">{item.title}</span>
                              <span
                                className={`shrink-0 text-xs ${
                                  isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                                }`}
                              >
                                {item.due_date ? fmtDate(item.due_date) : "Sem data"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {property.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sobre a propriedade</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{property.description}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Início</Label>
                    <div>{fmtDate(property.start_date)}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fim</Label>
                    <div>{fmtDate(property.end_date)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TIERS */}
        <TabsContent value="tiers" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pacotes de patrocínio com ativos inclusos e vagas disponíveis.
            </p>
            <Button onClick={() => openTierDialog()} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nova cota
            </Button>
          </div>

          {tiers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Crown className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Crie cotas (Master, Ouro, Prata...) para estruturar a comercialização.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {tiers.map((t) => {
                const sold = t.sales_count ?? 0;
                const available = t.total_slots - sold;
                const pct = t.total_slots > 0 ? (sold / t.total_slots) * 100 : 0;
                const sales = tierSales.filter((s) => s.tier_id === t.id);
                return (
                  <Card key={t.id} className="border-l-4" style={{ borderLeftColor: t.color }}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4" style={{ color: t.color }} />
                            <h3 className="font-semibold">{t.name}</h3>
                          </div>
                          <p className="text-2xl font-bold mt-1">{fmtBRL(t.value)}</p>
                          <p className="text-xs text-muted-foreground">por vaga</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openTierDialog(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteTier(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Disponibilidade</span>
                          <span className={available === 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                            {available === 0 ? "Esgotada" : `${available} vaga(s) livre(s)`}
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {sold}/{t.total_slots} vendidas · {t.assets_count} ativo(s) inclusos
                        </p>
                      </div>

                      {t.benefits && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.benefits}</p>
                      )}

                      {sales.length > 0 && (
                        <div className="space-y-1 pt-2 border-t">
                          {sales.map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-xs">
                              <span className="font-medium">{s.brand ?? "—"}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-destructive hover:text-destructive"
                                onClick={() => releaseSlot(s.id)}
                              >
                                Liberar
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {available > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="outline" className="w-full">
                              <Plus className="h-3.5 w-3.5 mr-1" /> Vender vaga
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64">
                            <form
                              onSubmit={(ev) => {
                                ev.preventDefault();
                                const fd = new FormData(ev.currentTarget);
                                reserveSlot(t, String(fd.get("brand") ?? ""));
                                (ev.target as HTMLFormElement).reset();
                              }}
                              className="space-y-2"
                            >
                              <Label className="text-xs">Marca / patrocinador</Label>
                              <Input name="brand" required placeholder="Nome da marca" autoFocus />
                              <Button type="submit" size="sm" className="w-full">
                                Confirmar venda
                              </Button>
                            </form>
                          </PopoverContent>
                        </Popover>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* MAPA DAS COTAS */}
          {tiers.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Mapa das cotas</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Quais ativos cadastrados cada cota utiliza.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={copyTierMap}>
                    <Copy className="h-4 w-4 mr-1.5" />
                    Copiar
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportTierMapXLS}>
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                    XLS
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPasteMapText("");
                      setPasteMapOpen(true);
                    }}
                  >
                    <ClipboardPaste className="h-4 w-4 mr-1.5" />
                    Colar
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowTierMap((v) => !v)}>
                    {showTierMap ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
              {showTierMap && (
                <CardContent className="space-y-4">
                  {assets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum ativo alocado nesta propriedade.
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left font-medium py-2 pr-3 min-w-[240px]">Ativo</th>
                              <th className="text-right font-medium py-2 pr-3 whitespace-nowrap">Valor</th>
                              {tiers.map((t) => (
                                <th key={t.id} className="py-2 px-2 text-center font-medium whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                                    {t.name}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(
                              [...assets]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .reduce<Record<string, AllocatedAsset[]>>((acc, a) => {
                                (acc[a.category] = acc[a.category] ?? []).push(a);
                                return acc;
                              }, {})
                            ).map(([category, list]) => (
                              <Fragment key={category}>
                                <tr className="bg-muted/50">
                                  <td colSpan={2 + tiers.length} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {category} ({list.length})
                                  </td>
                                </tr>
                                {list.map((a) => {
                                  const usedBy = tiers.filter((t) => (tierAssetsMap[t.id] ?? []).includes(a.id));
                                  return (
                                    <tr
                                      key={a.id}
                                      className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                                      onClick={() => openMapAssetEditor(a)}
                                      title="Clique para editar o ativo e as quantidades por cota"
                                    >
                                      <td className="py-1.5 pr-3">
                                        <span className={usedBy.length === 0 ? "text-muted-foreground" : ""}>{a.name}</span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-right tabular-nums whitespace-nowrap">
                                        {fmtBRL(a.unit_value)}
                                      </td>
                                      {tiers.map((t) => {
                                        const qty = tierAssetQtyMap[t.id]?.[a.id] ?? 0;
                                        return (
                                          <td key={t.id} className="py-1.5 px-2 text-center">

                                            {qty > 1 ? (
                                              <span
                                                className="inline-flex min-w-6 items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums"
                                                style={{ background: t.color }}
                                              >
                                                {qty}
                                              </span>
                                            ) : qty === 1 ? (
                                              <Check className="h-4 w-4 mx-auto" style={{ color: t.color }} />
                                            ) : (
                                              <X className="h-4 w-4 mx-auto text-muted-foreground/40" />
                                            )}
                                          </td>

                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t font-medium">
                              <td className="py-2 pr-3">Total por cota</td>
                              <td />
                              {tiers.map((t) => {
                                const qtys = tierAssetQtyMap[t.id] ?? {};
                                const ids = Object.keys(qtys);
                                const units = ids.reduce((s, aid) => s + (qtys[aid] || 0), 0);
                                const total = assets
                                  .filter((a) => ids.includes(a.id))
                                  .reduce((s, a) => s + (a.unit_value || 0) * (qtys[a.id] || 0), 0);
                                return (
                                  <td key={t.id} className="py-2 px-2 text-center text-xs whitespace-nowrap">
                                    {ids.length} ativo(s) · {units} un.
                                    <br />
                                    <span className="text-muted-foreground">{fmtBRL(total)}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {(() => {
                        const usedIds = new Set(Object.values(tierAssetsMap).flat());
                        const orphan = assets.filter((a) => !usedIds.has(a.id));
                        return orphan.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            <strong>{orphan.length}</strong> ativo(s) não estão em nenhuma cota.
                          </p>
                        ) : null;
                      })()}
                      <p className="text-xs text-muted-foreground">
                        Clique em qualquer linha para editar o ativo e as quantidades por cota.
                      </p>
                    </>
                  )}
                </CardContent>
              )}
            </Card>
          )}


        </TabsContent>


        {/* ASSETS MAP */}
        <TabsContent value="assets" className="space-y-4 mt-4">
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Disponível
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Em cota
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Vendido
            </span>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ativo..."
                value={mapSearch}
                onChange={(e) => setMapSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={mapCategory} onValueChange={setMapCategory}>
              <SelectTrigger className="w-[170px] h-9">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {mapCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mapStatus} onValueChange={setMapStatus}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="livre">Disponível</SelectItem>
                <SelectItem value="in_tier">Em cota</SelectItem>
                <SelectItem value="sold">Vendido</SelectItem>
                <SelectItem value="exclusive">Exclusivos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={mapSort} onValueChange={setMapSort}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
                <SelectItem value="category">Categoria</SelectItem>
                <SelectItem value="value_desc">Maior valor</SelectItem>
                <SelectItem value="value_asc">Menor valor</SelectItem>
                <SelectItem value="quantity_desc">Maior quantidade</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center border rounded-md">
              {([
                ["grid", LayoutGrid],
                ["list", ListIcon],
                ["compact", Rows3],
              ] as const).map(([mode, Icon]) => (
                <Button
                  key={mode}
                  variant={mapView === mode ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => {
                    setMapView(mode);
                    localStorage.setItem("propertyAssetsView", mode);
                  }}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
            <Button
              variant={mapShowValues ? "outline" : "secondary"}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                const next = !mapShowValues;
                setMapShowValues(next);
                localStorage.setItem("propertyAssetsShowValues", String(next));
              }}
            >
              {mapShowValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {mapShowValues ? "Ocultar valores" : "Mostrar valores"}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportAssetMapXLS}>
              <FileSpreadsheet className="h-4 w-4" />
              XLS
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportAssetMapPDF}>
              <FileDown className="h-4 w-4" />
              PDF
            </Button>

          </div>

          {assets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                <Boxes className="h-10 w-10 mx-auto mb-3 opacity-50" />
                Nenhum ativo alocado. Vá em <strong>Ativos</strong> para alocar.
              </CardContent>
            </Card>
          ) : filteredMapAssets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum ativo encontrado com os filtros atuais.
              </CardContent>
            </Card>
          ) : (
            <>
              {Object.entries(
                filteredMapAssets.reduce<Record<string, AllocatedAsset[]>>((acc, a) => {
                  (acc[a.category] = acc[a.category] ?? []).push(a);
                  return acc;
                }, {})
              ).map(([category, list]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    {category} <span className="text-xs">({list.length})</span>
                  </h3>

                  {mapView === "grid" && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {list.map((a) => {
                        const dot = a.sold
                          ? "bg-destructive"
                          : a.in_tier
                          ? "bg-primary"
                          : "bg-emerald-500";
                        return (
                          <Card
                            key={a.id}
                            onClick={() => openMapAssetEditor(a)}
                            title="Clique para editar o ativo e as quantidades por cota"
                            className={`relative overflow-hidden cursor-pointer ${
                              a.sold ? "opacity-60" : ""
                            } ${
                              a.is_exclusive ? "ring-2 ring-amber-500/60 border-amber-500/40 bg-amber-500/[0.04]" : ""
                            } hover:shadow-md transition`}
                          >
                            <div className="aspect-video bg-muted overflow-hidden">
                              {a.cover_url ? (
                                <img
                                  src={a.cover_url}
                                  alt={a.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full">
                                  <Boxes className="h-8 w-8 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <span
                              className={`absolute top-2 right-2 h-3 w-3 rounded-full ${dot} ring-2 ring-background`}
                            />
                            <CardContent className="p-3">
                              <p className="font-medium text-sm truncate">{a.name}</p>
                              {mapShowValues && (
                                <p className="text-xs text-muted-foreground">{fmtBRL(a.unit_value)}</p>
                              )}
                              <div className="flex gap-1 mt-2 flex-wrap items-center">
                                {a.is_exclusive && (
                                  <Badge
                                    className="text-[10px] px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
                                    variant="outline"
                                    title={(a.exclusivity_terms ?? []).join(", ") || "Ativo exclusivo"}
                                  >
                                    <Crown className="h-2.5 w-2.5 mr-1" /> Exclusivo
                                  </Badge>
                                )}
                                {a.sold && <Badge variant="destructive" className="text-[10px] px-1.5">Vendido</Badge>}
                                {a.in_tier && !a.sold && (
                                  <Badge variant="default" className="text-[10px] px-1.5">Em cota</Badge>
                                )}
                                {!a.in_tier && !a.sold && (
                                  <Badge variant="outline" className="text-[10px] px-1.5">Livre</Badge>
                                )}
                              </div>
                              <div className="mt-2 pt-2 border-t flex items-center gap-1.5">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Entrega</span>
                                <AssetDeliveryCell asset={a} />
                              </div>

                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {mapView === "list" && (
                    <div className="border rounded-md divide-y">
                      {list.map((a) => (
                        <div key={a.id} onClick={() => openMapAssetEditor(a)} title="Clique para editar o ativo e as quantidades por cota" className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 transition ${a.sold ? "opacity-60" : ""} ${a.is_exclusive ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500" : ""}`}>
                          <div className="h-10 w-14 rounded bg-muted overflow-hidden shrink-0">
                            {a.cover_url ? (
                              <img src={a.cover_url} alt={a.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <Boxes className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1">
                              {a.is_exclusive && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                              <span className="truncate">{a.name}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {a.category} · Qtd {a.quantity}
                            </p>
                          </div>
                          {mapShowValues && (
                            <span className="text-sm tabular-nums">{fmtBRL(a.unit_value)}</span>
                          )}
                          <div className="w-[150px] shrink-0 text-right">
                            <AssetDeliveryCell asset={a} />
                          </div>
                          {a.is_exclusive && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
                              title={(a.exclusivity_terms ?? []).join(", ") || "Ativo exclusivo"}
                            >
                              <Crown className="h-2.5 w-2.5 mr-1" /> Exclusivo
                            </Badge>
                          )}
                          {a.sold ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5">Vendido</Badge>
                          ) : a.in_tier ? (
                            <Badge variant="default" className="text-[10px] px-1.5">Em cota</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5">Livre</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {mapView === "compact" && (
                    <div className="border rounded-md divide-y">
                      {list.map((a) => (
                        <div key={a.id} onClick={() => openMapAssetEditor(a)} title="Clique para editar o ativo e as quantidades por cota" className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted/50 transition ${a.sold ? "opacity-60" : ""} ${a.is_exclusive ? "bg-amber-500/[0.06] border-l-2 border-l-amber-500" : ""}`}>
                          <span
                            className={`h-2 w-2 rounded-full shrink-0 ${
                              a.sold ? "bg-destructive" : a.in_tier ? "bg-primary" : "bg-emerald-500"
                            }`}
                          />
                          {a.is_exclusive && (
                            <Crown className="h-3 w-3 text-amber-500 shrink-0" aria-label="Ativo exclusivo" />
                          )}
                          <span className="flex-1 min-w-0 truncate">{a.name}</span>
                          <span className="text-muted-foreground">×{a.quantity}</span>
                          <AssetDeliveryCell asset={a} compact />
                          {mapShowValues && (
                            <span className="tabular-nums">{fmtBRL(a.unit_value)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </TabsContent>


        {/* AGENDA */}
        <TabsContent value="agenda" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Calendário de jogos, eventos e ativações.
            </p>
            <Button size="sm" onClick={() => setEventDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo evento
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próximos ({upcomingEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada agendado.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-3 border rounded-md">
                      <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 flex-col">
                        <span className="text-[10px] uppercase font-semibold">
                          {new Date(e.starts_at).toLocaleString("pt-BR", { month: "short" })}
                        </span>
                        <span className="text-sm font-bold leading-none">
                          {new Date(e.starts_at).getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{e.title}</p>
                          <Badge variant="outline" className="capitalize text-[10px]">{e.event_type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(e.starts_at)}</p>
                        {e.location && (
                          <p className="text-xs text-muted-foreground">📍 {e.location}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteEvent(e.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {pastEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">
                  Histórico ({pastEvents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {pastEvents.slice(0, 10).map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                      <span>{e.title}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(e.starts_at)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SEASONS */}
        <TabsContent value="seasons" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Edições anteriores e futuras desta propriedade.
            </p>
            <Button size="sm" onClick={() => setSeasonDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova edição
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {seasons.map((s) => (
              <Card
                key={s.id}
                onClick={() => s.id !== property.id && navigate(`/dashboard/propriedades/${s.id}`)}
                className={`cursor-pointer hover:border-primary/40 transition ${
                  s.id === property.id ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{s.season_year ?? "—"}</span>
                    {s.id === property.id && <Badge variant="default" className="ml-auto">Atual</Badge>}
                  </div>
                  <p className="font-medium text-sm mt-2 truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                  </p>
                  <Badge variant="outline" className="mt-2 text-[10px]">{s.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* PUBLIC PAGE */}
        <TabsContent value="public" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4" /> Página pública (Media Kit)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div>
                  <p className="font-medium text-sm">Publicar página</p>
                  <p className="text-xs text-muted-foreground">
                    Quando ativa, qualquer pessoa com o link pode ver e enviar interesse.
                  </p>
                </div>
                <Switch
                  checked={pubForm.is_published}
                  onCheckedChange={(v) => setPubForm({ ...pubForm, is_published: v })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>URL personalizada *</Label>
                <div className="flex gap-2">
                  <div className="flex items-center px-3 border rounded-md bg-muted text-xs text-muted-foreground whitespace-nowrap">
                    {window.location.origin}/p/
                  </div>
                  <Input
                    value={pubForm.public_slug}
                    onChange={(e) =>
                      setPubForm({
                        ...pubForm,
                        public_slug: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-")
                          .replace(/-+/g, "-")
                          .slice(0, 60),
                      })
                    }
                    placeholder="copa-sul-2025"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Apenas letras minúsculas, números e hífen.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Subtítulo / chamada</Label>
                <Input
                  maxLength={200}
                  value={pubForm.public_headline}
                  onChange={(e) => setPubForm({ ...pubForm, public_headline: e.target.value })}
                  placeholder="O maior campeonato de surf do sul do Brasil"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Sobre a propriedade (texto público)</Label>
                <Textarea
                  rows={5}
                  maxLength={2000}
                  value={pubForm.public_about}
                  onChange={(e) => setPubForm({ ...pubForm, public_about: e.target.value })}
                  placeholder="Descreva a propriedade para potenciais patrocinadores..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
                <Button onClick={savePublicSettings} disabled={savingPub}>
                  {savingPub && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar configurações
                </Button>
                {pubForm.is_published && pubForm.public_slug && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/p/${pubForm.public_slug}`);
                        toast.success("Link copiado!");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/p/${pubForm.public_slug}`, "_blank")}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                    </Button>
                  </div>
                )}
              </div>

              {pubForm.is_published && pubForm.public_slug && (
                <div className="p-3 bg-emerald-500/10 text-emerald-700 rounded-md text-sm border border-emerald-500/30">
                  ✅ Página publicada em <strong>{window.location.origin}/p/{pubForm.public_slug}</strong>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEADS */}
        <TabsContent value="leads" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Leads recebidos pela página pública. Cada lead vira automaticamente uma oportunidade no Pipeline.
          </p>
          {leads.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhum lead recebido ainda. Compartilhe o link da página pública.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => {
                const tier = tiers.find((t) => t.id === l.tier_id);
                return (
                  <Card key={l.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{l.contact_name}</p>
                            {l.company && (
                              <Badge variant="outline" className="text-xs">{l.company}</Badge>
                            )}
                            {tier && (
                              <Badge style={{ backgroundColor: tier.color, color: "white" }} className="text-xs">
                                <Crown className="h-3 w-3 mr-1" />
                                {tier.name}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                            <a href={`mailto:${l.email}`} className="hover:underline">📧 {l.email}</a>
                            {l.phone && <span>📞 {l.phone}</span>}
                            {l.budget_range && <span>💰 {l.budget_range}</span>}
                          </div>
                          {l.message && (
                            <p className="text-sm mt-2 p-2 bg-muted/40 rounded">{l.message}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">{fmtDateTime(l.created_at)}</p>
                          {l.created_opportunity_id && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs"
                              onClick={() => navigate("/dashboard/pipeline")}
                            >
                              Ver no Pipeline →
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* PROPOSALS */}
        <TabsContent value="proposals" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Propostas vinculadas a esta propriedade.</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/propostas")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ir para Propostas
            </Button>
          </div>
          {proposals.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhuma proposta vinculada a esta propriedade.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {proposals.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{p.title}</p>
                        <Badge variant="outline" className="capitalize">{p.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {p.brand ?? "—"} · enviada em {fmtDate(p.sent_at)} · criada em {fmtDate(p.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{fmtBRL(Number(p.total_value))}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CONTRACTS */}
        <TabsContent value="contracts" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Contratos vigentes e histórico desta propriedade.</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/contratos")}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ir para Contratos
            </Button>
          </div>
          {contracts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <FileSignature className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhum contrato vinculado.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {contracts.map((c) => (
                <Card key={c.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{c.title}</p>
                        <Badge
                          variant={c.status === "ativo" ? "default" : c.status === "vencendo" ? "secondary" : "outline"}
                          className="capitalize"
                        >
                          {c.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.brand} · {fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{fmtBRL(Number(c.total_value))}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ACTIVE SPONSORS */}
        <TabsContent value="sponsors" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Patrocinadores com contratos ativos ou cotas vendidas nesta propriedade.
          </p>
          {activeSponsors.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              Nenhum patrocinador ativo. Vincule contratos ou cotas a um patrocinador.
            </CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeSponsors.map((sp) => (
                <Card key={sp.id} className="hover:shadow-md transition cursor-pointer"
                  onClick={() => navigate("/dashboard/patrocinadores")}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <LogoFrame src={sp.logo_url} alt={sp.name} size="md" fallback={<Building2 className={`${logoFrameIconClass("md")} text-muted-foreground`} />} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{sp.name}</p>
                        {sp.segment && <p className="text-xs text-muted-foreground truncate">{sp.segment}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Contratos</p>
                        <p className="font-semibold">{sp.contracts_count}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-semibold">{fmtBRL(sp.total_value)}</p>
                      </div>
                    </div>
                    {sp.active_tiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sp.active_tiers.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            <Crown className="h-2.5 w-2.5 mr-1" />{t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* GALLERY */}
        <TabsContent value="gallery" className="space-y-4 mt-4">
          {user && <PropertyMediaGallery propertyId={property.id} ownerId={user.id} />}
        </TabsContent>

        {/* CHECKLIST */}
        <TabsContent value="checklist" className="space-y-4 mt-4">
          {user && <PropertyChecklist propertyId={property.id} ownerId={user.id} />}
        </TabsContent>
      </Tabs>

      {/* Colar tabela do mapa das cotas */}
      <Dialog open={pasteMapOpen} onOpenChange={setPasteMapOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Colar tabela de cotas</DialogTitle>
            <DialogDescription>
              Cole aqui a tabela copiada do Excel/Sheets. A primeira linha deve conter os cabeçalhos:
              Ativo, Categoria, Valor e o nome de cada cota. Use números, "✓" ou "x" nas colunas das cotas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={pasteMapText}
            onChange={(e) => setPasteMapText(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={`Ativo\tCategoria\tValor\t${tiers.map((t) => t.name).join("\t")}`}
          />
          <p className="text-xs text-muted-foreground">
            Os ativos são identificados pelo nome. Quantidade 0 remove o ativo da cota.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteMapOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={applyPastedTierMap} disabled={pasteMapSaving || !pasteMapText.trim()}>
              {pasteMapSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

          {/* Edição rápida de ativo pelo mapa das cotas */}
          <Dialog open={!!mapEditAsset} onOpenChange={(o) => !o && setMapEditAsset(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Editar ativo</DialogTitle>
                <DialogDescription>
                  Altere os dados do ativo e as quantidades em cada cota.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input
                    value={mapEditForm.name}
                    onChange={(e) => setMapEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Input
                      value={mapEditForm.category}
                      onChange={(e) => setMapEditForm((f) => ({ ...f, category: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor unitário</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={mapEditForm.unit_value}
                      onChange={(e) => setMapEditForm((f) => ({ ...f, unit_value: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estoque</Label>
                    <Input
                      type="number"
                      min="1"
                      value={mapEditForm.quantity}
                      onChange={(e) => setMapEditForm((f) => ({ ...f, quantity: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Quantidade por cota</Label>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {tiers.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 rounded border p-2">
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                          {t.name}
                        </span>
                        <Input
                          type="number"
                          min="0"
                          className="w-20 h-8 text-center"
                          value={mapEditForm.tierQty[t.id] ?? 0}
                          onChange={(e) =>
                            setMapEditForm((f) => ({
                              ...f,
                              tierQty: { ...f.tierQty, [t.id]: Math.max(0, parseInt(e.target.value) || 0) },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">0 remove o ativo da cota.</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMapEditAsset(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveMapAsset} disabled={mapEditSaving}>
                  {mapEditSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

      {/* ===== TIER DIALOG ===== */}
      <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTier ? "Editar cota" : "Nova cota de patrocínio"}</DialogTitle>
            <DialogDescription>
              Defina valor, vagas disponíveis e ativos inclusos.
            </DialogDescription>
          </DialogHeader>

          {!editingTier && (
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Templates rápidos</Label>
                <div className="flex items-center gap-1">
                  {editingTemplates && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetTemplates}>
                      Restaurar padrão
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingTemplates((v) => !v)}
                  >
                    {editingTemplates ? "Concluir" : "Editar nomes"}
                  </Button>
                </div>
              </div>
              {editingTemplates ? (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {tierTemplates.map((tpl) => (
                    <div key={tpl.level} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tpl.color }}
                      />
                      <Input
                        value={tpl.name}
                        onChange={(e) => renameTemplate(tpl.level, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2 mt-1 flex-wrap">
                  {tierTemplates.map((tpl) => (
                    <Button
                      key={tpl.level}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyTemplate(tpl)}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full mr-1.5"
                        style={{ backgroundColor: tpl.color }}
                      />
                      {tpl.name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}


          <form onSubmit={saveTier} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  required
                  value={tierForm.name}
                  onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input
                  type="color"
                  value={tierForm.color}
                  onChange={(e) => setTierForm({ ...tierForm, color: e.target.value })}
                  className="h-10 p-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={tierForm.value}
                  onChange={(e) => setTierForm({ ...tierForm, value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vagas disponíveis *</Label>
                <Input
                  type="number"
                  min="1"
                  required
                  value={tierForm.total_slots}
                  onChange={(e) => setTierForm({ ...tierForm, total_slots: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Benefícios</Label>
              <Textarea
                rows={2}
                value={tierForm.benefits}
                onChange={(e) => setTierForm({ ...tierForm, benefits: e.target.value })}
                placeholder="Ex: Logo na camisa, ativação em 4 jogos..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Ativos inclusos ({tierForm.selectedAssets.length})</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Buscar ativo por nome ou categoria..."
                  value={tierAssetSearch}
                  onChange={(e) => setTierAssetSearch(e.target.value)}
                  className="h-9"
                />
                <Select value={tierAssetCategory} onValueChange={setTierAssetCategory}>
                  <SelectTrigger className="h-9 sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    {Array.from(new Set(assets.map((a) => a.category)))
                      .sort((a, b) => a.localeCompare(b))
                      .map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select value={tierAssetSort} onValueChange={setTierAssetSort}>
                  <SelectTrigger className="h-9 sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
                    <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
                    <SelectItem value="category">Categoria</SelectItem>
                    <SelectItem value="quantity">Quantidade</SelectItem>
                    <SelectItem value="value">Valor</SelectItem>
                    <SelectItem value="selected">Selecionados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
                {(() => {
                  const q = tierAssetSearch.trim().toLowerCase();
                  const list = assets
                    .filter(
                      (a) =>
                        (tierAssetCategory === "all" || a.category === tierAssetCategory) &&
                        (!q ||
                          a.name.toLowerCase().includes(q) ||
                          (a.category ?? "").toLowerCase().includes(q))
                    )
                    .sort((a, b) => {
                      switch (tierAssetSort) {
                        case "name_desc":
                          return b.name.localeCompare(a.name);
                        case "category":
                          return (
                            (a.category ?? "").localeCompare(b.category ?? "") ||
                            a.name.localeCompare(b.name)
                          );
                        case "quantity":
                          return (b.quantity ?? 0) - (a.quantity ?? 0);
                        case "value":
                          return (b.unit_value ?? 0) - (a.unit_value ?? 0);
                        case "selected": {
                          const sa = tierForm.selectedAssets.includes(a.id) ? 0 : 1;
                          const sb = tierForm.selectedAssets.includes(b.id) ? 0 : 1;
                          return sa - sb || a.name.localeCompare(b.name);
                        }
                        default:
                          return a.name.localeCompare(b.name);
                      }
                    });
                  if (assets.length === 0)
                    return (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhum ativo alocado nesta propriedade.
                      </p>
                    );
                  if (list.length === 0)
                    return (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Nenhum ativo encontrado para esta busca.
                      </p>
                    );
                  return list.map((a) => {
                    const checked = tierForm.selectedAssets.includes(a.id);
                    const qty = Math.max(1, Number(tierForm.assetQty[a.id]) || 1);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 p-1.5 hover:bg-muted/50 rounded"
                      >
                        <Checkbox
                          id={`ta-${a.id}`}
                          checked={checked}
                          onCheckedChange={(c) => {
                            setTierForm((f) => ({
                              ...f,
                              selectedAssets: c
                                ? [...f.selectedAssets, a.id]
                                : f.selectedAssets.filter((x) => x !== a.id),
                              assetQty: c
                                ? { ...f.assetQty, [a.id]: f.assetQty[a.id] || 1 }
                                : (() => {
                                    const next = { ...f.assetQty };
                                    delete next[a.id];
                                    return next;
                                  })(),
                            }));
                          }}
                        />
                        <label htmlFor={`ta-${a.id}`} className="text-sm flex-1 cursor-pointer">
                          {a.name}
                        </label>
                        <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">Qtd</span>
                          <Input
                            type="number"
                            min={1}
                            value={checked ? qty : ""}
                            placeholder="0"
                            disabled={!checked}
                            onChange={(e) =>
                              setTierForm((f) => ({
                                ...f,
                                assetQty: {
                                  ...f.assetQty,
                                  [a.id]: Math.max(1, parseInt(e.target.value) || 1),
                                },
                              }))
                            }
                            className="h-7 w-16 text-center"
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTierDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingTier ? "Salvar" : "Criar cota"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== EVENT DIALOG ===== */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEvent} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                required
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={eventForm.event_type}
                  onValueChange={(v) => setEventForm({ ...eventForm, event_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input
                  value={eventForm.location}
                  onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início *</Label>
                <Input
                  type="datetime-local"
                  required
                  value={eventForm.starts_at}
                  onChange={(e) => setEventForm({ ...eventForm, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fim</Label>
                <Input
                  type="datetime-local"
                  value={eventForm.ends_at}
                  onChange={(e) => setEventForm({ ...eventForm, ends_at: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                rows={2}
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEventDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar evento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ===== SEASON DIALOG ===== */}
      <Dialog open={seasonDialogOpen} onOpenChange={setSeasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova edição / temporada</DialogTitle>
            <DialogDescription>
              Cria uma nova edição vinculada a esta propriedade.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createSeason} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ano *</Label>
                <Input
                  type="number"
                  required
                  value={seasonForm.season_year}
                  onChange={(e) =>
                    setSeasonForm({ ...seasonForm, season_year: parseInt(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nome (opcional)</Label>
                <Input
                  value={seasonForm.name}
                  onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                  placeholder={`${property.name} ${seasonForm.season_year}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input
                  type="date"
                  value={seasonForm.start_date}
                  onChange={(e) => setSeasonForm({ ...seasonForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fim</Label>
                <Input
                  type="date"
                  value={seasonForm.end_date}
                  onChange={(e) => setSeasonForm({ ...seasonForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSeasonDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar edição</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
