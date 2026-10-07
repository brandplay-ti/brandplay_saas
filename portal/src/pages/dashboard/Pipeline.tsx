import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as DatePickerCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, CalendarIcon, Building2, Trash2, GripVertical, Search, Settings2, AlertTriangle, User, Columns3, Table2, Rows3, Filter, X, Activity, Clock, ArrowUpDown, Sparkles, Loader2, CheckCircle2, XCircle, FileDown, PanelRightOpen, ArrowUp, ArrowDown } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import type { Database } from "@/integrations/supabase/types";
import { logBackendDbError } from "@/lib/backendErrorLogger";
import { PipelineMetrics } from "@/components/pipeline/PipelineMetrics";
import { OpportunityDrawer } from "@/components/pipeline/OpportunityDrawer";
import { getOpportunityStageChecklistIssues } from "@/lib/opportunityStageChecklist";
import { MissingInfoDialog, type MissingInfoState } from "@/components/common/MissingInfoDialog";
import {
  StageProbabilitiesDialog,
  DEFAULT_PROBABILITIES,
} from "@/components/pipeline/StageProbabilitiesDialog";
import { cn } from "@/lib/utils";
import { dataLocal } from "@/lib/datas";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

type Opportunity = {
  id: string;
  brand: string;
  value: number;
  stage: Stage;
  pipeline_funnel_id?: string | null;
  expected_close_date: string | null;
  property_id: string | null;
  sponsor_id: string | null;
  notes: string | null;
  assignee_id: string | null;
  last_stage_change_at: string;
  created_at: string;
  lost_reason: string | null;
  lost_comment: string | null;
  lost_competitor?: string | null;
  lost_value?: number | null;
  decided_at?: string | null;
};

type Property = { id: string; name: string; category: string; audience_estimate: number | null };
type Sponsor = { id: string; name: string; score: "frio" | "morno" | "quente"; last_contact_at: string | null; segment: string | null; tags: string[] };
type Profile = { id: string; full_name: string | null; company: string | null };
type PipelineFunnel = { id: string; name: string; description: string | null; position: number; is_default: boolean; is_active: boolean };
type PipelineStageSla = { id: string; organization_id: string; pipeline_funnel_id: string | null; stage: Stage; sla_days: number | null; is_active: boolean };
type ViewMode = "kanban" | "list" | "compact";
type SortMode = "value_desc" | "value_asc" | "stage_asc" | "stage_desc" | "close_date" | "close_date_desc" | "stale_time" | "created_at" | "assignee" | "assignee_desc";
type NextActivity = { id: string; title: string; due_date: string | null; owner_id: string };
type ActivitySummary = { total: number; pending: number; overdue: number; lastActivityAt: string | null; nextActivity: NextActivity | null };
type OpportunityPriority = { score: number; label: "Alta" | "Média" | "Baixa" };
type ProposalAlert = { id: string; title: string; brand: string | null; total_value: number; status: string; sent_at: string | null; updated_at: string };
type AttentionAlert = { key: string; label: string; count: number; detail: string };
type SuggestedStep = { title: string; description: string; activity_type: "ligacao" | "email" | "reuniao" | "tarefa" | "nota"; priority: "alta" | "media" | "baixa"; due_in_days: number };
type BoardRecommendation = { opportunity: Opportunity; priority: OpportunityPriority; reasons: string[]; step: SuggestedStep; selected: boolean };
type StageAuditLog = { opportunity_id: string; event_type: string; from_stage: Stage | null; to_stage: Stage | null };
type ConversionStep = { key: string; from: Stage; to: Stage; label: string };
type SuggestedStepsResponse = { steps?: SuggestedStep[]; error?: string };
type AssigneePerformance = {
  id: string;
  name: string;
  openCount: number;
  pipelineValue: number;
  conversionRate: number;
  averageCycleDays: number | null;
  staleCount: number;
};

const DEFAULT_PIPELINE_SORT_MODE: SortMode = "value_desc";

const moveRecommendation = (items: BoardRecommendation[], id: string, direction: "up" | "down") => {
  const index = items.findIndex((item) => item.opportunity.id === id);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

type AdvancedFiltersState = {
  filterStage: string;
  filterSponsor: string;
  minValue: string;
  maxValue: string;
  closeFrom: string;
  closeTo: string;
  createdLastDays: string;
  showNoActivityOnly: boolean;
  showOverdueOnly: boolean;
};

type StageConfig = { id: Stage; label: string; color: string; slaDays: number | null };

const STAGES: StageConfig[] = [
  { id: "prospect", label: "Prospect", color: "bg-slate-500", slaDays: 7 },
  { id: "reuniao", label: "Reunião", color: "bg-blue-500", slaDays: 5 },
  { id: "proposta_enviada", label: "Proposta enviada", color: "bg-amber-500", slaDays: 10 },
  { id: "negociacao", label: "Negociação", color: "bg-purple-500", slaDays: 14 },
  { id: "fechado", label: "Fechado", color: "bg-emerald-500", slaDays: null },
  { id: "perdido", label: "Perdido", color: "bg-rose-500", slaDays: null },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "value_desc", label: "Maior valor" },
  { value: "value_asc", label: "Menor valor" },
  { value: "stage_asc", label: "Estágio" },
  { value: "close_date", label: "Data prevista" },
  { value: "stale_time", label: "Tempo parado" },
  { value: "created_at", label: "Data de criação" },
  { value: "assignee", label: "Responsável" },
];

const CONVERSION_STEPS: ConversionStep[] = [
  { key: "prospect-reuniao", from: "prospect", to: "reuniao", label: "Prospects viram reunião" },
  { key: "reuniao-proposta", from: "reuniao", to: "proposta_enviada", label: "Reuniões viram proposta" },
  { key: "proposta-negociacao", from: "proposta_enviada", to: "negociacao", label: "Propostas viram negociação" },
  { key: "negociacao-fechado", from: "negociacao", to: "fechado", label: "Negociações fecham" },
];

const LOSS_REASON_OPTIONS = [
  { key: "preco", label: "Preço" },
  { key: "timing", label: "Timing" },
  { key: "concorrente", label: "Concorrente" },
  { key: "sem_fit", label: "Sem fit" },
  { key: "outros", label: "Outros" },
];

const DEFAULT_ADVANCED_FILTERS: AdvancedFiltersState = {
  filterStage: "all",
  filterSponsor: "all",
  minValue: "",
  maxValue: "",
  closeFrom: "",
  closeTo: "",
  createdLastDays: "",
  showNoActivityOnly: false,
  showOverdueOnly: false,
};

const getStoredAdvancedFilters = () => {
  try {
    const stored = localStorage.getItem("pipeline_advanced_filters");
    return stored ? { ...DEFAULT_ADVANCED_FILTERS, ...JSON.parse(stored) } as AdvancedFiltersState : DEFAULT_ADVANCED_FILTERS;
  } catch {
    return DEFAULT_ADVANCED_FILTERS;
  }
};

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string) => {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const formatFilterDate = (value: string) => {
  const date = parseDateInput(value);
  return date ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "Selecionar";
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const formatNextActivityDue = (dueDate: string | null) => {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "atrasada";
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  return `em ${diff} dias`;
};

const formatNextActivity = (activity: NextActivity | null) => {
  if (!activity) return null;
  const due = formatNextActivityDue(activity.due_date);
  return due ? `${activity.title} ${due}` : activity.title;
};

const escapeHtml = (value: string | number) =>
  String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));

const downloadCSV = (filename: string, rows: (string | number)[][]) => {
  const csv = rows
    .map((row) => row.map((cell) => {
      const value = String(cell ?? "");
      return /[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    }).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(score)));

const getPriorityMeta = (score: number): OpportunityPriority => ({
  score,
  label: score >= 70 ? "Alta" : score >= 40 ? "Média" : "Baixa",
});

const getStageMeta = (stage: Stage, stages: StageConfig[] = STAGES) => stages.find((s) => s.id === stage) ?? stages[0];

const getStageSlaDays = (stage: Stage, stages: StageConfig[] = STAGES) => getStageMeta(stage, stages).slaDays;

const isOpportunityStale = (opp: Opportunity, stages: StageConfig[] = STAGES) =>
  getStageSlaDays(opp.stage, stages) !== null &&
  daysSince(opp.last_stage_change_at) >= (getStageSlaDays(opp.stage, stages) ?? Number.POSITIVE_INFINITY);

const isOpportunityOverdue = (opp: Opportunity) => {
  if (!opp.expected_close_date || opp.stage === "fechado" || opp.stage === "perdido") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const closeDate = parseDateInput(opp.expected_close_date);
  return !!closeDate && closeDate < today;
};

const tieBreakOpportunities = (a: Opportunity, b: Opportunity) =>
  a.brand.localeCompare(b.brand, "pt-BR", { sensitivity: "base" }) ||
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

const getStageOrder = (stage: Stage) => STAGES.findIndex((item) => item.id === stage);

const sortOpportunities = (items: Opportunity[], sortMode: SortMode, profilesById: Record<string, string>) =>
  [...items].sort((a, b) => {
    let result = 0;
    if (sortMode === "value_desc") result = (Number(b.value) || 0) - (Number(a.value) || 0);
    if (sortMode === "value_asc") result = (Number(a.value) || 0) - (Number(b.value) || 0);
    if (sortMode === "stage_asc") result = getStageOrder(a.stage) - getStageOrder(b.stage);
    if (sortMode === "stage_desc") result = getStageOrder(b.stage) - getStageOrder(a.stage);
    if (sortMode === "close_date" || sortMode === "close_date_desc") {
      const aTime = a.expected_close_date ? parseDateInput(a.expected_close_date)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      const bTime = b.expected_close_date ? parseDateInput(b.expected_close_date)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
      result = sortMode === "close_date" ? aTime - bTime : bTime - aTime;
    }
    if (sortMode === "stale_time") result = daysSince(b.last_stage_change_at) - daysSince(a.last_stage_change_at);
    if (sortMode === "created_at") result = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortMode === "assignee" || sortMode === "assignee_desc") {
      const aName = a.assignee_id ? profilesById[a.assignee_id] ?? "" : "";
      const bName = b.assignee_id ? profilesById[b.assignee_id] ?? "" : "";
      if (!aName && bName) result = 1;
      else if (aName && !bName) result = -1;
      else result = aName.localeCompare(bName, "pt-BR", { sensitivity: "base" });
      if (sortMode === "assignee_desc") result *= -1;
    }
    return result || tieBreakOpportunities(a, b);
  });

export default function Pipeline() {
  const { user } = useAuth();
  const { orgId, isAdmin } = useOrganization();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [funnels, setFunnels] = useState<PipelineFunnel[]>([]);
  const [stageSlas, setStageSlas] = useState<PipelineStageSla[]>([]);
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaForm, setSlaForm] = useState<Record<Stage, string>>(() => Object.fromEntries(STAGES.map((stage) => [stage.id, stage.slaDays?.toString() ?? ""])) as Record<Stage, string>);
  const [savingSlas, setSavingSlas] = useState(false);
  const [activeFunnelId, setActiveFunnelId] = useState<string>("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activitySummary, setActivitySummary] = useState<Record<string, ActivitySummary>>({});
  const [proposalAlerts, setProposalAlerts] = useState<ProposalAlert[]>([]);
  const [stageAuditLogs, setStageAuditLogs] = useState<StageAuditLog[]>([]);
  const [probabilities, setProbabilities] = useState<Record<Stage, number>>(DEFAULT_PROBABILITIES);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [missingInfo, setMissingInfo] = useState<MissingInfoState | null>(null);
  const [probDialogOpen, setProbDialogOpen] = useState(false);
  const [pendingLossId, setPendingLossId] = useState<string | null>(null);
  const [lossForm, setLossForm] = useState({ reason: "", comment: "", competitor: "", value: "" });
  const [funnelDialogOpen, setFunnelDialogOpen] = useState(false);
  const [funnelForm, setFunnelForm] = useState({ name: "", description: "" });
  const [prioritizing, setPrioritizing] = useState(false);
  const [creatingBatchTasks, setCreatingBatchTasks] = useState(false);
  const [boardRecommendations, setBoardRecommendations] = useState<BoardRecommendation[]>([]);
  const [showInsights, setShowInsights] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("pipeline_view_mode");
    return saved === "list" || saved === "compact" || saved === "kanban" ? saved : "kanban";
  });
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem("pipeline_sort_mode");
    return SORT_OPTIONS.some((option) => option.value === saved) ? (saved as SortMode) : DEFAULT_PIPELINE_SORT_MODE;
  });

  // filtros
  const initialAdvancedFilters = getStoredAdvancedFilters();
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>(initialAdvancedFilters.filterStage);
  const [filterSponsor, setFilterSponsor] = useState<string>(initialAdvancedFilters.filterSponsor);
  const [minValue, setMinValue] = useState(initialAdvancedFilters.minValue);
  const [maxValue, setMaxValue] = useState(initialAdvancedFilters.maxValue);
  const [closeFrom, setCloseFrom] = useState(initialAdvancedFilters.closeFrom);
  const [closeTo, setCloseTo] = useState(initialAdvancedFilters.closeTo);
  const [createdLastDays, setCreatedLastDays] = useState(initialAdvancedFilters.createdLastDays);
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [showNoActivityOnly, setShowNoActivityOnly] = useState(initialAdvancedFilters.showNoActivityOnly);
  const [showOverdueOnly, setShowOverdueOnly] = useState(initialAdvancedFilters.showOverdueOnly);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const [form, setForm] = useState({
    brand: "",
    value: "",
    stage: "prospect" as Stage,
    expected_close_date: "",
    property_id: "none",
    notes: "",
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = async () => {
    if (!orgId) {
      setOpportunities([]);
      setFunnels([]);
      setActivitySummary({});
      setProposalAlerts([]);
      setStageAuditLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [oppsRes, funnelsRes, slasRes, propsRes, sponsRes, profsRes, actRes, proposalsRes, auditRes] = await Promise.all([
      supabase.from("opportunities").select("*").eq("organization_id", orgId).order("position"),
      supabase.from("pipeline_funnels").select("id, name, description, position, is_default, is_active").eq("organization_id", orgId).eq("is_active", true).order("position").order("name"),
      supabase.from("pipeline_stage_slas" as any).select("id, organization_id, pipeline_funnel_id, stage, sla_days, is_active").eq("organization_id", orgId),
      supabase.from("sports_properties").select("id, name, category, audience_estimate").eq("organization_id", orgId).order("name"),
      supabase.from("sponsors").select("id, name, sponsor_crm_profiles(score, last_contact_at, segment, tags)").eq("organization_id", orgId).order("name"),
      supabase.from("profiles").select("id, full_name, company"),
      supabase.from("opportunity_activities" as any).select("id, opportunity_id, owner_id, title, status, due_date, created_at").eq("organization_id", orgId),
      supabase.from("proposals").select("id, title, brand, total_value, status, sent_at, updated_at").eq("organization_id", orgId).eq("status", "enviada"),
      supabase.from("opportunity_audit_logs").select("opportunity_id, event_type, from_stage, to_stage").eq("organization_id", orgId).eq("event_type", "stage_changed"),
    ]);
    if (oppsRes.error) {
      await logBackendDbError({
        table: "opportunities",
        action: "SELECT",
        clientFile: "src/pages/dashboard/Pipeline.tsx",
        clientLine: 133,
        organizationId: orgId,
        attemptedRowKeys: ["position"],
        error: oppsRes.error,
      });
    }
    setOpportunities((oppsRes.data as Opportunity[]) ?? []);
    const funnelList = (funnelsRes.data as PipelineFunnel[]) ?? [];
    setFunnels(funnelList);
    setStageSlas((slasRes.data as unknown as PipelineStageSla[]) ?? []);
    setActiveFunnelId((current) => (current === "all" || funnelList.some((funnel) => funnel.id === current) ? current : funnelList.find((funnel) => funnel.is_default)?.id ?? "all"));
    setProperties((propsRes.data as Property[]) ?? []);
    setSponsors(((sponsRes.data ?? []) as any[]).map((sponsor) => {
      const crm = Array.isArray(sponsor.sponsor_crm_profiles) ? sponsor.sponsor_crm_profiles[0] : sponsor.sponsor_crm_profiles;
      return { id: sponsor.id, name: sponsor.name, score: crm?.score ?? "morno", last_contact_at: crm?.last_contact_at ?? null, segment: crm?.segment ?? null, tags: crm?.tags ?? [] };
    }));
    setProfiles((profsRes.data as Profile[]) ?? []);
    setProposalAlerts((proposalsRes.data as ProposalAlert[]) ?? []);
    setStageAuditLogs((auditRes.data as unknown as StageAuditLog[]) ?? []);

    const summary: Record<string, ActivitySummary> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const activity of (actRes.data ?? []) as unknown as { id: string; opportunity_id: string; owner_id: string; title: string; status: string; due_date: string | null; created_at: string }[]) {
      const current = summary[activity.opportunity_id] ?? { total: 0, pending: 0, overdue: 0, lastActivityAt: null, nextActivity: null };
      current.total += 1;
      if (activity.status !== "concluido") current.pending += 1;
      if (activity.status !== "concluido" && activity.due_date && dataLocal(activity.due_date) < today) current.overdue += 1;
      if (activity.status !== "concluido") {
        const currentNextTime = current.nextActivity?.due_date ? dataLocal(current.nextActivity.due_date).getTime() : Number.POSITIVE_INFINITY;
        const activityTime = activity.due_date ? dataLocal(activity.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (!current.nextActivity || activityTime < currentNextTime) current.nextActivity = { id: activity.id, title: activity.title, due_date: activity.due_date, owner_id: activity.owner_id };
      }
      if (!current.lastActivityAt || new Date(activity.created_at) > new Date(current.lastActivityAt)) {
        current.lastActivityAt = activity.created_at;
      }
      summary[activity.opportunity_id] = current;
    }
    setActivitySummary(summary);
    setLoading(false);
  };

  const fetchProbabilities = async () => {
    if (!user || !orgId) return;
    const { data } = await supabase
      .from("user_stage_probabilities")
      .select("stage, probability")
      .eq("user_id", user.id)
      .eq("organization_id", orgId);
    if (data && data.length > 0) {
      const map = { ...DEFAULT_PROBABILITIES };
      for (const r of data) map[r.stage as Stage] = r.probability;
      setProbabilities(map);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  useEffect(() => {
    fetchProbabilities();
  }, [user, orgId]);

  useEffect(() => {
    localStorage.setItem("pipeline_view_mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("pipeline_sort_mode", sortMode);
  }, [sortMode]);

  useEffect(() => {
    localStorage.setItem("pipeline_advanced_filters", JSON.stringify({
      filterStage,
      filterSponsor,
      minValue,
      maxValue,
      closeFrom,
      closeTo,
      createdLastDays,
      showNoActivityOnly,
      showOverdueOnly,
    }));
  }, [filterStage, filterSponsor, minValue, maxValue, closeFrom, closeTo, createdLastDays, showNoActivityOnly, showOverdueOnly]);

  const propertiesById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p.name])),
    [properties],
  );
  const sponsorsById = useMemo(
    () => Object.fromEntries(sponsors.map((s) => [s.id, s.name])),
    [sponsors],
  );
  const sponsorsMetaById = useMemo(
    () => Object.fromEntries(sponsors.map((s) => [s.id, s])),
    [sponsors],
  );
  const propertiesMetaById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p])),
    [properties],
  );
  const profilesById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.company || p.id.slice(0, 8)])),
    [profiles],
  );
  const effectiveStages = useMemo(() => {
    const funnelId = activeFunnelId === "all" ? funnels.find((funnel) => funnel.is_default)?.id ?? null : activeFunnelId;
    return STAGES.map((stage) => {
      const specific = stageSlas.find((sla) => sla.stage === stage.id && sla.pipeline_funnel_id === funnelId && sla.is_active);
      const fallback = stageSlas.find((sla) => sla.stage === stage.id && !sla.pipeline_funnel_id && sla.is_active);
      return { ...stage, slaDays: specific?.sla_days ?? fallback?.sla_days ?? stage.slaDays };
    });
  }, [activeFunnelId, funnels, stageSlas]);
  const isStaleWithCurrentSla = (opportunity: Opportunity) => isOpportunityStale(opportunity, effectiveStages);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = minValue ? Number(minValue) : null;
    const max = maxValue ? Number(maxValue) : null;
    const fromDate = closeFrom ? parseDateInput(closeFrom) : null;
    const toDate = closeTo ? parseDateInput(closeTo) : null;
    const createdDays = createdLastDays ? Number(createdLastDays) : null;
    const createdCutoff = createdDays && createdDays > 0 ? new Date(Date.now() - createdDays * 86400000) : null;

    return opportunities.filter((o) => {
      const value = Number(o.value) || 0;
      if (activeFunnelId !== "all" && o.pipeline_funnel_id !== activeFunnelId) return false;
      if (q) {
        const searchableText = [
          o.brand,
          o.sponsor_id ? sponsorsById[o.sponsor_id] : null,
          o.property_id ? propertiesById[o.property_id] : null,
          o.notes,
          o.assignee_id ? profilesById[o.assignee_id] : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchableText.includes(q)) return false;
      }
      if (filterProperty !== "all" && o.property_id !== filterProperty) return false;
      if (filterAssignee !== "all") {
        if (filterAssignee === "none" && o.assignee_id) return false;
        if (filterAssignee !== "none" && o.assignee_id !== filterAssignee) return false;
      }
      if (filterStage !== "all" && o.stage !== filterStage) return false;
      if (filterSponsor !== "all") {
        if (filterSponsor === "none" && o.sponsor_id) return false;
        if (filterSponsor !== "none" && o.sponsor_id !== filterSponsor) return false;
      }
      if (min !== null && value < min) return false;
      if (max !== null && value > max) return false;
      if (fromDate || toDate) {
        if (!o.expected_close_date) return false;
        const closeDate = parseDateInput(o.expected_close_date);
        if (!closeDate) return false;
        if (fromDate && closeDate < fromDate) return false;
        if (toDate && closeDate > toDate) return false;
      }
      if (showStaleOnly && !isStaleWithCurrentSla(o)) return false;
      if (showNoActivityOnly && (activitySummary[o.id]?.total ?? 0) > 0) return false;
      if (showOverdueOnly && !isOpportunityOverdue(o)) return false;
      if (createdCutoff && new Date(o.created_at) < createdCutoff) return false;
      return true;
    });
  }, [
    opportunities,
    activeFunnelId,
    search,
    propertiesById,
    profilesById,
    sponsorsById,
    filterProperty,
    filterAssignee,
    filterStage,
    filterSponsor,
    minValue,
    maxValue,
    closeFrom,
    closeTo,
    showStaleOnly,
    showNoActivityOnly,
    showOverdueOnly,
    createdLastDays,
    activitySummary,
    effectiveStages,
  ]);

  const sortedFiltered = useMemo(
    () => sortOpportunities(filtered, sortMode, profilesById),
    [filtered, sortMode, profilesById],
  );

  const prioritiesById = useMemo(() => {
    const values = opportunities.map((o) => Number(o.value) || 0);
    const maxValue = Math.max(...values, 1);
    return Object.fromEntries(opportunities.map((o) => {
      const stageScore = ({ prospect: 8, reuniao: 14, proposta_enviada: 20, negociacao: 24, fechado: 12, perdido: 0 } as Record<Stage, number>)[o.stage];
      const valueScore = ((Number(o.value) || 0) / maxValue) * 25;
      const staleDays = daysSince(o.last_stage_change_at);
      const staleScore = o.stage === "fechado" || o.stage === "perdido" ? 0 : staleDays <= 3 ? 10 : staleDays <= 14 ? 5 : -8;
      const activity = activitySummary[o.id];
      const activityScore = activity?.nextActivity ? 12 : activity?.lastActivityAt && daysSince(activity.lastActivityAt) <= 7 ? 8 : -8;
      const closeScore = o.expected_close_date ? (() => {
        const close = parseDateInput(o.expected_close_date);
        if (!close) return 0;
        const days = Math.ceil((close.getTime() - Date.now()) / 86400000);
        if (days < 0) return -6;
        if (days <= 14) return 12;
        if (days <= 45) return 8;
        return 3;
      })() : 0;
      const property = o.property_id ? propertiesMetaById[o.property_id] : null;
      const fitScore = property ? Math.min(10, Math.max(4, Math.log10(Math.max(Number(property.audience_estimate) || 0, 1)) * 2)) : 0;
      const sponsor = o.sponsor_id ? sponsorsMetaById[o.sponsor_id] : null;
      const sponsorScore = sponsor ? (sponsor.score === "quente" ? 12 : sponsor.score === "morno" ? 7 : 3) + (sponsor.last_contact_at && daysSince(sponsor.last_contact_at) <= 30 ? 4 : 0) : 0;
      return [o.id, getPriorityMeta(clampScore(20 + valueScore + stageScore + staleScore + activityScore + closeScore + fitScore + sponsorScore))];
    }));
  }, [opportunities, activitySummary, propertiesMetaById, sponsorsMetaById]);

  const grouped = useMemo(() => {
    const map: Record<Stage, Opportunity[]> = {
      prospect: [], reuniao: [], proposta_enviada: [], negociacao: [], fechado: [], perdido: [],
    };
    for (const o of sortedFiltered) map[o.stage].push(o);
    return map;
  }, [sortedFiltered]);

  const totals = useMemo(() => {
    const t: Record<Stage, number> = {
      prospect: 0, reuniao: 0, proposta_enviada: 0, negociacao: 0, fechado: 0, perdido: 0,
    };
    for (const o of sortedFiltered) t[o.stage] += Number(o.value) || 0;
    return t;
  }, [sortedFiltered]);

  const staleCount = useMemo(
    () => opportunities.filter(isStaleWithCurrentSla).length,
    [opportunities, effectiveStages],
  );

  const noActivityCount = useMemo(
    () => opportunities.filter((o) => (activitySummary[o.id]?.total ?? 0) === 0).length,
    [opportunities, activitySummary],
  );

  const overdueCount = useMemo(
    () => opportunities.filter(isOpportunityOverdue).length,
    [opportunities],
  );

  const attentionAlerts = useMemo(() => {
    const stale = opportunities.filter(isStaleWithCurrentSla);
    const proposalsWithoutResponse = proposalAlerts.filter((proposal) => daysSince(proposal.sent_at ?? proposal.updated_at) >= 7);
    const noAssignee = opportunities.filter((o) => o.stage !== "fechado" && o.stage !== "perdido" && !o.assignee_id);
    const overdueClose = opportunities.filter(isOpportunityOverdue);
    const openValues = opportunities
      .filter((o) => o.stage !== "fechado" && o.stage !== "perdido")
      .map((o) => Number(o.value) || 0);
    const highValueThreshold = Math.max(...openValues, 0) * 0.7;
    const highValueNoNextAction = opportunities.filter(
      (o) =>
        o.stage === "negociacao" &&
        (Number(o.value) || 0) >= highValueThreshold &&
        (Number(o.value) || 0) > 0 &&
        !activitySummary[o.id]?.nextActivity,
    );

    return [
      { key: "stale", label: "Oportunidades paradas", count: stale.length, detail: stale.slice(0, 3).map((o) => o.brand).join(", ") },
      { key: "proposals", label: "Propostas sem resposta", count: proposalsWithoutResponse.length, detail: proposalsWithoutResponse.slice(0, 3).map((p) => p.brand || p.title).join(", ") },
      { key: "assignee", label: "Oportunidades sem responsável", count: noAssignee.length, detail: noAssignee.slice(0, 3).map((o) => o.brand).join(", ") },
      { key: "overdue", label: "Fechamento previsto vencido", count: overdueClose.length, detail: overdueClose.slice(0, 3).map((o) => o.brand).join(", ") },
      { key: "high-value", label: "Alto valor sem próxima ação", count: highValueNoNextAction.length, detail: highValueNoNextAction.slice(0, 3).map((o) => o.brand).join(", ") },
    ];
  }, [opportunities, proposalAlerts, activitySummary, effectiveStages]);

  const conversionByStage = useMemo(() => {
    const reached = new Map<Stage, Set<string>>();
    for (const stage of STAGES) reached.set(stage.id, new Set());
    for (const opportunity of opportunities) {
      reached.get(opportunity.stage)?.add(opportunity.id);
    }
    for (const log of stageAuditLogs) {
      if (log.from_stage) reached.get(log.from_stage)?.add(log.opportunity_id);
      if (log.to_stage) reached.get(log.to_stage)?.add(log.opportunity_id);
    }

    return CONVERSION_STEPS.map((step) => {
      const fromCount = reached.get(step.from)?.size ?? 0;
      const convertedCount = reached.get(step.to)?.size ?? 0;
      const rate = fromCount > 0 ? Math.round((convertedCount / fromCount) * 100) : 0;
      return { ...step, fromCount, convertedCount, rate };
    });
  }, [opportunities, stageAuditLogs]);

  const lossesByReason = useMemo(() => {
    const lost = opportunities.filter((opportunity) => opportunity.stage === "perdido");
    return LOSS_REASON_OPTIONS.map((reason) => {
      const items = lost.filter((opportunity) => opportunity.lost_reason === reason.key);
      return {
        ...reason,
        count: items.length,
        value: items.reduce((sum, opportunity) => sum + Number(opportunity.lost_value ?? opportunity.value ?? 0), 0),
      };
    });
  }, [opportunities]);

  const performanceByAssignee = useMemo<AssigneePerformance[]>(() => {
    const groups = new Map<string, AssigneePerformance & { wonCount: number; closedCount: number; cycleTotalDays: number }>();
    const ensureGroup = (opportunity: Opportunity) => {
      const id = opportunity.assignee_id ?? "none";
      const name = opportunity.assignee_id ? profilesById[opportunity.assignee_id] ?? "Responsável" : "Sem responsável";
      if (!groups.has(id)) {
        groups.set(id, { id, name, openCount: 0, pipelineValue: 0, conversionRate: 0, averageCycleDays: null, staleCount: 0, wonCount: 0, closedCount: 0, cycleTotalDays: 0 });
      }
      return groups.get(id)!;
    };

    for (const opportunity of opportunities) {
      const group = ensureGroup(opportunity);
      const isOpen = opportunity.stage !== "fechado" && opportunity.stage !== "perdido";
      if (isOpen) {
        group.openCount += 1;
        group.pipelineValue += Number(opportunity.value) || 0;
        if (isStaleWithCurrentSla(opportunity)) group.staleCount += 1;
      } else {
        group.closedCount += 1;
        if (opportunity.stage === "fechado") group.wonCount += 1;
        group.cycleTotalDays += Math.max(0, daysSince(opportunity.created_at));
      }
    }

    return Array.from(groups.values())
      .map(({ wonCount, closedCount, cycleTotalDays, ...group }) => ({
        ...group,
        conversionRate: closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0,
        averageCycleDays: closedCount > 0 ? Math.round(cycleTotalDays / closedCount) : null,
      }))
      .sort((a, b) => b.pipelineValue - a.pipelineValue || b.openCount - a.openCount || a.name.localeCompare(b.name, "pt-BR"));
  }, [opportunities, profilesById, effectiveStages]);

  const activeAdvancedFilters = useMemo(
    () =>
      [
        filterStage !== "all",
        filterSponsor !== "all",
        !!minValue,
        !!maxValue,
        !!closeFrom,
        !!closeTo,
        showNoActivityOnly,
        showOverdueOnly,
        !!createdLastDays,
      ].filter(Boolean).length,
    [filterStage, filterSponsor, minValue, maxValue, closeFrom, closeTo, showNoActivityOnly, showOverdueOnly, createdLastDays],
  );

  const resetAdvancedFilters = () => {
    setFilterStage("all");
    setFilterSponsor("all");
    setMinValue("");
    setMaxValue("");
    setCloseFrom("");
    setCloseTo("");
    setCreatedLastDays("");
    setShowNoActivityOnly(false);
    setShowOverdueOnly(false);
  };

  const getExportRows = () => [
    ["Marca", "Estágio", "Score", "Valor", "Sponsor", "Propriedade", "Responsável", "Fechamento previsto", "Próxima ação", "Dias na etapa"],
    ...sortedFiltered.map((opp) => [
      opp.brand,
      getStageMeta(opp.stage).label,
      prioritiesById[opp.id] ? `${prioritiesById[opp.id].score} · ${prioritiesById[opp.id].label}` : "—",
      Number(opp.value) || 0,
      opp.sponsor_id ? sponsorsById[opp.sponsor_id] ?? "—" : "—",
      opp.property_id ? propertiesById[opp.property_id] ?? "—" : "—",
      opp.assignee_id ? profilesById[opp.assignee_id] ?? "—" : "—",
      formatDate(opp.expected_close_date) ?? "—",
      formatNextActivity(activitySummary[opp.id]?.nextActivity ?? null) ?? "—",
      daysSince(opp.last_stage_change_at),
    ]),
  ];

  const handleExportCSV = () => {
    downloadCSV(`pipeline_filtrado_${toDateInputValue(new Date())}.csv`, getExportRows());
  };

  const handleExportPDF = () => {
    const rows = getExportRows();
    const htmlRows = rows.map((row, index) => `<tr>${row.map((cell) => index === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return toast.error("Permita pop-ups para exportar o PDF");
    printWindow.document.write(`<!doctype html><html><head><title>Pipeline filtrado</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{font-size:12px;margin:0 0 16px;color:#555}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f3f4f6;font-weight:700}td:nth-child(4),td:nth-child(10){text-align:right}@page{size:landscape;margin:12mm}</style></head><body><h1>Pipeline filtrado</h1><p>${sortedFiltered.length} oportunidade(s) exportada(s) em ${new Date().toLocaleString("pt-BR")}</p><table>${htmlRows}</table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const resetForm = () =>
    setForm({ brand: "", value: "", stage: "prospect", expected_close_date: "", property_id: "none", notes: "" });

  const resetLossForm = () => setLossForm({ reason: "", comment: "", competitor: "", value: "" });

  const handleCreateFunnel = async () => {
    if (!orgId) return;
    const name = funnelForm.name.trim();
    if (name.length < 2) return toast.error("Informe o nome do funil");
    const { data, error } = await supabase
      .from("pipeline_funnels")
      .insert({ organization_id: orgId, name, description: funnelForm.description.trim() || null, position: funnels.length })
      .select("id")
      .single();
    if (error) return toast.error("Erro ao criar funil: " + error.message);
    toast.success("Funil criado");
    setFunnelDialogOpen(false);
    setFunnelForm({ name: "", description: "" });
    await fetchData();
    if (data?.id) setActiveFunnelId(data.id);
  };

  const openSlaDialog = () => {
    setSlaForm(Object.fromEntries(effectiveStages.map((stage) => [stage.id, stage.slaDays?.toString() ?? ""])) as Record<Stage, string>);
    setSlaDialogOpen(true);
  };

  const handleSaveSlas = async () => {
    if (!orgId) return;
    const funnelId = activeFunnelId === "all" ? funnels.find((funnel) => funnel.is_default)?.id ?? null : activeFunnelId;
    setSavingSlas(true);
    const rows = STAGES.map((stage) => ({
      organization_id: orgId,
      pipeline_funnel_id: funnelId,
      stage: stage.id,
      sla_days: slaForm[stage.id] === "" ? null : Math.max(0, Number(slaForm[stage.id]) || 0),
      is_active: true,
    }));
    const { error } = await supabase.from("pipeline_stage_slas" as any).upsert(rows, { onConflict: "organization_id,pipeline_funnel_id,stage" });
    setSavingSlas(false);
    if (error) return toast.error("Erro ao salvar SLAs: " + error.message);
    toast.success("SLAs atualizados");
    setSlaDialogOpen(false);
    fetchData();
  };

  const handleCreate = async () => {
    if (!user || !orgId) return;
    if (!form.brand.trim()) {
      toast.error("Informe a marca");
      return;
    }
    const { error } = await supabase.from("opportunities").insert({
      owner_id: user.id,
      organization_id: orgId,
      brand: form.brand.trim(),
      value: Number(form.value) || 0,
      stage: form.stage,
      pipeline_funnel_id: activeFunnelId === "all" ? funnels.find((funnel) => funnel.is_default)?.id ?? null : activeFunnelId,
      expected_close_date: form.expected_close_date || null,
      property_id: form.property_id === "none" ? null : form.property_id,
      notes: form.notes || null,
    });
    if (error) {
      await logBackendDbError({
        table: "opportunities",
        action: "INSERT",
        clientFile: "src/pages/dashboard/Pipeline.tsx",
        clientLine: 219,
        organizationId: orgId,
        attemptedRowKeys: ["owner_id", "organization_id", "brand", "value", "stage", "expected_close_date", "property_id", "notes"],
        error,
      });
      toast.error("Erro ao criar oportunidade: " + error.message);
      return;
    }
    toast.success("Oportunidade criada");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    if (!orgId) return;
    const { error } = await supabase.from("opportunities").delete().eq("id", deleteId).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Oportunidade removida");
    setDeleteId(null);
    fetchData();
  };

  const handleQuickAssigneeChange = async (oppId: string, assigneeId: string | null) => {
    if (!orgId) return;
    const previous = opportunities;
    setOpportunities((prev) => prev.map((o) => (o.id === oppId ? { ...o, assignee_id: assigneeId } : o)));
    const { error } = await supabase.from("opportunities").update({ assignee_id: assigneeId }).eq("id", oppId).eq("organization_id", orgId);
    if (error) {
      setOpportunities(previous);
      toast.error("Erro ao trocar responsável");
      return;
    }
    toast.success("Responsável atualizado");
  };

  const handleQuickTaskAssigneeChange = async (activityId: string, assigneeId: string) => {
    const { error } = await supabase.from("opportunity_activities").update({ owner_id: assigneeId }).eq("id", activityId);
    if (error) return toast.error("Erro ao atribuir tarefa");
    toast.success("Tarefa atribuída");
    fetchData();
  };

  const getRecommendationReasons = (opp: Opportunity) => {
    const reasons: string[] = [];
    const priority = prioritiesById[opp.id];
    const activity = activitySummary[opp.id];
    if (priority?.label === "Alta") reasons.push(`score ${priority.score}`);
    if (isStaleWithCurrentSla(opp)) reasons.push(`${daysSince(opp.last_stage_change_at)}d parada`);
    if (isOpportunityOverdue(opp)) reasons.push("fechamento vencido");
    if (!activity?.nextActivity) reasons.push("sem próxima ação");
    if (!opp.assignee_id) reasons.push("sem responsável");
    return reasons;
  };

  const handlePrioritizeDay = async () => {
    if (!user) return;
    const candidates = opportunities
      .filter((o) => o.stage !== "fechado" && o.stage !== "perdido")
      .map((o) => ({ opp: o, priority: prioritiesById[o.id], reasons: getRecommendationReasons(o) }))
      .filter((item) => item.reasons.length > 0)
      .sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0) || daysSince(b.opp.last_stage_change_at) - daysSince(a.opp.last_stage_change_at))
      .slice(0, 5);
    if (candidates.length === 0) return toast.success("Nenhuma ação crítica para hoje");

    setPrioritizing(true);
    try {
      const recommendations = await Promise.all(candidates.map(async ({ opp, priority, reasons }) => {
        const { data, error } = await supabase.functions.invoke("suggest-next-steps", {
          body: { context: "opportunity", target_id: opp.id },
        });
        const response = data as SuggestedStepsResponse | null;
        if (error || response?.error) throw new Error(response?.error || error?.message || "Erro ao gerar sugestão");
        const steps = response?.steps ?? [];
        const step = steps.find((s) => s.priority === "alta") ?? steps[0];
        return step ? { opportunity: opp, priority, reasons, step, selected: true } : null;
      }));
      setBoardRecommendations(recommendations.filter(Boolean) as BoardRecommendation[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao priorizar o dia");
    } finally {
      setPrioritizing(false);
    }
  };

  const handleCreateBatchTasks = async () => {
    if (!user) return;
    const selected = boardRecommendations.filter((item) => item.selected);
    if (selected.length === 0) return toast.error("Selecione ao menos uma sugestão");
    setCreatingBatchTasks(true);
    const rows = selected.map(({ opportunity, step }) => {
      const due = new Date();
      due.setDate(due.getDate() + step.due_in_days);
      return {
        opportunity_id: opportunity.id,
        organization_id: orgId,
        owner_id: user.id,
        title: step.title,
        description: step.description,
        activity_type: step.activity_type,
        due_date: due.toISOString(),
        status: "pendente",
      };
    });
    const { error } = await supabase.from("opportunity_activities").insert(rows);
    setCreatingBatchTasks(false);
    if (error) return toast.error("Erro ao criar tarefas em lote");
    toast.success(`${rows.length} tarefa(s) criada(s)`);
    setBoardRecommendations([]);
    fetchData();
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const moveOpportunityToStage = async (opp: Opportunity, newStage: Stage) => {
    if (!orgId || opp.stage === newStage) return;

    const checklistIssues = getOpportunityStageChecklistIssues(
      { ...opp, pendingActivities: activitySummary[opp.id]?.pending ?? 0 },
      newStage,
    );
    if (checklistIssues.length > 0) {
      setMissingInfo({
        title: "Não é possível avançar de etapa",
        description: `Complete os itens abaixo em "${opp.brand}" para mover a oportunidade.`,
        items: checklistIssues,
        actionLabel: "Abrir oportunidade",
        onAction: () => setDrawerId(opp.id),
      });
      return;
    }

    if (newStage === "perdido") {
      setPendingLossId(opp.id);
      setLossForm({
        reason: opp.lost_reason ?? "",
        comment: opp.lost_comment ?? "",
        competitor: opp.lost_competitor ?? "",
        value: opp.lost_value != null ? String(opp.lost_value) : String(Number(opp.value) || 0),
      });
      return;
    }

    setOpportunities((prev) =>
      prev.map((o) => (o.id === opp.id ? { ...o, stage: newStage, last_stage_change_at: new Date().toISOString(), lost_reason: null, lost_comment: null, lost_competitor: null, lost_value: null } : o)),
    );
    const { error } = await supabase.from("opportunities").update({ stage: newStage, lost_reason: null, lost_comment: null, lost_competitor: null, lost_value: null }).eq("id", opp.id).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao mover oportunidade");
      fetchData();
    }
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const oppId = String(active.id);
    const newStage = String(over.id) as Stage;
    const opp = opportunities.find((o) => o.id === oppId);
    if (!opp || opp.stage === newStage) return;
    await moveOpportunityToStage(opp, newStage);
  };

  const handleConfirmLoss = async () => {
    if (!pendingLossId || !orgId) return;
    const reason = lossForm.reason.trim();
    const comment = lossForm.comment.trim();
    const competitor = lossForm.competitor.trim();
    const lostValue = lossForm.value === "" ? null : Number(lossForm.value);
    if (reason.length < 2) return toast.error("Informe o motivo da perda");
    if (comment.length < 2) return toast.error("Informe um comentário sobre a perda");
    if (reason.length > 120) return toast.error("Motivo deve ter no máximo 120 caracteres");
    if (comment.length > 1000) return toast.error("Comentário deve ter no máximo 1000 caracteres");
    if (competitor.length > 120) return toast.error("Concorrente deve ter no máximo 120 caracteres");
    if (lostValue !== null && (!Number.isFinite(lostValue) || lostValue < 0)) return toast.error("Valor perdido inválido");

    setOpportunities((prev) => prev.map((o) => o.id === pendingLossId ? { ...o, stage: "perdido", last_stage_change_at: new Date().toISOString(), lost_reason: reason, lost_comment: comment, lost_competitor: competitor || null, lost_value: lostValue } : o));
    const { error } = await supabase.from("opportunities").update({ stage: "perdido", lost_reason: reason, lost_comment: comment, lost_competitor: competitor || null, lost_value: lostValue }).eq("id", pendingLossId).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao marcar como perdido");
      fetchData();
      return;
    }
    toast.success("Perda registrada");
    setPendingLossId(null);
    resetLossForm();
  };

  const activeOpp = activeId ? opportunities.find((o) => o.id === activeId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline comercial</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste os cards entre as colunas. Clique em um card para detalhes, atividades e ações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrioritizeDay} disabled={prioritizing || loading}>
            {prioritizing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Priorizar meu dia
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInsights((current) => !current)}>
            <Activity className="h-4 w-4 mr-2" /> {showInsights ? "Ocultar Atenção hoje" : "Ver Atenção hoje"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setProbDialogOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" /> Probabilidades
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={openSlaDialog}>
              <Clock className="h-4 w-4 mr-2" /> SLAs
            </Button>
          )}
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova oportunidade</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nova oportunidade</DialogTitle>
                <DialogDescription>Cadastre uma oportunidade de patrocínio no pipeline.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="brand">Marca *</Label>
                  <Input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ex.: Nike" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="value">Valor (R$)</Label>
                    <Input id="value" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="50000" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="stage">Estágio</Label>
                    <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as Stage })}>
                      <SelectTrigger id="stage"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (<SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="property">Propriedade</Label>
                    <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                      <SelectTrigger id="property"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="close">Data prevista</Label>
                    <Input id="close" type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <PipelineMetrics opportunities={opportunities} probabilities={probabilities} />

      {showInsights && (
        <>
          <AttentionToday alerts={attentionAlerts} />

          <StageConversionBottlenecks steps={conversionByStage} />

          <LossesByReason items={lossesByReason} />

          <AssigneePerformanceDashboard items={performanceByAssignee} />
        </>
      )}

      {boardRecommendations.length > 0 && (
        <BoardRecommendations
          recommendations={boardRecommendations}
          onToggle={(id) => setBoardRecommendations((prev) => prev.map((item) => item.opportunity.id === id ? { ...item, selected: !item.selected } : item))}
          onMove={(id, direction) => setBoardRecommendations((prev) => moveRecommendation(prev, id, direction))}
          onCreateTasks={handleCreateBatchTasks}
          creating={creatingBatchTasks}
          onDismiss={() => setBoardRecommendations([])}
        />
      )}

      <Card className="p-3 space-y-3 sticky top-0 z-20 bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltersCollapsed((c) => !c)}
              aria-label={filtersCollapsed ? "Expandir painel de filtros" : "Recolher painel de filtros"}
              title={filtersCollapsed ? "Expandir" : "Recolher"}
            >
              {filtersCollapsed ? <PanelRightOpen className="h-4 w-4 mr-2" /> : <PanelRightOpen className="h-4 w-4 mr-2 rotate-180" />}
              Filtros
            </Button>
          </div>
        </div>

        {!filtersCollapsed && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={activeFunnelId} onValueChange={setActiveFunnelId}>
              <SelectTrigger className="w-[210px] h-9"><SelectValue placeholder="Funil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {funnels.map((funnel) => (
                  <SelectItem key={funnel.id} value={funnel.id}>{funnel.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Dialog open={funnelDialogOpen} onOpenChange={(open) => { setFunnelDialogOpen(open); if (!open) setFunnelForm({ name: "", description: "" }); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Plus className="h-4 w-4 mr-1.5" /> Funil
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Novo funil</DialogTitle>
                    <DialogDescription>Crie um funil separado para organizar oportunidades.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                      <Label htmlFor="funnel-name">Nome *</Label>
                      <Input id="funnel-name" value={funnelForm.name} onChange={(e) => setFunnelForm({ ...funnelForm, name: e.target.value })} placeholder="Ex.: Patrocínios 2026" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="funnel-description">Descrição</Label>
                      <Textarea id="funnel-description" rows={3} value={funnelForm.description} onChange={(e) => setFunnelForm({ ...funnelForm, description: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setFunnelDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleCreateFunnel}>Criar funil</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por marca, sponsor, propriedade, notas ou responsável..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterProperty} onValueChange={setFilterProperty}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Propriedade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas propriedades</SelectItem>
                {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterAssignee} onValueChange={setFilterAssignee}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos responsáveis</SelectItem>
                <SelectItem value="none">Sem responsável</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.company || p.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showStaleOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowStaleOnly((s) => !s)}
              className="h-9"
            >
              <AlertTriangle className="h-4 w-4 mr-1.5" />
              Paradas {staleCount > 0 && `(${staleCount})`}
            </Button>
            <Button
              variant={advancedOpen || activeAdvancedFilters > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="h-9"
            >
              <Filter className="h-4 w-4 mr-1.5" />
              Filtros avançados {activeAdvancedFilters > 0 && `(${activeAdvancedFilters})`}
            </Button>
            <div className="flex items-center gap-2">
              <PipelineSortSelect value={sortMode} onChange={setSortMode} />
              {sortMode !== DEFAULT_PIPELINE_SORT_MODE && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSortMode(DEFAULT_PIPELINE_SORT_MODE)}
                  title="Limpar ordenação"
                  aria-label="Limpar ordenação"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <PipelineViewToggle value={viewMode} onChange={setViewMode} />
            {viewMode === "list" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={handleExportCSV} disabled={sortedFiltered.length === 0}>
                  <FileDown className="h-4 w-4 mr-1.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="h-9" onClick={handleExportPDF} disabled={sortedFiltered.length === 0}>
                  <FileDown className="h-4 w-4 mr-1.5" /> PDF
                </Button>
              </div>
            )}
          </div>
        )}

        {advancedOpen && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Faixa de valor</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Mín."
                    value={minValue}
                    onChange={(e) => setMinValue(e.target.value)}
                    className="h-9"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Máx."
                    value={maxValue}
                    onChange={(e) => setMaxValue(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Fechamento previsto</Label>
                <div className="grid grid-cols-2 gap-2">
                  <DateFilterButton value={closeFrom} onChange={setCloseFrom} placeholder="De" />
                  <DateFilterButton value={closeTo} onChange={setCloseTo} placeholder="Até" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Etapa</Label>
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas etapas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas etapas</SelectItem>
                    {STAGES.map((stage) => (<SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Sponsor</Label>
                <Select value={filterSponsor} onValueChange={setFilterSponsor}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos sponsors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos sponsors</SelectItem>
                    <SelectItem value="none">Sem sponsor</SelectItem>
                    {sponsors.map((sponsor) => (<SelectItem key={sponsor.id} value={sponsor.id}>{sponsor.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={showNoActivityOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowNoActivityOnly((value) => !value)}
                className="h-9"
              >
                <Activity className="h-4 w-4 mr-1.5" />
                Sem atividade {noActivityCount > 0 && `(${noActivityCount})`}
              </Button>
              <Button
                variant={showOverdueOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOverdueOnly((value) => !value)}
                className="h-9"
              >
                <Clock className="h-4 w-4 mr-1.5" />
                Vencidas {overdueCount > 0 && `(${overdueCount})`}
              </Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="created-last-days" className="text-xs text-muted-foreground whitespace-nowrap">Criadas nos últimos</Label>
                <Input
                  id="created-last-days"
                  type="number"
                  min="1"
                  placeholder="X"
                  value={createdLastDays}
                  onChange={(e) => setCreatedLastDays(e.target.value)}
                  className="h-9 w-20"
                />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
              {activeAdvancedFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={resetAdvancedFilters} className="h-9">
                  <X className="h-4 w-4 mr-1.5" />
                  Limpar avançados
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando pipeline...</div>
      ) : viewMode === "kanban" ? (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
            {effectiveStages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                items={grouped[stage.id]}
                total={totals[stage.id]}
                onDelete={(id) => setDeleteId(id)}
                onOpen={(id) => setDrawerId(id)}
                propertiesById={propertiesById}
                profilesById={profilesById}
                profiles={profiles}
                activitySummary={activitySummary}
                prioritiesById={prioritiesById}
                onAssigneeChange={handleQuickAssigneeChange}
                onTaskAssigneeChange={handleQuickTaskAssigneeChange}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOpp ? (
              <OpportunityCard
                opp={activeOpp}
                stages={effectiveStages}
                propertyName={activeOpp.property_id ? propertiesById[activeOpp.property_id] ?? null : null}
                assigneeName={activeOpp.assignee_id ? profilesById[activeOpp.assignee_id] ?? null : null}
                nextActivity={activitySummary[activeOpp.id]?.nextActivity ?? null}
                priority={prioritiesById[activeOpp.id]}
                dragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : viewMode === "list" ? (
        <PipelineTableView
          items={sortedFiltered}
          propertiesById={propertiesById}
          profilesById={profilesById}
          activitySummary={activitySummary}
          prioritiesById={prioritiesById}
          sortMode={sortMode}
          onSortChange={setSortMode}
          onOpen={setDrawerId}
          onDelete={setDeleteId}
          stages={effectiveStages}
        />
      ) : (
        <PipelineCompactView
          items={sortedFiltered}
          propertiesById={propertiesById}
          profilesById={profilesById}
          activitySummary={activitySummary}
          prioritiesById={prioritiesById}
          onOpen={setDrawerId}
          onDelete={setDeleteId}
          onStageChange={moveOpportunityToStage}
          stages={effectiveStages}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!pendingLossId} onOpenChange={(open) => { if (!open) { setPendingLossId(null); resetLossForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar oportunidade perdida</DialogTitle>
            <DialogDescription>Informe os dados da perda antes de mover a oportunidade para Perdido.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="loss-reason">Motivo da perda *</Label>
              <Input id="loss-reason" maxLength={120} value={lossForm.reason} onChange={(e) => setLossForm({ ...lossForm, reason: e.target.value })} placeholder="Ex.: Preço, timing, escopo" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="loss-comment">Comentário *</Label>
              <Textarea id="loss-comment" rows={3} maxLength={1000} value={lossForm.comment} onChange={(e) => setLossForm({ ...lossForm, comment: e.target.value })} placeholder="Contexto da decisão e próximos aprendizados" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="loss-competitor">Concorrente</Label>
                <Input id="loss-competitor" maxLength={120} value={lossForm.competitor} onChange={(e) => setLossForm({ ...lossForm, competitor: e.target.value })} placeholder="Se houver" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="loss-value">Valor perdido (R$)</Label>
                <Input id="loss-value" type="number" min="0" value={lossForm.value} onChange={(e) => setLossForm({ ...lossForm, value: e.target.value })} placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPendingLossId(null); resetLossForm(); }}>Cancelar</Button>
            <Button onClick={handleConfirmLoss}>Registrar perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MissingInfoDialog state={missingInfo} onOpenChange={(o) => !o && setMissingInfo(null)} />

      <OpportunityDrawer
        opportunityId={drawerId}
        open={!!drawerId}
        onOpenChange={(o) => !o && setDrawerId(null)}
        properties={properties}
        sponsors={sponsors}
        profiles={profiles}
        onChanged={fetchData}
      />

      <Dialog open={slaDialogOpen} onOpenChange={setSlaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>SLAs por etapa</DialogTitle>
            <DialogDescription>Defina o limite de dias que uma oportunidade pode ficar em cada etapa do funil selecionado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {STAGES.map((stage) => (
              <div key={stage.id} className="grid grid-cols-[1fr_120px] items-center gap-3">
                <Label htmlFor={`sla-${stage.id}`} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${stage.color}`} />
                  {stage.label}
                </Label>
                <Input
                  id={`sla-${stage.id}`}
                  type="number"
                  min="0"
                  placeholder="Sem SLA"
                  value={slaForm[stage.id] ?? ""}
                  onChange={(e) => setSlaForm({ ...slaForm, [stage.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveSlas} disabled={savingSlas}>{savingSlas && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar SLAs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StageProbabilitiesDialog
        open={probDialogOpen}
        onOpenChange={setProbDialogOpen}
        current={probabilities}
        onSaved={setProbabilities}
      />
    </div>
  );
}

function DateFilterButton({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const selected = parseDateInput(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 justify-start px-3 text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="h-4 w-4 mr-2" />
          <span className="truncate">{value ? formatFilterDate(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DatePickerCalendar
          mode="single"
          selected={selected}
          onSelect={(date) => onChange(date ? toDateInputValue(date) : "")}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

function PipelineViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  const options: { value: ViewMode; label: string; icon: typeof Columns3 }[] = [
    { value: "kanban", label: "Kanban", icon: Columns3 },
    { value: "list", label: "Lista", icon: Table2 },
    { value: "compact", label: "Compacta", icon: Rows3 },
  ];

  return (
    <div className="flex items-center rounded-md border border-border bg-background p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-2.5"
            onClick={() => onChange(option.value)}
          >
            <Icon className="h-4 w-4 mr-1.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function PipelineSortSelect({ value, onChange }: { value: SortMode; onChange: (value: SortMode) => void }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as SortMode)}>
      <SelectTrigger className="w-[190px] h-9">
        <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
        <SelectValue placeholder="Ordenar por" />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AttentionToday({ alerts }: { alerts: AttentionAlert[] }) {
  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Atenção hoje</h2>
        </div>
        <Badge variant={total > 0 ? "destructive" : "secondary"}>{total}</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {alerts.map((alert) => (
          <div key={alert.key} className="rounded-md border border-border bg-background p-3 min-h-[92px]">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground leading-snug">{alert.label}</span>
              <Badge variant={alert.count > 0 ? "default" : "outline"}>{alert.count}</Badge>
            </div>
            <p className="mt-2 text-xs font-medium leading-snug line-clamp-2">
              {alert.detail || "Nenhum item crítico"}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StageConversionBottlenecks({ steps }: { steps: (ConversionStep & { fromCount: number; convertedCount: number; rate: number })[] }) {
  const weakest = steps.reduce((current, step) => (step.rate < current.rate ? step : current), steps[0]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Conversão por etapa</h2>
        </div>
        {weakest && <Badge variant="outline">Gargalo: {weakest.label}</Badge>}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => (
          <div key={step.key} className={cn("rounded-md border border-border bg-background p-3", weakest?.key === step.key && "border-amber-500/60 bg-amber-500/5")}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground leading-snug">{step.label}</span>
              <Badge variant={weakest?.key === step.key ? "default" : "secondary"}>{step.rate}%</Badge>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-2xl font-semibold tracking-tight">{step.convertedCount}</div>
                <div className="text-xs text-muted-foreground">de {step.fromCount}</div>
              </div>
              <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(step.rate, 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LossesByReason({ items }: { items: { key: string; label: string; count: number; value: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const topReason = items.reduce((current, item) => (item.count > current.count ? item : current), items[0]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Perdas por motivo</h2>
        </div>
        <Badge variant="secondary">{total} perdidas</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => {
          const rate = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.key} className={cn("rounded-md border border-border bg-background p-3", topReason?.key === item.key && item.count > 0 && "border-destructive/50 bg-destructive/5")}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-muted-foreground leading-snug">{item.label}</span>
                <Badge variant={item.count > 0 ? "outline" : "secondary"}>{item.count}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                <div className="text-sm font-semibold">{formatBRL(item.value)}</div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-destructive" style={{ width: `${rate}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">{rate}% das perdas</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AssigneePerformanceDashboard({ items }: { items: AssigneePerformance[] }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Performance por responsável</h2>
        </div>
        <Badge variant="secondary">{items.length} responsável(is)</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium">Responsável</th>
              <th className="py-2 px-3 text-right font-medium">Aberto</th>
              <th className="py-2 px-3 text-right font-medium">Pipeline</th>
              <th className="py-2 px-3 text-right font-medium">Conversão</th>
              <th className="py-2 px-3 text-right font-medium">Ciclo médio</th>
              <th className="py-2 pl-3 text-right font-medium">Paradas</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma oportunidade encontrada.</td></tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-b border-border/70 last:border-0">
                <td className="py-3 pr-3 font-medium min-w-[180px]">{item.name}</td>
                <td className="py-3 px-3 text-right">{item.openCount}</td>
                <td className="py-3 px-3 text-right font-semibold text-primary whitespace-nowrap">{formatBRL(item.pipelineValue)}</td>
                <td className="py-3 px-3 text-right">{item.conversionRate}%</td>
                <td className="py-3 px-3 text-right whitespace-nowrap">{item.averageCycleDays === null ? "—" : `${item.averageCycleDays}d`}</td>
                <td className="py-3 pl-3 text-right">
                  <Badge variant={item.staleCount > 0 ? "outline" : "secondary"} className={item.staleCount > 0 ? "border-amber-500/60 text-amber-600" : ""}>
                    {item.staleCount}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function BoardRecommendations({
  recommendations,
  onToggle,
  onMove,
  onCreateTasks,
  creating,
  onDismiss,
}: {
  recommendations: BoardRecommendation[];
  onToggle: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onCreateTasks: () => void;
  creating: boolean;
  onDismiss: () => void;
}) {
  const selectedCount = recommendations.filter((item) => item.selected).length;

  return (
    <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Cards recomendados para hoje</h2>
          <Badge variant="secondary">{recommendations.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss}>Dispensar</Button>
          <Button size="sm" onClick={onCreateTasks} disabled={creating || selectedCount === 0}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Criar {selectedCount} tarefa(s)
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {recommendations.map((item, index) => (
          <div
            key={item.opportunity.id}
            className={cn(
              "flex items-stretch gap-2 rounded-md border p-2 bg-background transition-colors",
              item.selected ? "border-primary ring-1 ring-primary/30" : "border-border hover:bg-muted/30",
            )}
          >
            <div className="flex flex-col gap-1 pt-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onMove(item.opportunity.id, "up")} disabled={index === 0} aria-label={`Subir ${item.opportunity.brand}`}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onMove(item.opportunity.id, "down")} disabled={index === recommendations.length - 1} aria-label={`Descer ${item.opportunity.brand}`}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <button type="button" onClick={() => onToggle(item.opportunity.id)} className="min-w-0 flex-1 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{index + 1}. {item.opportunity.brand}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{item.reasons.join(" · ")}</div>
                </div>
                <PriorityBadge priority={item.priority} />
              </div>
              <div className="mt-3 rounded-md bg-muted/40 p-2">
                <div className="text-sm font-medium">{item.step.title}</div>
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.step.description}</div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{item.step.activity_type}</Badge>
                  <span>em {item.step.due_in_days}d</span>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority?: OpportunityPriority }) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn(
        "h-2 w-2 rounded-full",
        priority.label === "Alta" ? "bg-destructive" : priority.label === "Média" ? "bg-amber-500" : "bg-muted-foreground",
      )} />
      {priority.score} · {priority.label}
    </Badge>
  );
}

function SortableTableHead({
  children,
  active,
  desc,
  align = "left",
  onClick,
}: {
  children: string;
  active: boolean;
  desc: boolean;
  align?: "left" | "right";
  onClick: () => void;
}) {
  const SortIcon = active ? (desc ? ArrowDown : ArrowUp) : ArrowUpDown;

  return (
    <th aria-sort={active ? (desc ? "descending" : "ascending") : "none"} className={cn("px-4 py-3 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-sm hover:text-foreground", active && "text-primary", align === "right" && "justify-end") }>
        {children}
        <SortIcon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground/60")} />
        {active && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{desc ? "desc" : "asc"}</Badge>}
      </button>
    </th>
  );
}

function PipelineTableView({
  items,
  stages,
  propertiesById,
  profilesById,
  activitySummary,
  prioritiesById,
  sortMode,
  onSortChange,
  onOpen,
  onDelete,
}: {
  items: Opportunity[];
  stages: StageConfig[];
  propertiesById: Record<string, string>;
  profilesById: Record<string, string>;
  activitySummary: Record<string, ActivitySummary>;
  prioritiesById: Record<string, OpportunityPriority>;
  sortMode: SortMode;
  onSortChange: (sortMode: SortMode) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <PipelineEmptyState />;

  const toggleSort = (asc: SortMode, desc: SortMode) => onSortChange(sortMode === asc ? desc : asc);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium">Marca</th>
              <SortableTableHead active={sortMode === "stage_asc" || sortMode === "stage_desc"} desc={sortMode === "stage_desc"} onClick={() => toggleSort("stage_asc", "stage_desc")}>Estágio</SortableTableHead>
              <th className="px-4 py-3 text-left font-medium">Score</th>
              <SortableTableHead align="right" active={sortMode === "value_asc" || sortMode === "value_desc"} desc={sortMode === "value_desc"} onClick={() => toggleSort("value_asc", "value_desc")}>Valor</SortableTableHead>
              <th className="px-4 py-3 text-left font-medium">Propriedade</th>
              <SortableTableHead active={sortMode === "assignee" || sortMode === "assignee_desc"} desc={sortMode === "assignee_desc"} onClick={() => toggleSort("assignee", "assignee_desc")}>Responsável</SortableTableHead>
              <SortableTableHead active={sortMode === "close_date" || sortMode === "close_date_desc"} desc={sortMode === "close_date_desc"} onClick={() => toggleSort("close_date", "close_date_desc")}>Data prevista</SortableTableHead>
              <th className="px-4 py-3 text-left font-medium">Próxima ação</th>
              <th className="px-4 py-3 text-left font-medium">Movimento</th>
              <th className="px-4 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((opp) => {
              const stage = getStageMeta(opp.stage, stages);
              const stale = isOpportunityStale(opp, stages);
              const slaDays = getStageSlaDays(opp.stage, stages);
              const nextActivityLabel = formatNextActivity(activitySummary[opp.id]?.nextActivity ?? null);
              const priority = prioritiesById[opp.id];
              return (
                <tr
                  key={opp.id}
                  className="border-b border-border/70 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onOpen(opp.id)}
                >
                  <td className="px-4 py-3 font-medium min-w-[180px]">{opp.brand}</td>
                  <td className="px-4 py-3 min-w-[150px]">
                    <Badge variant="outline" className="gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${stage.color}`} />
                      {stage.label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><PriorityBadge priority={priority} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap">{formatBRL(Number(opp.value))}</td>
                  <td className="px-4 py-3 text-muted-foreground min-w-[180px]">{opp.property_id ? propertiesById[opp.property_id] ?? "—" : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground min-w-[160px]">{opp.assignee_id ? profilesById[opp.assignee_id] ?? "—" : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(opp.expected_close_date) ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground min-w-[180px]">{nextActivityLabel ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {stale ? (
                      <Badge variant="outline" className="border-amber-500/60 text-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {daysSince(opp.last_stage_change_at)}d / SLA {slaDays}d
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{daysSince(opp.last_stage_change_at)}d</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(opp.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PipelineCompactView({
  items,
  stages,
  propertiesById,
  profilesById,
  activitySummary,
  prioritiesById,
  onOpen,
  onDelete,
  onStageChange,
}: {
  items: Opportunity[];
  stages: StageConfig[];
  propertiesById: Record<string, string>;
  profilesById: Record<string, string>;
  activitySummary: Record<string, ActivitySummary>;
  prioritiesById: Record<string, OpportunityPriority>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onStageChange: (opp: Opportunity, stage: Stage) => void;
}) {
  if (items.length === 0) return <PipelineEmptyState />;

  return (
    <div className="grid gap-2">
      {items.map((opp) => {
        const stage = getStageMeta(opp.stage, stages);
        const stale = isOpportunityStale(opp, stages);
        const slaDays = getStageSlaDays(opp.stage, stages);
        const propertyName = opp.property_id ? propertiesById[opp.property_id] : null;
        const assigneeName = opp.assignee_id ? profilesById[opp.assignee_id] : null;
        const nextActivityLabel = formatNextActivity(activitySummary[opp.id]?.nextActivity ?? null);
        const priority = prioritiesById[opp.id];
        return (
          <Card
            key={opp.id}
            className={`p-3 cursor-pointer hover:bg-muted/30 transition-colors ${stale ? "border-amber-500/60" : ""}`}
            onClick={() => onOpen(opp.id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${stage.color}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{opp.brand}</h3>
                  <PriorityBadge priority={priority} />
                  <Badge variant="secondary" className="text-[10px] py-0 flex-shrink-0">{stage.label}</Badge>
                  {stale && (
                    <Badge variant="outline" className="text-[10px] py-0 border-amber-500/60 text-amber-600 flex-shrink-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                      {daysSince(opp.last_stage_change_at)}d / SLA {slaDays}d
                    </Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {propertyName && <span className="truncate max-w-[220px]">{propertyName}</span>}
                  {assigneeName && <span className="truncate max-w-[180px]">{assigneeName}</span>}
                  {opp.expected_close_date && <span>{formatDate(opp.expected_close_date)}</span>}
                  {nextActivityLabel && <span className="font-medium text-foreground truncate max-w-[220px]">{nextActivityLabel}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <span className="font-semibold text-primary whitespace-nowrap">{formatBRL(Number(opp.value))}</span>
                <Select value={opp.stage} onValueChange={(value) => onStageChange(opp, value as Stage)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stageOption) => (
                      <SelectItem key={stageOption.id} value={stageOption.id}>{stageOption.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(opp.id);
                  }}
                  aria-label="Abrir detalhes"
                >
                  <PanelRightOpen className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(opp.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PipelineEmptyState() {
  return (
    <Card className="p-8 text-center text-sm text-muted-foreground">
      Nenhuma oportunidade encontrada com os filtros atuais.
    </Card>
  );
}

function KanbanColumn({
  stage,
  items,
  total,
  onDelete,
  onOpen,
  propertiesById,
  profilesById,
  profiles,
  activitySummary,
  prioritiesById,
  onAssigneeChange,
  onTaskAssigneeChange,
}: {
  stage: { id: Stage; label: string; color: string; slaDays: number | null };
  items: Opportunity[];
  total: number;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  propertiesById: Record<string, string>;
  profilesById: Record<string, string>;
  profiles: Profile[];
  activitySummary: Record<string, ActivitySummary>;
  prioritiesById: Record<string, OpportunityPriority>;
  onAssigneeChange: (oppId: string, assigneeId: string | null) => void;
  onTaskAssigneeChange: (activityId: string, assigneeId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 bg-muted/40 rounded-lg p-3 flex flex-col transition-colors ${
        isOver ? "ring-2 ring-primary bg-muted" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${stage.color}`} />
          <h3 className="text-sm font-semibold">{stage.label}</h3>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
          {stage.slaDays && <Badge variant="outline" className="text-[10px]">SLA {stage.slaDays}d</Badge>}
        </div>
        <span className="text-xs text-muted-foreground font-medium">{formatBRL(total)}</span>
      </div>
      <div className="flex flex-col gap-2 min-h-[100px]">
        {items.map((o) => (
          <DraggableCard
            key={o.id}
            opp={o}
            stages={[stage]}
            propertyName={o.property_id ? propertiesById[o.property_id] ?? null : null}
            assigneeName={o.assignee_id ? profilesById[o.assignee_id] ?? null : null}
            nextActivity={activitySummary[o.id]?.nextActivity ?? null}
            priority={prioritiesById[o.id]}
            profiles={profiles}
            onDelete={onDelete}
            onOpen={onOpen}
            onAssigneeChange={onAssigneeChange}
            onTaskAssigneeChange={onTaskAssigneeChange}
          />
        ))}
        {items.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">
            Solte aqui
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  opp,
  stages,
  propertyName,
  assigneeName,
  nextActivity,
  priority,
  profiles,
  onDelete,
  onOpen,
  onAssigneeChange,
  onTaskAssigneeChange,
}: {
  opp: Opportunity;
  stages?: StageConfig[];
  propertyName: string | null;
  assigneeName: string | null;
  nextActivity: NextActivity | null;
  priority?: OpportunityPriority;
  profiles: Profile[];
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  onAssigneeChange: (oppId: string, assigneeId: string | null) => void;
  onTaskAssigneeChange: (activityId: string, assigneeId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: opp.id });
  return (
    <div ref={setNodeRef} {...attributes} className={isDragging ? "opacity-40" : ""}>
      <OpportunityCard
        opp={opp}
        stages={stages}
        propertyName={propertyName}
        assigneeName={assigneeName}
        nextActivity={nextActivity}
        priority={priority}
        profiles={profiles}
        dragHandleProps={listeners}
        onDelete={onDelete}
        onOpen={onOpen}
        onAssigneeChange={onAssigneeChange}
        onTaskAssigneeChange={onTaskAssigneeChange}
      />
    </div>
  );
}

function OpportunityCard({
  opp,
  stages = STAGES,
  propertyName,
  assigneeName,
  nextActivity,
  priority,
  profiles = [],
  dragHandleProps,
  onDelete,
  onOpen,
  onAssigneeChange,
  onTaskAssigneeChange,
  dragging,
}: {
  opp: Opportunity;
  stages?: StageConfig[];
  propertyName: string | null;
  assigneeName: string | null;
  nextActivity?: NextActivity | null;
  priority?: OpportunityPriority;
  profiles?: Profile[];
  dragHandleProps?: ComponentProps<"button">;
  onDelete?: (id: string) => void;
  onOpen?: (id: string) => void;
  onAssigneeChange?: (oppId: string, assigneeId: string | null) => void;
  onTaskAssigneeChange?: (activityId: string, assigneeId: string) => void;
  dragging?: boolean;
}) {
  const isStale = isOpportunityStale(opp, stages);
  const slaDays = getStageSlaDays(opp.stage, stages);
  const nextActivityLabel = formatNextActivity(nextActivity ?? null);

  return (
    <Card
      className={`p-3 group hover:shadow-md transition-shadow cursor-pointer ${
        dragging ? "shadow-lg rotate-2" : ""
      } ${isStale ? "border-amber-500/60" : ""}`}
      onClick={() => onOpen?.(opp.id)}
    >
      <div className="flex items-start gap-2">
        <button
          {...dragHandleProps}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing pt-0.5"
          aria-label="Arrastar"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-sm break-words">{opp.brand}</h4>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <PriorityBadge priority={priority} />
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(opp.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-base font-semibold text-primary mt-1">{formatBRL(Number(opp.value))}</p>
          <div className="mt-2 space-y-1">
            {propertyName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span className="break-words">{propertyName}</span>
              </div>
            )}
            {assigneeName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="break-words">{assigneeName}</span>
              </div>
            )}
            {onAssigneeChange && (
              <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <Select value={opp.assignee_id ?? "none"} onValueChange={(value) => onAssigneeChange(opp.id, value === "none" ? null : value)}>
                  <SelectTrigger className="h-7 w-full text-xs bg-background">
                    <User className="h-3 w-3 mr-1.5 text-muted-foreground" />
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem responsável</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.company || profile.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {opp.expected_close_date && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarIcon className="h-3 w-3" />
                <span>{formatDate(opp.expected_close_date)}</span>
              </div>
            )}
            {nextActivityLabel && (
              <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  <span className="break-words">{nextActivityLabel}</span>
                </div>
                {onTaskAssigneeChange && nextActivity && (
                  <Select value={nextActivity.owner_id} onValueChange={(value) => onTaskAssigneeChange(nextActivity.id, value)}>
                    <SelectTrigger className="h-7 w-full text-xs bg-background">
                      <User className="h-3 w-3 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Atribuir tarefa" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || profile.company || profile.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {isStale && (
              <Badge variant="outline" className="text-[10px] py-0 border-amber-500/60 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                {daysSince(opp.last_stage_change_at)}d sem mover · SLA {slaDays}d
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
