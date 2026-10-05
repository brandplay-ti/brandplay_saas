import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus,
  Calendar,
  Building2,
  Trash2,
  Pencil,
  GripVertical,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Sparkles,
  Search,
  Filter,
  X,
  AlertTriangle,
  PanelRightOpen,
  FileDown,
  Camera,
  Columns3,
  Table2,
  Rows3,

} from "lucide-react";
import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["delivery_status"];
type Approval = Database["public"]["Enums"]["delivery_approval"];

type Delivery = {
  id: string;
  title: string;
  description: string | null;
  brand: string;
  asset_type: string | null;
  quantity: number;
  due_date: string | null;
  delivered_at: string | null;
  evidence_url: string | null;
  notes: string | null;
  status: Status;
  approval: Approval;
  approval_comment: string | null;
  property_id: string | null;
  opportunity_id: string | null;
};

type Property = { id: string; name: string };
type Opportunity = { id: string; brand: string };

type ViewMode = "kanban" | "list" | "compact";


const STATUSES: { id: Status; label: string; color: string }[] = [
  { id: "pendente", label: "Pendente", color: "bg-slate-500" },
  { id: "em_producao", label: "Em produção", color: "bg-blue-500" },
  { id: "entregue", label: "Entregue", color: "bg-amber-500" },
  { id: "aprovada", label: "Aprovada", color: "bg-emerald-500" },
  { id: "atrasada", label: "Atrasada", color: "bg-rose-500" },
];

const ASSET_TYPES = ["Naming", "Placa de campo", "Post nas redes", "Camisa", "Backdrop", "LED", "Ativação", "Outro"];

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null;

const isOverdue = (d: Delivery) => {
  if (!d.due_date) return false;
  if (d.status === "aprovada" || d.status === "entregue") return false;
  return new Date(d.due_date + "T23:59:59") < new Date();
};

export default function Deliveries() {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Delivery | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();


  // ---- Filtros (mesmo padrão do Pipeline) ----
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("deliveries_view_mode") : null;
    return saved === "list" || saved === "compact" || saved === "kanban" ? saved : "kanban";
  });

  useEffect(() => {
    localStorage.setItem("deliveries_view_mode", viewMode);
  }, [viewMode]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterOpportunity, setFilterOpportunity] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterAssetType, setFilterAssetType] = useState("all");
  const [filterApproval, setFilterApproval] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showNoDateOnly, setShowNoDateOnly] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("deliveries_advanced_filters");
      if (stored) {
        const s = JSON.parse(stored);
        setSearch(s.search ?? "");
        setFilterProperty(s.filterProperty ?? "all");
        setFilterOpportunity(s.filterOpportunity ?? "all");
        setFilterBrand(s.filterBrand ?? "all");
        setFilterAssetType(s.filterAssetType ?? "all");
        setFilterApproval(s.filterApproval ?? "all");
        setDueFrom(s.dueFrom ?? "");
        setDueTo(s.dueTo ?? "");
        setShowOverdueOnly(!!s.showOverdueOnly);
        setShowNoDateOnly(!!s.showNoDateOnly);
      }
    } catch { /* ignore */ }
    setFiltersLoaded(true);
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    localStorage.setItem("deliveries_advanced_filters", JSON.stringify({
      search, filterProperty, filterOpportunity, filterBrand, filterAssetType,
      filterApproval, dueFrom, dueTo, showOverdueOnly, showNoDateOnly,
    }));
  }, [filtersLoaded, search, filterProperty, filterOpportunity, filterBrand, filterAssetType, filterApproval, dueFrom, dueTo, showOverdueOnly, showNoDateOnly]);

  const [form, setForm] = useState({
    title: "",
    brand: "",
    asset_type: "",
    quantity: "1",
    due_date: "",
    description: "",
    notes: "",
    evidence_url: "",
    status: "pendente" as Status,
    property_id: "none",
    opportunity_id: "none",
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = async () => {
    if (!orgId) {
      setDeliveries([]);
      setProperties([]);
      setOpportunities([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: del }, { data: props }, { data: opps }] = await Promise.all([
      supabase.from("deliveries").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
      supabase.from("sports_properties").select("id, name").eq("organization_id", orgId).order("name"),
      supabase.from("opportunities").select("id, brand").eq("organization_id", orgId).order("brand"),
    ]);

    // marcar atrasadas automaticamente
    const list = (del as Delivery[]) ?? [];
    const toUpdate: string[] = [];
    const updated = list.map((d) => {
      if (isOverdue(d) && d.status === "pendente") {
        toUpdate.push(d.id);
        return { ...d, status: "atrasada" as Status };
      }
      return d;
    });
    if (toUpdate.length > 0) {
      await supabase.from("deliveries").update({ status: "atrasada" }).in("id", toUpdate);
    }

    setDeliveries(updated);
    setProperties((props as Property[]) ?? []);
    setOpportunities((opps as Opportunity[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [orgId]);

  // Deep link: /dashboard/entregas?delivery=<id>
  useEffect(() => {
    const target = searchParams.get("delivery");
    if (!target || deliveries.length === 0) return;
    const found = deliveries.find((d) => d.id === target);
    if (found) {
      setDetail(found);
      const next = new URLSearchParams(searchParams);
      next.delete("delivery");
      setSearchParams(next, { replace: true });
    }
  }, [deliveries, searchParams, setSearchParams]);


  const brands = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [deliveries]
  );
  const assetTypes = useMemo(
    () => Array.from(new Set(deliveries.map((d) => d.asset_type).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [deliveries]
  );

  const propertyNameById = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.id, p.name])),
    [properties]
  );

  const activeAdvancedFilters = useMemo(() => {
    let count = 0;
    if (filterBrand !== "all") count++;
    if (filterAssetType !== "all") count++;
    if (filterApproval !== "all") count++;
    if (dueFrom) count++;
    if (dueTo) count++;
    if (showOverdueOnly) count++;
    if (showNoDateOnly) count++;
    return count;
  }, [filterBrand, filterAssetType, filterApproval, dueFrom, dueTo, showOverdueOnly, showNoDateOnly]);

  const resetAdvancedFilters = () => {
    setFilterBrand("all");
    setFilterAssetType("all");
    setFilterApproval("all");
    setDueFrom("");
    setDueTo("");
    setShowOverdueOnly(false);
    setShowNoDateOnly(false);
  };

  const overdueCount = useMemo(() => deliveries.filter(isOverdue).length, [deliveries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (term) {
        const haystack = [
          d.title,
          d.brand,
          d.asset_type,
          d.description,
          d.notes,
          d.property_id ? propertyNameById[d.property_id] : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (filterProperty !== "all") {
        if (filterProperty === "none" ? !!d.property_id : d.property_id !== filterProperty) return false;
      }
      if (filterOpportunity !== "all") {
        if (filterOpportunity === "none" ? !!d.opportunity_id : d.opportunity_id !== filterOpportunity) return false;
      }
      if (filterBrand !== "all" && d.brand !== filterBrand) return false;
      if (filterAssetType !== "all" && (d.asset_type ?? "") !== filterAssetType) return false;
      if (filterApproval !== "all" && d.approval !== filterApproval) return false;
      if (dueFrom && (!d.due_date || d.due_date < dueFrom)) return false;
      if (dueTo && (!d.due_date || d.due_date > dueTo)) return false;
      if (showOverdueOnly && !isOverdue(d)) return false;
      if (showNoDateOnly && d.due_date) return false;
      return true;
    });
  }, [deliveries, search, filterProperty, filterOpportunity, filterBrand, filterAssetType, filterApproval, dueFrom, dueTo, showOverdueOnly, showNoDateOnly, propertyNameById]);

  const grouped = useMemo(() => {
    const map: Record<Status, Delivery[]> = {
      pendente: [], em_producao: [], entregue: [], aprovada: [], atrasada: [],
    };
    for (const d of filtered) map[d.status].push(d);
    return map;
  }, [filtered]);

  const handleExportPDF = () => {
    if (filtered.length === 0) return toast.error("Nenhuma entrega para exportar");
    const esc = (v: unknown) =>
      String(v ?? "-").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;
    const approvalLabel: Record<string, string> = {
      pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada",
    };
    const fullDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "-");
    const fullDateTime = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "-");

    const counts = STATUSES.map((s) => ({ label: s.label, n: filtered.filter((d) => d.status === s.id).length }));
    const overdue = filtered.filter(isOverdue).length;
    const withEvidence = filtered.filter((d) => !!d.evidence_url).length;

    const rows = filtered
      .slice()
      .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
      .map(
        (d) => `<tr>
          <td>${esc(d.title)}${d.description ? `<div class="sub">${esc(d.description)}</div>` : ""}</td>
          <td>${esc(d.brand)}</td>
          <td>${esc(d.asset_type)}</td>
          <td class="num">${esc(d.quantity)}</td>
          <td>${esc(d.property_id ? propertyNameById[d.property_id] : "-")}</td>
          <td>${esc(d.opportunity_id ? opportunities.find((o) => o.id === d.opportunity_id)?.brand : "-")}</td>
          <td>${esc(statusLabel(d.status))}${isOverdue(d) ? '<div class="sub warn">Atrasada</div>' : ""}</td>
          <td>${esc(approvalLabel[d.approval] ?? d.approval)}${d.approval_comment ? `<div class="sub">${esc(d.approval_comment)}</div>` : ""}</td>
          <td>${fullDate(d.due_date)}</td>
          <td>${fullDateTime(d.delivered_at)}</td>
          <td>${d.evidence_url ? `<a href="${esc(d.evidence_url)}">Evidência</a>` : "-"}</td>
          <td>${esc(d.notes)}</td>
        </tr>`
      )
      .join("");

    const header = `<tr><th>Entrega</th><th>Marca</th><th>Tipo</th><th>Qtd</th><th>Propriedade</th><th>Oportunidade</th><th>Status</th><th>Aprovação</th><th>Prev.</th><th>Entregue em</th><th>Evidência</th><th>Notas</th></tr>`;

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return toast.error("Permita pop-ups para exportar o PDF");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de entregas</title><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
      h1{font-size:20px;margin:0 0 4px}
      p.meta{font-size:11px;color:#555;margin:0 0 12px}
      .kpis{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
      .kpi{border:1px solid #ddd;border-radius:6px;padding:6px 10px;font-size:11px}
      .kpi b{display:block;font-size:15px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th,td{border:1px solid #ddd;padding:5px;text-align:left;vertical-align:top}
      th{background:#f3f4f6;font-weight:700}
      td.num{text-align:right}
      .sub{color:#666;font-size:9px;margin-top:2px}
      .warn{color:#b91c1c;font-weight:700}
      @page{size:landscape;margin:10mm}
    </style></head><body>
      <h1>Relatório de entregas</h1>
      <p class="meta">${filtered.length} entrega(s) — gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <div class="kpis">
        ${counts.map((c) => `<div class="kpi">${c.label}<b>${c.n}</b></div>`).join("")}
        <div class="kpi">Atrasadas<b>${overdue}</b></div>
        <div class="kpi">Com evidência<b>${withEvidence}</b></div>
      </div>
      <table>${header}${rows}</table>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ---- Relatório de campo (evidências capturadas no app de campo) ----
  const [fieldReportLoading, setFieldReportLoading] = useState(false);

  const handleFieldReport = async () => {
    if (filtered.length === 0) return toast.error("Nenhuma entrega para o relatório");
    setFieldReportLoading(true);
    try {
      const ids = filtered.map((d) => d.id);
      const { data: atts } = await supabase
        .from("delivery_attachments")
        .select("id, delivery_id, storage_path, file_name, mime_type, kind, geo, taken_at, created_at")
        .in("delivery_id", ids)
        .order("created_at", { ascending: true });

      const list = atts ?? [];
      const signed = await Promise.all(
        list.map(async (a) => {
          const { data } = await supabase.storage
            .from("delivery-evidence")
            .createSignedUrl(a.storage_path as string, 60 * 60 * 6);
          return { ...a, url: data?.signedUrl as string | undefined };
        })
      );
      const byDelivery: Record<string, typeof signed> = {};
      for (const a of signed) {
        const key = a.delivery_id as string;
        (byDelivery[key] ||= []).push(a);
      }

      const esc = (v: unknown) =>
        String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;
      const approvalLabel: Record<string, string> = {
        pendente: "Aprovação pendente", aprovada: "Aprovada", reprovada: "Reprovada",
      };
      const fullDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
      const fullDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

      const ordered = filtered
        .slice()
        .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? "") || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

      const totalPhotos = signed.filter((a) => a.kind === "image" || String(a.mime_type ?? "").startsWith("image/")).length;
      const totalDocs = signed.length - totalPhotos;
      const withEvidence = ordered.filter((d) => (byDelivery[d.id]?.length ?? 0) > 0 || !!d.evidence_url).length;
      const geoCount = signed.filter((a) => a.geo).length;

      const sections = ordered
        .map((d) => {
          const files = byDelivery[d.id] ?? [];
          const photos = files.filter((a) => a.kind === "image" || String(a.mime_type ?? "").startsWith("image/"));
          const docs = files.filter((a) => !photos.includes(a));
          const geo = photos.find((a) => a.geo)?.geo as { lat: number; lng: number } | null | undefined;

          return `<section class="card">
            <div class="card-head">
              <div>
                <h2>${esc(d.title)}</h2>
                <div class="tags">
                  <span class="tag brand">${esc(d.brand)}</span>
                  ${d.asset_type ? `<span class="tag">${esc(d.asset_type)}</span>` : ""}
                  <span class="tag st-${esc(d.status)}">${esc(statusLabel(d.status))}</span>
                  <span class="tag ap-${esc(d.approval)}">${esc(approvalLabel[d.approval] ?? d.approval)}</span>
                  ${isOverdue(d) ? `<span class="tag warn">Atrasada</span>` : ""}
                </div>
              </div>
              <div class="qty">${esc(d.quantity)}<small>qtd</small></div>
            </div>

            <div class="meta-grid">
              <div><label>Propriedade</label><span>${esc(d.property_id ? propertyNameById[d.property_id] : "—")}</span></div>
              <div><label>Oportunidade</label><span>${esc(d.opportunity_id ? opportunities.find((o) => o.id === d.opportunity_id)?.brand : "—")}</span></div>
              <div><label>Data prevista</label><span>${fullDate(d.due_date)}</span></div>
              <div><label>Registrado em campo</label><span>${fullDateTime(d.delivered_at)}</span></div>
              <div><label>Geolocalização</label><span>${geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "—"}</span></div>
              <div><label>Anexos</label><span>${photos.length} foto(s) · ${docs.length} doc(s)</span></div>
            </div>

            ${d.description ? `<p class="txt"><label>Descrição</label>${esc(d.description)}</p>` : ""}
            ${d.notes ? `<p class="txt note"><label>Notas do campo</label>${esc(d.notes)}</p>` : ""}
            ${d.approval_comment ? `<p class="txt"><label>Comentário de aprovação</label>${esc(d.approval_comment)}</p>` : ""}

            ${photos.length
              ? `<div class="gallery">${photos
                  .map(
                    (p) => `<figure>
                      <img src="${esc(p.url ?? "")}" alt="${esc(p.file_name ?? "Evidência")}" />
                      <figcaption>${fullDateTime((p.taken_at as string) ?? (p.created_at as string))}${p.geo ? ` · ${(p.geo as any).lat.toFixed(4)}, ${(p.geo as any).lng.toFixed(4)}` : ""}</figcaption>
                    </figure>`
                  )
                  .join("")}</div>`
              : `<div class="empty">Sem fotos capturadas no app de campo</div>`}

            ${docs.length
              ? `<ul class="docs">${docs
                  .map((doc) => `<li><a href="${esc(doc.url ?? "")}">${esc(doc.file_name ?? "Documento")}</a> <span>${fullDateTime(doc.created_at as string)}</span></li>`)
                  .join("")}</ul>`
              : ""}
          </section>`;
        })
        .join("");

      const win = window.open("", "_blank", "width=1200,height=900");
      if (!win) return toast.error("Permita pop-ups para gerar o relatório");
      win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de campo — Entregas</title><style>
        *{box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;color:#0f172a;background:#fff}
        .wrap{padding:28px 32px}
        .cover{background:linear-gradient(135deg,#0b1b3a,#1d4ed8);color:#fff;padding:28px 32px;border-radius:14px;margin-bottom:20px}
        .cover h1{margin:0;font-size:24px;letter-spacing:-.4px}
        .cover p{margin:6px 0 0;font-size:12px;opacity:.85}
        .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px}
        .kpi{background:rgba(255,255,255,.12);border-radius:10px;padding:10px 12px}
        .kpi b{display:block;font-size:20px;line-height:1.1}
        .kpi span{font-size:10px;text-transform:uppercase;letter-spacing:.6px;opacity:.85}
        .card{border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 14px;page-break-inside:avoid;break-inside:avoid}
        .card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:1px solid #eef2f7;padding-bottom:10px;margin-bottom:10px}
        .card h2{font-size:15px;margin:0 0 6px}
        .tags{display:flex;flex-wrap:wrap;gap:6px}
        .tag{font-size:9.5px;padding:3px 8px;border-radius:999px;background:#f1f5f9;color:#475569;font-weight:600}
        .tag.brand{background:#e0e7ff;color:#3730a3}
        .tag.warn{background:#fee2e2;color:#b91c1c}
        .tag.st-aprovada,.tag.ap-aprovada{background:#dcfce7;color:#15803d}
        .tag.st-entregue{background:#fef3c7;color:#a16207}
        .tag.st-atrasada,.tag.ap-reprovada{background:#fee2e2;color:#b91c1c}
        .qty{font-size:20px;font-weight:700;text-align:center;color:#1d4ed8;line-height:1}
        .qty small{display:block;font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase}
        .meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 16px;margin-bottom:10px}
        .meta-grid label,.txt label{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;font-weight:700}
        .meta-grid span{font-size:11px}
        .txt{font-size:11px;margin:0 0 8px;line-height:1.45}
        .txt.note{background:#f8fafc;border-left:3px solid #1d4ed8;padding:8px 10px;border-radius:0 6px 6px 0}
        .gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
        figure{margin:0}
        figure img{width:100%;aspect-ratio:1/1;height:auto;object-fit:cover;object-position:center;display:block;border-radius:8px;border:1px solid #e2e8f0;background:#f1f5f9}
        figcaption{font-size:8px;color:#64748b;margin-top:3px}
        .empty{font-size:10px;color:#94a3b8;font-style:italic}
        .docs{list-style:none;padding:0;margin:8px 0 0;font-size:10px}
        .docs li{display:flex;justify-content:space-between;border-top:1px dashed #e2e8f0;padding:4px 0}
        .docs span{color:#94a3b8}
        footer{margin-top:16px;font-size:9px;color:#94a3b8;text-align:center}
        @page{size:A4;margin:10mm}
      </style></head><body>
        <div class="wrap">
          <div class="cover">
            <h1>Relatório de campo — Entregas</h1>
            <p>Evidências registradas pelo app de campo · gerado em ${new Date().toLocaleString("pt-BR")}</p>
            <div class="kpis">
              <div class="kpi"><b>${ordered.length}</b><span>Entregas</span></div>
              <div class="kpi"><b>${withEvidence}</b><span>Com evidência</span></div>
              <div class="kpi"><b>${totalPhotos}</b><span>Fotos</span></div>
              <div class="kpi"><b>${totalDocs}</b><span>Documentos</span></div>
              <div class="kpi"><b>${geoCount}</b><span>Geolocalizadas</span></div>
            </div>
          </div>
          ${sections}
          <footer>BrandPlay · Relatório gerado automaticamente a partir das capturas do app de campo</footer>
        </div>
      </body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 800);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar relatório de campo");
    } finally {
      setFieldReportLoading(false);
    }
  };



  const resetForm = () => {
    setEditId(null);
    setForm({
      title: "", brand: "", asset_type: "", quantity: "1", due_date: "",
      description: "", notes: "", evidence_url: "", status: "pendente",
      property_id: "none", opportunity_id: "none",
    });
  };

  const openEdit = (d: Delivery) => {
    setEditId(d.id);
    setForm({
      title: d.title ?? "",
      brand: d.brand ?? "",
      asset_type: d.asset_type ?? "",
      quantity: String(d.quantity ?? 1),
      due_date: d.due_date ?? "",
      description: d.description ?? "",
      notes: d.notes ?? "",
      evidence_url: d.evidence_url ?? "",
      status: d.status,
      property_id: d.property_id ?? "none",
      opportunity_id: d.opportunity_id ?? "none",
    });
    setDetail(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !orgId) return;
    if (!form.title.trim() || !form.brand.trim()) {
      toast.error("Informe título e marca");
      return;
    }
    const payload = {
      title: form.title.trim(),
      brand: form.brand.trim(),
      asset_type: form.asset_type || null,
      quantity: Number(form.quantity) || 1,
      due_date: form.due_date || null,
      description: form.description || null,
      notes: form.notes || null,
      evidence_url: form.evidence_url || null,
      status: form.status,
      property_id: form.property_id === "none" ? null : form.property_id,
      opportunity_id: form.opportunity_id === "none" ? null : form.opportunity_id,
    };

    const { error } = editId
      ? await supabase.from("deliveries").update(payload).eq("id", editId).eq("organization_id", orgId)
      : await supabase.from("deliveries").insert({ owner_id: user.id, organization_id: orgId, ...payload });

    if (error) {
      toast.error(editId ? "Erro ao salvar entrega" : "Erro ao criar entrega");
      return;
    }
    toast.success(editId ? "Entrega atualizada" : "Entrega criada");
    setDialogOpen(false);
    resetForm();
    fetchData();
  };


  const handleDelete = async () => {
    if (!deleteId || !orgId) return;
    const { error } = await supabase.from("deliveries").delete().eq("id", deleteId).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    toast.success("Entrega removida");
    setDeleteId(null);
    setDetail(null);
    fetchData();
  };

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const newStatus = String(over.id) as Status;
    const item = deliveries.find((d) => d.id === id);
    if (!item || item.status === newStatus) return;

    const patch: Partial<Delivery> = { status: newStatus };
    if (newStatus === "entregue" && !item.delivered_at) {
      patch.delivered_at = new Date().toISOString().slice(0, 10);
    }

    setDeliveries((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao mover entrega");
      fetchData();
    }
  };

  const updateApproval = async (id: string, approval: Approval, comment?: string) => {
    const patch: Partial<Delivery> = { approval };
    if (comment !== undefined) patch.approval_comment = comment;
    if (approval === "aprovada") patch.status = "aprovada";
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar aprovação");
      return;
    }
    toast.success(approval === "aprovada" ? "Entrega aprovada" : approval === "reprovada" ? "Entrega reprovada" : "Aprovação resetada");
    setDetail((d) => (d && d.id === id ? { ...d, ...patch } : d));
    fetchData();
  };

  const propertiesById = Object.fromEntries(properties.map((p) => [p.id, p.name]));
  const opportunitiesById = Object.fromEntries(opportunities.map((o) => [o.id, o.brand]));
  const activeItem = activeId ? deliveries.find((d) => d.id === activeId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe a execução dos ativos patrocinados em tempo real.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><Sparkles className="h-4 w-4 mr-2" />Sugestões IA</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Próximos passos sugeridos por IA</DialogTitle>
                <DialogDescription>
                  Para entregas atrasadas e próximas do prazo: como destravar (cobrar arte, agendar produção, alinhar com patrocinador).
                </DialogDescription>
              </DialogHeader>
              <NextStepsAI context="delivery" />
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}><Plus className="h-4 w-4 mr-2" />Nova entrega</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar entrega" : "Nova entrega"}</DialogTitle>
              <DialogDescription>
                {editId ? "Atualize os dados desta entrega." : "Cadastre um ativo a ser executado para o patrocinador."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Placa de campo - rodada 1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="brand">Marca *</Label>
                  <Input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Nike" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="asset">Tipo de ativo</Label>
                  <Select value={form.asset_type} onValueChange={(v) => setForm({ ...form, asset_type: v })}>
                    <SelectTrigger id="asset"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="qty">Quantidade</Label>
                  <Input id="qty" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="due">Data prevista</Label>
                  <Input id="due" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (<SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="prop">Propriedade</Label>
                  <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                    <SelectTrigger id="prop"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="opp">Oportunidade</Label>
                  <Select value={form.opportunity_id} onValueChange={(v) => setForm({ ...form, opportunity_id: v })}>
                    <SelectTrigger id="opp"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {opportunities.map((o) => (<SelectItem key={o.id} value={o.id}>{o.brand}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="evidence">URL de evidência</Label>
                <Input id="evidence" value={form.evidence_url} onChange={(e) => setForm({ ...form, evidence_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="desc">Descrição</Label>
                <Textarea id="desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>{editId ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

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
            <span className="text-xs text-muted-foreground">
              {filtered.length} de {deliveries.length} entregas
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <DeliveriesViewToggle value={viewMode} onChange={setViewMode} />
            <Button variant="outline" size="sm" className="h-9" onClick={handleExportPDF} disabled={filtered.length === 0}>
              <FileDown className="h-4 w-4 mr-1.5" /> Relatório Analítico
            </Button>
            <Button size="sm" className="h-9" onClick={handleFieldReport} disabled={filtered.length === 0 || fieldReportLoading}>
              <Camera className="h-4 w-4 mr-1.5" /> {fieldReportLoading ? "Gerando..." : "Relatório de Entregas"}
            </Button>
          </div>
        </div>


        {!filtersCollapsed && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, marca, tipo, propriedade ou notas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterProperty} onValueChange={setFilterProperty}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Propriedade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas propriedades</SelectItem>
                <SelectItem value="none">Sem propriedade</SelectItem>
                {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterOpportunity} onValueChange={setFilterOpportunity}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Oportunidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas oportunidades</SelectItem>
                <SelectItem value="none">Sem oportunidade</SelectItem>
                {opportunities.map((o) => (<SelectItem key={o.id} value={o.id}>{o.brand}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button
              variant={showOverdueOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowOverdueOnly((s) => !s)}
              className="h-9"
            >
              <AlertTriangle className="h-4 w-4 mr-1.5" />
              Atrasadas {overdueCount > 0 && `(${overdueCount})`}
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
          </div>
        )}

        {!filtersCollapsed && advancedOpen && (
          <div className="border-t border-border pt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas marcas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas marcas</SelectItem>
                    {brands.map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de ativo</Label>
                <Select value={filterAssetType} onValueChange={setFilterAssetType}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos tipos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos tipos</SelectItem>
                    {assetTypes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Aprovação</Label>
                <Select value={filterApproval} onValueChange={setFilterApproval}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovada">Aprovada</SelectItem>
                    <SelectItem value="reprovada">Reprovada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Data prevista</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className="h-9" />
                  <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={showNoDateOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowNoDateOnly((v) => !v)}
                className="h-9"
              >
                <Clock className="h-4 w-4 mr-1.5" />
                Sem data prevista
              </Button>
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
        <div className="text-sm text-muted-foreground">Carregando entregas...</div>
      ) : viewMode === "list" ? (
        <DeliveriesTableView
          items={filtered}
          propertiesById={propertiesById}
          opportunitiesById={opportunitiesById}
          onOpen={(d) => setDetail(d)}
          onEdit={openEdit}
        />
      ) : viewMode === "compact" ? (
        <DeliveriesCompactView
          items={filtered}
          propertiesById={propertiesById}
          onOpen={(d) => setDetail(d)}
          onEdit={openEdit}
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status.id}
                status={status}
                items={grouped[status.id]}
                onOpen={(d) => setDetail(d)}
                onEdit={openEdit}
                propertiesById={propertiesById}
              />
            ))}
          </div>
          <DragOverlay>
            {activeItem ? (
              <DeliveryCard item={activeItem} propertyName={activeItem.property_id ? propertiesById[activeItem.property_id] ?? null : null} dragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <DetailSheet
        delivery={detail}
        propertiesById={propertiesById}
        opportunitiesById={opportunitiesById}
        onClose={() => setDetail(null)}
        onDelete={(id) => setDeleteId(id)}
        onApproval={updateApproval}
        onEdit={openEdit}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir entrega?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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

function DeliveriesViewToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
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

function StatusBadge({ status }: { status: Status }) {
  const s = STATUSES.find((x) => x.id === status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${s?.color ?? "bg-muted"}`} />
      {s?.label ?? status}
    </span>
  );
}

function DeliveriesTableView({
  items,
  propertiesById,
  opportunitiesById,
  onOpen,
  onEdit,
}: {
  items: Delivery[];
  propertiesById: Record<string, string>;
  opportunitiesById: Record<string, string>;
  onOpen: (d: Delivery) => void;
  onEdit: (d: Delivery) => void;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">Nenhuma entrega encontrada.</div>;
  }
  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entrega</TableHead>
            <TableHead>Marca</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Propriedade</TableHead>
            <TableHead>Oportunidade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aprovação</TableHead>
            <TableHead>Prevista</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpen(d)}>
              <TableCell className="font-medium">
                {d.title}
                {d.quantity > 1 && <span className="text-muted-foreground text-xs"> ×{d.quantity}</span>}
              </TableCell>
              <TableCell className="text-sm">{d.brand}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{d.asset_type ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{d.property_id ? propertiesById[d.property_id] ?? "—" : "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{d.opportunity_id ? opportunitiesById[d.opportunity_id] ?? "—" : "—"}</TableCell>
              <TableCell><StatusBadge status={d.status} /></TableCell>
              <TableCell className="text-sm capitalize text-muted-foreground">{d.approval}</TableCell>
              <TableCell className={`text-sm ${isOverdue(d) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {formatDate(d.due_date) ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(d); }}
                  aria-label="Editar entrega"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function DeliveriesCompactView({
  items,
  propertiesById,
  onOpen,
  onEdit,
}: {
  items: Delivery[];
  propertiesById: Record<string, string>;
  onOpen: (d: Delivery) => void;
  onEdit: (d: Delivery) => void;
}) {
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">Nenhuma entrega encontrada.</div>;
  }
  return (
    <Card className="divide-y divide-border">
      {items.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
          onClick={() => onOpen(d)}
        >
          <StatusBadge status={d.status} />
          <span className="text-sm font-medium truncate flex-1">{d.title}</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{d.brand}</span>
          {d.property_id && (
            <span className="text-xs text-muted-foreground truncate hidden md:inline">{propertiesById[d.property_id] ?? ""}</span>
          )}
          <span className={`text-xs ${isOverdue(d) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {formatDate(d.due_date) ?? "—"}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit(d); }} aria-label="Editar entrega">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </Card>
  );
}

function KanbanColumn({
  status,
  items,
  onOpen,
  onEdit,
  propertiesById,
}: {
  status: { id: Status; label: string; color: string };
  items: Delivery[];
  onOpen: (d: Delivery) => void;
  onEdit: (d: Delivery) => void;
  propertiesById: Record<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 bg-muted/40 rounded-lg p-3 flex flex-col transition-colors ${
        isOver ? "ring-2 ring-primary bg-muted" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.color}`} />
          <h3 className="text-sm font-semibold">{status.label}</h3>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
      </div>
      <div className="flex flex-col gap-2 min-h-[100px]">
        {items.map((d) => (
          <DraggableCard
            key={d.id}
            item={d}
            propertyName={d.property_id ? propertiesById[d.property_id] ?? null : null}
            onOpen={onOpen}
            onEdit={onEdit}
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
  item,
  propertyName,
  onOpen,
  onEdit,
}: {
  item: Delivery;
  propertyName: string | null;
  onOpen: (d: Delivery) => void;
  onEdit: (d: Delivery) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div ref={setNodeRef} {...attributes} className={isDragging ? "opacity-40" : ""}>
      <DeliveryCard item={item} propertyName={propertyName} dragHandleProps={listeners} onOpen={onOpen} onEdit={onEdit} />
    </div>
  );
}

function DeliveryCard({
  item,
  propertyName,
  dragHandleProps,
  onOpen,
  onEdit,
  dragging,
}: {
  item: Delivery;
  propertyName: string | null;
  dragHandleProps?: any;
  onOpen?: (d: Delivery) => void;
  onEdit?: (d: Delivery) => void;
  dragging?: boolean;
}) {
  const approvalBadge =
    item.approval === "aprovada" ? (
      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/30 text-[10px]">
        <CheckCircle2 className="h-3 w-3 mr-1" />Aprovada
      </Badge>
    ) : item.approval === "reprovada" ? (
      <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/15 border-rose-500/30 text-[10px]">
        <XCircle className="h-3 w-3 mr-1" />Reprovada
      </Badge>
    ) : (
      <Badge variant="outline" className="text-[10px]">
        <Clock className="h-3 w-3 mr-1" />Pendente
      </Badge>
    );

  return (
    <Card className={`p-3 group hover:shadow-md transition-shadow ${dragging ? "shadow-lg rotate-2" : ""}`}>
      <div className="flex items-start gap-2">
        <button
          {...dragHandleProps}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing pt-0.5"
          aria-label="Arrastar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onOpen?.(item)}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-sm break-words">{item.title}</h4>
            {onEdit && (
              <button
                type="button"
                aria-label="Editar entrega"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{item.brand}{item.asset_type ? ` · ${item.asset_type}` : ""}</p>
          <div className="mt-2 space-y-1">
            {propertyName && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span className="break-words">{propertyName}</span>
              </div>
            )}
            {item.due_date && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(item.due_date)}</span>
                {item.quantity > 1 && <span className="ml-auto">x{item.quantity}</span>}
              </div>
            )}
          </div>
          <div className="mt-2">{approvalBadge}</div>
        </div>
      </div>
    </Card>
  );
}

function DetailSheet({
  delivery,
  propertiesById,
  opportunitiesById,
  onClose,
  onDelete,
  onApproval,
  onEdit,
}: {
  delivery: Delivery | null;
  propertiesById: Record<string, string>;
  opportunitiesById: Record<string, string>;
  onClose: () => void;
  onDelete: (id: string) => void;
  onApproval: (id: string, approval: Approval, comment?: string) => void;
  onEdit: (d: Delivery) => void;
}) {
  const [comment, setComment] = useState("");
  type FieldAtt = {
    id: string;
    file_name: string | null;
    mime_type: string | null;
    kind: string | null;
    geo: unknown;
    taken_at: string | null;
    created_at: string | null;
    url?: string;
  };
  const [fieldAtts, setFieldAtts] = useState<FieldAtt[]>([]);
  const [fieldLoading, setFieldLoading] = useState(false);

  useEffect(() => {
    setComment(delivery?.approval_comment ?? "");
  }, [delivery?.id]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!delivery?.id) { setFieldAtts([]); return; }
      setFieldLoading(true);
      const { data } = await supabase
        .from("delivery_attachments")
        .select("id, storage_path, file_name, mime_type, kind, geo, taken_at, created_at")
        .eq("delivery_id", delivery.id)
        .order("created_at", { ascending: true });
      const signed = await Promise.all(
        (data ?? []).map(async (a: Record<string, unknown>) => {
          const { data: s } = await supabase.storage
            .from("delivery-evidence")
            .createSignedUrl(a.storage_path as string, 60 * 60 * 6);
          return { ...(a as unknown as FieldAtt), url: s?.signedUrl };
        })
      );
      if (!cancelled) { setFieldAtts(signed); setFieldLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [delivery?.id]);

  if (!delivery) return null;

  const propertyName = delivery.property_id ? propertiesById[delivery.property_id] : null;
  const oppBrand = delivery.opportunity_id ? opportunitiesById[delivery.opportunity_id] : null;

  return (
    <Dialog open={!!delivery} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{delivery.title}</DialogTitle>
          <DialogDescription>
            {delivery.brand}
            {delivery.asset_type && ` · ${delivery.asset_type}`}
            {delivery.quantity > 1 && ` · ${delivery.quantity} un.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Data prevista</p>
              <p>{formatDate(delivery.due_date) ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Entregue em</p>
              <p>{formatDate(delivery.delivered_at) ?? "—"}</p>
            </div>
            {propertyName && (
              <div>
                <p className="text-xs text-muted-foreground">Propriedade</p>
                <p className="flex items-center gap-1"><Building2 className="h-3 w-3" />{propertyName}</p>
              </div>
            )}
            {oppBrand && (
              <div>
                <p className="text-xs text-muted-foreground">Oportunidade</p>
                <p className="flex items-center gap-1"><Link2 className="h-3 w-3" />{oppBrand}</p>
              </div>
            )}
          </div>

          {delivery.description && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Descrição</p>
              <p className="text-sm">{delivery.description}</p>
            </div>
          )}

          {delivery.evidence_url && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Evidência</p>
              <a
                href={delivery.evidence_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
              >
                <ExternalLink className="h-3 w-3" />{delivery.evidence_url}
              </a>
            </div>
          )}

          {delivery.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notas do campo</p>
              <p className="text-sm whitespace-pre-wrap">{delivery.notes}</p>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2">
              Entregas de campo {fieldAtts.length > 0 && `(${fieldAtts.length})`}
            </p>
            {fieldLoading ? (
              <p className="text-sm text-muted-foreground">Carregando evidências…</p>
            ) : fieldAtts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma evidência registrada no app de campo.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {fieldAtts
                    .filter((a) => (a.mime_type ?? "").startsWith("image/"))
                    .map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={a.url}
                          alt={a.file_name ?? "Evidência de campo"}
                          loading="lazy"
                          className="aspect-square w-full rounded-md object-cover border"
                        />
                        <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
                          {a.taken_at || a.created_at
                            ? new Date((a.taken_at ?? a.created_at) as string).toLocaleString("pt-BR")
                            : "—"}
                          {a.geo ? " · GPS" : ""}
                        </p>
                      </a>
                    ))}
                </div>
                {fieldAtts
                  .filter((a) => !(a.mime_type ?? "").startsWith("image/"))
                  .map((a) => (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all"
                    >
                      <ExternalLink className="h-3 w-3" />{a.file_name ?? "Documento"}
                    </a>
                  ))}
              </div>
            )}
          </div>



          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2">Aprovação do patrocinador</p>
            <Textarea
              placeholder="Comentário do patrocinador..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="mb-2"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={delivery.approval === "aprovada" ? "default" : "outline"}
                onClick={() => onApproval(delivery.id, "aprovada", comment)}
                className="flex-1"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />Aprovar
              </Button>
              <Button
                size="sm"
                variant={delivery.approval === "reprovada" ? "destructive" : "outline"}
                onClick={() => onApproval(delivery.id, "reprovada", comment)}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-1" />Reprovar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onDelete(delivery.id)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Fechar</Button>
            <Button onClick={() => onEdit(delivery)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
