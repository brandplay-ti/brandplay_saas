import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ActivityContextLinks } from "@/components/common/ActivityContextLinks";
import { DueDateEditor } from "@/components/common/DueDateEditor";
import { TaskInsightsButton } from "@/components/common/TaskInsightsButton";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Plus, Check, Trash2, FileText, FileSignature, Phone, Mail, Users, StickyNote, ListChecks, Paperclip, MessageSquare, Eye, Download, ArrowRight, Route, Circle, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import { OpportunityContactsPanel } from "@/components/pipeline/OpportunityContactsPanel";
import { getOpportunityStageChecklistIssues } from "@/lib/opportunityStageChecklist";
import { MissingInfoDialog, focusMissingField, type MissingInfoState } from "@/components/common/MissingInfoDialog";
import { getStageSyncUpdate, type JourneySnapshot } from "@/lib/opportunityJourneyStage";


type Stage = Database["public"]["Enums"]["opportunity_stage"];

type Opp = {
  id: string;
  owner_id: string;
  organization_id: string;
  brand: string;
  value: number;
  stage: Stage;
  expected_close_date: string | null;
  property_id: string | null;
  sponsor_id: string | null;
  notes: string | null;
  assignee_id: string | null;
  tier_id: string | null;
  lost_reason: string | null;
  lost_comment: string | null;
  converted_proposal_id: string | null;
  converted_contract_id: string | null;
};

type Activity = {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  actor_id: string | null;
  event_type: "created" | "stage_changed" | "value_changed" | string;
  from_stage: Stage | null;
  to_stage: Stage | null;
  old_value: number | null;
  new_value: number | null;
  created_at: string;
};

type CommentAttachment = {
  id: string;
  comment_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type OpportunityComment = {
  id: string;
  author_id: string;
  kind: "comentario" | "nota_reuniao" | string;
  content: string;
  mentions: string[];
  created_at: string;
  opportunity_comment_attachments?: CommentAttachment[];
};

type JourneyProposal = { id: string; status: string; title: string | null; created_at: string; sent_at?: string | null; decided_at?: string | null; total_value?: number | null; valid_until?: string | null; updated_at?: string | null } | null;
type JourneyContract = { id: string; status: string; title: string | null; total_value: number; created_at: string; start_date?: string | null; end_date?: string | null; updated_at?: string | null } | null;
type JourneyDelivery = { id: string; title: string; status: string; approval: string; due_date: string | null; created_at?: string; delivered_at?: string | null };
type JourneyInstallment = { id: string; installment_number: number; amount: number; due_date: string; paid_at: string | null; status: string; created_at: string };

type TimelineCategory = "oportunidade" | "historico" | "comentario" | "atividade" | "proposta" | "contrato" | "entrega" | "financeiro";

const TIMELINE_META: Record<TimelineCategory, { label: string; icon: typeof Route; color: string }> = {
  oportunidade: { label: "Oportunidade", icon: Route, color: "text-primary" },
  historico: { label: "Histórico", icon: Clock, color: "text-muted-foreground" },
  comentario: { label: "Comentário", icon: MessageSquare, color: "text-blue-600" },
  atividade: { label: "Atividade", icon: ListChecks, color: "text-amber-600" },
  proposta: { label: "Proposta", icon: FileText, color: "text-indigo-600" },
  contrato: { label: "Contrato", icon: FileSignature, color: "text-emerald-600" },
  entrega: { label: "Entrega", icon: CheckCircle2, color: "text-teal-600" },
  financeiro: { label: "Financeiro", icon: AlertCircle, color: "text-rose-600" },
};

type TimelineEvent = {
  id: string;
  at: string;
  category: TimelineCategory;
  title: string;
  description?: string;
  comment?: OpportunityComment;
};

type Profile = { id: string; full_name: string | null; company: string | null };
type Property = { id: string; name: string };
type Sponsor = { id: string; name: string };
type Tier = { id: string; name: string; value: number; property_id: string };


const STAGES: { id: Stage; label: string }[] = [
  { id: "prospect", label: "Prospect" },
  { id: "reuniao", label: "Reunião" },
  { id: "proposta_enviada", label: "Proposta enviada" },
  { id: "negociacao", label: "Negociação" },
  { id: "fechado", label: "Fechado" },
  { id: "perdido", label: "Perdido" },
];

const LOST_REASONS = [
  { id: "preco", label: "Preço" },
  { id: "timing", label: "Timing" },
  { id: "concorrente", label: "Concorrente" },
  { id: "sem_fit", label: "Sem fit" },
  { id: "outros", label: "Outros" },
];

const ACTIVITY_TYPES = [
  { id: "nota", label: "Nota", icon: StickyNote },
  { id: "ligacao", label: "Ligação", icon: Phone },
  { id: "email", label: "E-mail", icon: Mail },
  { id: "reuniao", label: "Reunião", icon: Users },
  { id: "tarefa", label: "Tarefa", icon: ListChecks },
];

const COMMENT_KINDS = [
  { id: "comentario", label: "Comentário" },
  { id: "nota_reuniao", label: "Nota de reunião" },
];

const formatBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const getOpportunityConversionMissingFields = (opp: Opp, target: "proposal" | "contract") => {
  const missing: string[] = [];
  if (!opp.brand?.trim()) missing.push("marca");
  if (!Number(opp.value) || Number(opp.value) <= 0) missing.push("valor");
  if (target === "contract") {
    if (!opp.sponsor_id) missing.push("sponsor");
    if (!opp.property_id) missing.push("propriedade");
    if (!opp.assignee_id) missing.push("responsável");
  }
  return missing;
};

const getOpportunityConversionWarnings = (opp: Opp) => {
  const warnings: string[] = [];
  if (!opp.property_id) warnings.push("propriedade");
  if (!opp.sponsor_id) warnings.push("sponsor");
  if (!opp.assignee_id) warnings.push("responsável");
  if (!opp.tier_id) warnings.push("cota (tier)");
  if (!opp.expected_close_date) warnings.push("data prevista");
  return warnings;
};


const formatConversionValidationMessage = (missing: string[]) =>
  `Complete antes de converter: ${missing.join(", ")}.`;

export function OpportunityDrawer({
  opportunityId,
  open,
  onOpenChange,
  properties,
  sponsors,
  profiles,
  onChanged,
}: {
  opportunityId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  properties: Property[];
  sponsors: Sponsor[];
  profiles: Profile[];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { orgId } = useOrganization();
  const navigate = useNavigate();
  const [opp, setOpp] = useState<Opp | null>(null);
  const oppRef = useRef<Opp | null>(null);
  useEffect(() => { oppRef.current = opp; }, [opp]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteOpportunity = async () => {
    if (!opportunityId || !orgId) return;
    setDeleting(true);
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", opportunityId)
      .eq("organization_id", orgId);
    setDeleting(false);
    if (error) {
      toast.error("Erro ao excluir oportunidade: " + error.message);
      return;
    }
    toast.success("Oportunidade excluída");
    setConfirmDelete(false);
    onChanged();
    onOpenChange(false);
  };

  // --- Criação rápida de patrocinador ---
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [tab, setTab] = useState("jornada");
  const [missingInfo, setMissingInfo] = useState<MissingInfoState | null>(null);
  const [creatingSponsor, setCreatingSponsor] = useState(false);
  const [newSponsor, setNewSponsor] = useState({ name: "", segment: "", website: "" });
  const [createdSponsor, setCreatedSponsor] = useState<{ id: string; name: string } | null>(null);

  const handleCreateSponsor = async () => {
    if (!user || !orgId || !newSponsor.name.trim()) return;
    setCreatingSponsor(true);
    const { data, error } = await supabase
      .from("sponsors")
      .insert({
        owner_id: user.id,
        organization_id: orgId,
        account_owner_id: user.id,
        name: newSponsor.name.trim(),
        segment: newSponsor.segment.trim() || null,
        website: newSponsor.website.trim() || null,
        priority: "B",
        lifecycle: "em_negociacao",
      })
      .select("id, name")
      .single();
    if (error || !data) {
      setCreatingSponsor(false);
      toast.error("Erro ao criar patrocinador: " + (error?.message ?? ""));
      return;
    }
    await supabase.from("sponsor_crm_profiles").insert({
      sponsor_id: data.id,
      organization_id: orgId,
      owner_id: user.id,
      segment: newSponsor.segment.trim() || null,
    });
    setCreatingSponsor(false);
    setSponsorDialogOpen(false);
    setNewSponsor({ name: "", segment: "", website: "" });
    updateField({ sponsor_id: data.id });
    onChanged();
    setCreatedSponsor({ id: data.id, name: data.name });
    toast.success("Patrocinador cadastrado e vinculado à oportunidade");
  };

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [comments, setComments] = useState<OpportunityComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAct, setNewAct] = useState({ activity_type: "nota", title: "", description: "", due_date: "" });
  const [newComment, setNewComment] = useState({ kind: "comentario", content: "", mentions: [] as string[] });
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [converting, setConverting] = useState(false);
  const [journey, setJourney] = useState<{ proposal: JourneyProposal; contract: JourneyContract; deliveries: JourneyDelivery[] }>({ proposal: null, contract: null, deliveries: [] });
  const [installments, setInstallments] = useState<JourneyInstallment[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeySyncedAt, setJourneySyncedAt] = useState<Date | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<"todos" | TimelineCategory>("todos");
  const [timelineOrder, setTimelineOrder] = useState<"asc" | "desc">("desc");


  useEffect(() => {
    if (!open || !opportunityId || !orgId) {
      setOpp(null);
      setActivities([]);
      setAuditLogs([]);
      setComments([]);
      setJourney({ proposal: null, contract: null, deliveries: [] });
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: oppData }, { data: actData }, { data: tiersData }, { data: auditData }, { data: commentsData }] = await Promise.all([
        supabase.from("opportunities").select("*").eq("id", opportunityId).eq("organization_id", orgId).maybeSingle(),
        supabase
          .from("opportunity_activities")
          .select("*")
          .eq("opportunity_id", opportunityId)
          .order("created_at", { ascending: false }),
        supabase.from("sponsorship_tiers").select("id, name, value, property_id").eq("organization_id", orgId).order("position"),
        supabase
          .from("opportunity_audit_logs" as any)
          .select("id, actor_id, event_type, from_stage, to_stage, old_value, new_value, created_at")
          .eq("opportunity_id", opportunityId)
          .order("created_at", { ascending: false }),
        supabase
          .from("opportunity_comments" as any)
          .select("id, author_id, kind, content, mentions, created_at, opportunity_comment_attachments(id, comment_id, storage_path, file_name, mime_type, size_bytes)")
          .eq("opportunity_id", opportunityId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setOpp(oppData as Opp | null);
      setActivities((actData as Activity[]) ?? []);
      setTiers((tiersData as Tier[]) ?? []);
      setAuditLogs((auditData as unknown as AuditLog[]) ?? []);
      setComments((commentsData as unknown as OpportunityComment[]) ?? []);
      setLoading(false);
      loadJourney(opportunityId);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, opportunityId, orgId]);

  // Mantém a jornada sempre atualizada: ao mudar de estágio e ao voltar o foco à aba
  useEffect(() => {
    if (!open || !opportunityId || !orgId || !opp?.stage) return;
    loadJourney(opportunityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opp?.stage]);

  useEffect(() => {
    if (!open || !opportunityId || !orgId) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") loadJourney(opportunityId);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opportunityId, orgId]);


  const goToOppField = (issue: string) => {
    const key = issue.toLowerCase();
    if (key.includes("atividade")) {
      setTab("atividades");
      return;
    }
    setTab("detalhes");
    const map: Record<string, string> = {
      marca: "marca",
      valor: "valor",
      sponsor: "sponsor",
      patrocinador: "sponsor",
      propriedade: "propriedade",
      responsável: "responsável",
      cota: "cota (tier)",
      "data prevista": "data prevista",
    };
    const matched = Object.keys(map).find((k) => key.includes(k));
    focusMissingField(matched ? map[matched] : key);
  };

  const updateField = async (patch: Partial<Opp>) => {
    if (!opp || !orgId) return;
    if (patch.stage && patch.stage !== opp.stage) {
      const checklistIssues = getOpportunityStageChecklistIssues(
        { ...opp, pendingActivities: activities.filter((activity) => activity.status !== "concluido").length },
        patch.stage,
      );
      if (checklistIssues.length > 0) {
        setMissingInfo({
          title: "Não é possível avançar de etapa",
          description: "Clique em cada item para ir direto ao que precisa ser atualizado.",
          items: checklistIssues.map((i) => ({ label: i, onAction: () => goToOppField(i) })),
          actionLabel: checklistIssues.some((i) => i.includes("atividade")) ? "Ir para Atividades" : "Ir para Detalhes",
          onAction: () => goToOppField(checklistIssues[0]),
        });
        return;
      }
    }
    const next = { ...opp, ...patch };
    setOpp(next);
    const { error } = await supabase.from("opportunities").update(patch).eq("id", opp.id).eq("organization_id", orgId);
    if (error) {
      toast.error("Erro ao salvar");
      return;
    }
    onChanged();
  };

  const addActivity = async () => {
    if (!user || !opp) return;
    if (!newAct.title.trim()) {
      toast.error("Informe o título");
      return;
    }
    const { data, error } = await supabase
      .from("opportunity_activities")
      .insert({
        opportunity_id: opp.id,
        organization_id: orgId,
        owner_id: user.id,
        activity_type: newAct.activity_type,
        title: newAct.title.trim(),
        description: newAct.description || null,
        due_date: newAct.due_date ? new Date(newAct.due_date).toISOString() : null,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error("Erro ao adicionar atividade");
      return;
    }
    setActivities((prev) => [data as Activity, ...prev]);
    setNewAct({ activity_type: "nota", title: "", description: "", due_date: "" });
    toast.success("Atividade adicionada");
  };

  const toggleActivity = async (act: Activity) => {
    const isDone = act.status === "concluido";
    const next = isDone
      ? { status: "pendente", completed_at: null }
      : { status: "concluido", completed_at: new Date().toISOString() };
    const { error } = await supabase.from("opportunity_activities").update(next).eq("id", act.id);
    if (error) {
      toast.error("Erro ao atualizar");
      return;
    }
    setActivities((prev) => prev.map((a) => (a.id === act.id ? { ...a, ...next } : a)));
  };

  const deleteActivity = async (id: string) => {
    const { error } = await supabase.from("opportunity_activities").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const addComment = async () => {
    if (!user || !opp || !orgId) return;
    if (!newComment.content.trim()) return toast.error("Escreva um comentário");

    const { data, error } = await supabase
      .from("opportunity_comments" as any)
      .insert({
        opportunity_id: opp.id,
        organization_id: orgId,
        author_id: user.id,
        kind: newComment.kind,
        content: newComment.content.trim(),
        mentions: newComment.mentions,
      })
      .select("id, author_id, kind, content, mentions, created_at")
      .single();
    if (error || !data) return toast.error("Erro ao adicionar comentário");

    const comment = data as unknown as OpportunityComment;
    const uploadedAttachments: CommentAttachment[] = [];
    for (const file of commentFiles) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${orgId}/${opp.id}/${comment.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("opportunity-comments").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        toast.error(`Falha ao anexar ${file.name}`);
        continue;
      }
      const { data: attachmentData, error: attachmentError } = await supabase
        .from("opportunity_comment_attachments" as any)
        .insert({
          comment_id: comment.id,
          opportunity_id: opp.id,
          organization_id: orgId,
          uploaded_by: user.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        })
        .select("id, comment_id, storage_path, file_name, mime_type, size_bytes")
        .single();
      if (!attachmentError && attachmentData) uploadedAttachments.push(attachmentData as unknown as CommentAttachment);
    }

    setComments((prev) => [{ ...comment, opportunity_comment_attachments: uploadedAttachments }, ...prev]);
    setNewComment({ kind: "comentario", content: "", mentions: [] });
    setCommentFiles([]);
    toast.success("Comentário adicionado");
  };

  const previewCommentAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from("opportunity-comments").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return toast.error("Erro ao abrir anexo");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const downloadCommentAttachment = async (attachment: CommentAttachment) => {
    const { data, error } = await supabase.storage
      .from("opportunity-comments")
      .createSignedUrl(attachment.storage_path, 3600, { download: attachment.file_name });
    if (error || !data?.signedUrl) return toast.error("Erro ao baixar anexo");
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = attachment.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const convertToProposal = async () => {
    if (!opp || !user || !orgId) return;
    const missingFields = getOpportunityConversionMissingFields(opp, "proposal");
    if (missingFields.length > 0) {
      setMissingInfo({
        title: "Não é possível gerar a proposta",
        description: "Clique em cada item para ir direto ao campo que precisa ser preenchido.",
        items: missingFields.map((f) => ({ label: f, onAction: () => goToOppField(f) })),
        actionLabel: "Completar dados",
        onAction: () => goToOppField(missingFields[0]),
      });
      return;
    }
    setConverting(true);
    const { data: proposalData, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        owner_id: user.id,
        organization_id: orgId,
        title: `Proposta — ${opp.brand}`,
        brand: opp.brand,
        property_id: opp.property_id,
        sponsor_id: opp.sponsor_id,
        total_value: opp.value,
        status: "rascunho",
        converted_opportunity_id: opp.id,
      })
      .select()
      .single();
    if (proposalError || !proposalData) {
      setConverting(false);
      toast.error("Erro ao gerar proposta");
      return;
    }
    if (opp.tier_id) {
      const { error: copyError } = await supabase.rpc("copy_opportunity_tier_to_proposal", {
        _opportunity_id: opp.id,
        _proposal_id: proposalData.id,
      });
      if (copyError) {
        console.error("copy_opportunity_tier_to_proposal error", copyError);
        toast.error("Proposta criada, mas não foi possível copiar os ativos da cota");
      }
    }

    await supabase.from("opportunities").update({ converted_proposal_id: proposalData.id }).eq("id", opp.id).eq("organization_id", orgId);
    setOpp({ ...opp, converted_proposal_id: proposalData.id });
    loadJourney(opp.id);
    setConverting(false);
    toast.success("Proposta criada como rascunho");
    onChanged();
  };

  const convertToContract = async () => {
    if (!opp || !user || !orgId) return;
    const missingFields = getOpportunityConversionMissingFields(opp, "contract");
    if (missingFields.length > 0) {
      setMissingInfo({
        title: "Não é possível gerar o contrato",
        description: "Clique em cada item para ir direto ao campo que precisa ser preenchido.",
        items: missingFields.map((f) => ({ label: f, onAction: () => goToOppField(f) })),
        actionLabel: "Completar dados",
        onAction: () => goToOppField(missingFields[0]),
      });
      return;
    }
    setConverting(true);
    const { data: contractData, error: contractError } = await supabase
      .from("contracts")
      .insert({
        owner_id: user.id,
        organization_id: orgId,
        title: `Contrato — ${opp.brand}`,
        brand: opp.brand,
        property_id: opp.property_id,
        sponsor_id: opp.sponsor_id,
        opportunity_id: opp.id,
        total_value: opp.value,
        status: "rascunho",
      })
      .select()
      .single();
    if (contractError || !contractData) {
      setConverting(false);
      toast.error("Erro ao gerar contrato");
      return;
    }
    if (opp.converted_proposal_id) {
      const { error: copyError } = await supabase.rpc("copy_proposal_items_to_contract", {
        _contract_id: contractData.id,
        _proposal_id: opp.converted_proposal_id,
      });
      if (copyError) {
        console.error("copy_proposal_items_to_contract error", copyError);
        toast.error("Contrato criado, mas não foi possível copiar os itens da proposta");
      }
    } else if (opp.tier_id) {
      const { error: copyError } = await supabase.rpc("copy_opportunity_tier_to_proposal", {
        _opportunity_id: opp.id,
        _proposal_id: contractData.id,
      });
      if (copyError) {
        console.error("copy_opportunity_tier_to_contract error", copyError);
      }
    }

    await supabase
      .from("opportunities")
      .update({ converted_contract_id: contractData.id, stage: "fechado", decided_at: new Date().toISOString() } as any)
      .eq("id", opp.id)
      .eq("organization_id", orgId);
    setOpp({ ...opp, converted_contract_id: contractData.id, stage: "fechado" });
    loadJourney(opp.id);
    setConverting(false);
    toast.success("Contrato criado como rascunho — oportunidade marcada como fechada");
    onChanged();
  };


  const syncStageWithJourney = async (snapshot: JourneySnapshot) => {
    const current = oppRef.current;
    if (!current || !orgId) return;
    const nextStage = getStageSyncUpdate(current.stage, snapshot);
    if (!nextStage) return;
    const { error } = await supabase
      .from("opportunities")
      .update({ stage: nextStage, ...(nextStage === "fechado" ? { decided_at: new Date().toISOString() } : {}) } as any)
      .eq("id", current.id)
      .eq("organization_id", orgId);
    if (error) return;
    setOpp((prev) => (prev ? { ...prev, stage: nextStage } : prev));
    toast.success(`Pipeline atualizado: ${STAGES.find((s) => s.id === nextStage)?.label ?? nextStage}`);
    onChanged();
  };

  const loadJourney = async (id: string) => {
    if (!orgId) return;
    setJourneyLoading(true);
    const [{ data: proposal }, { data: contract }, { data: deliveries }] = await Promise.all([
      supabase.from("proposals").select("id, status, title, created_at, sent_at, decided_at, total_value, valid_until, updated_at").eq("converted_opportunity_id", id).eq("organization_id", orgId).maybeSingle(),
      supabase.from("contracts").select("id, status, title, total_value, created_at, start_date, end_date, updated_at").eq("opportunity_id", id).eq("organization_id", orgId).maybeSingle(),
      supabase.from("deliveries").select("id, title, status, approval, due_date, created_at, delivered_at").eq("opportunity_id", id).eq("organization_id", orgId).order("due_date"),
    ]);
    setJourney({
      proposal: proposal as JourneyProposal,
      contract: contract as JourneyContract,
      deliveries: (deliveries || []) as JourneyDelivery[],
    });
    await syncStageWithJourney({
      hasProposal: !!proposal,
      proposalStatus: proposal?.status ?? null,
      hasContract: !!contract,
      contractStatus: contract?.status ?? null,
      deliveriesCount: (deliveries || []).length,
    });
    if (contract?.id) {
      const { data: inst } = await supabase
        .from("installments")
        .select("id, installment_number, amount, due_date, paid_at, status, created_at")
        .eq("contract_id", contract.id)
        .order("installment_number");
      setInstallments((inst || []) as JourneyInstallment[]);
    } else {
      setInstallments([]);
    }
    setJourneySyncedAt(new Date());
    setJourneyLoading(false);
  };


  const advanceJourney = async () => {
    if (!opp || !orgId || !user) return;
    if (opp.stage === "perdido") {
      toast.info("Oportunidade perdida. Reative-a antes de continuar a jornada.");
      return;
    }
    if (!journey.proposal) {
      await convertToProposal();
      return;
    }
    if (!journey.contract && (opp.stage === "negociacao" || opp.stage === "proposta_enviada" || opp.stage === "fechado")) {
      const warnings = getOpportunityConversionWarnings(opp);
      if (warnings.length > 0) {
        toast.warning(`Campos recomendados para contrato: ${warnings.join(", ")}`);
      }
      await convertToContract();
      return;
    }
    if (journey.contract && journey.deliveries.length === 0) {
      navigate("/dashboard/contratos");
      return;
    }
    if (journey.contract && journey.deliveries.some((d) => d.status !== "entregue" && d.status !== "aprovada")) {
      navigate("/dashboard/entregas");
      return;
    }
    if (journey.contract && journey.deliveries.every((d) => d.status === "entregue" || d.status === "aprovada")) {
      await renderDeliveryReport();
      return;
    }
    navigate("/dashboard/propostas");
  };


  const renderDeliveryReport = async () => {
    if (!opp || !orgId) return;
    try {
      const { data, error } = await supabase.functions.invoke("generate-delivery-report", {
        body: { opportunity_id: opp.id, organization_id: orgId },
      });
      if (error || !data?.pdf) {
        toast.error("Erro ao gerar relatório de entrega");
        return;
      }
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${data.pdf}`;
      link.download = data.file_name || `relatorio-entrega-${opp.brand}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Relatório de entrega gerado");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar relatório de entrega");
    }
  };


  const propertyTiers = opp?.property_id ? tiers.filter((t) => t.property_id === opp.property_id) : [];

  const profileName = (id: string | null | undefined) => {
    if (!id) return "Sistema";
    const profile = profiles.find((p) => p.id === id);
    return profile?.full_name || profile?.company || id.slice(0, 8);
  };
  const createdLog = auditLogs.find((log) => log.event_type === "created");

  const stageLabel = (s: Stage | null) => (s ? STAGES.find((x) => x.id === s)?.label ?? s : "—");

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    if (opp) {
      events.push({
        id: `opp-created-${opp.id}`,
        at: (opp as any).created_at ?? createdLog?.created_at ?? new Date().toISOString(),
        category: "oportunidade",
        title: `Oportunidade criada — ${opp.brand}`,
        description: `Valor inicial ${formatBRL(Number(opp.value || 0))}`,
      });
    }

    auditLogs.forEach((log) => {
      if (log.event_type === "created") return;
      events.push({
        id: `audit-${log.id}`,
        at: log.created_at,
        category: "historico",
        title:
          log.event_type === "stage_changed"
            ? `Etapa: ${stageLabel(log.from_stage)} → ${stageLabel(log.to_stage)}`
            : log.event_type === "value_changed"
              ? `Valor: ${formatBRL(Number(log.old_value || 0))} → ${formatBRL(Number(log.new_value || 0))}`
              : "Alteração registrada",
        description: `Por ${profileName(log.actor_id)}`,
      });
    });

    comments.forEach((comment) => {
      events.push({
        id: `comment-${comment.id}`,
        at: comment.created_at,
        category: "comentario",
        title: comment.kind === "nota_reuniao" ? "Nota de reunião" : "Comentário interno",
        comment,
      });
    });

    activities.forEach((act) => {
      const typeLabel = ACTIVITY_TYPES.find((t) => t.id === act.activity_type)?.label ?? act.activity_type;
      events.push({
        id: `activity-${act.id}`,
        at: act.created_at,
        category: "atividade",
        title: `${typeLabel} criada: ${act.title}`,
        description: act.due_date ? `Prazo ${formatDateTime(act.due_date)}` : act.description || undefined,
      });
      if (act.completed_at) {
        events.push({
          id: `activity-done-${act.id}`,
          at: act.completed_at,
          category: "atividade",
          title: `${typeLabel} concluída: ${act.title}`,
        });
      }
    });

    if (journey.proposal) {
      const p = journey.proposal;
      events.push({
        id: `proposal-${p.id}`,
        at: p.created_at,
        category: "proposta",
        title: `Proposta criada — ${p.title || `#${p.id.slice(0, 6)}`}`,
        description: `Status ${p.status}`,
      });
      if (p.sent_at) events.push({ id: `proposal-sent-${p.id}`, at: p.sent_at, category: "proposta", title: "Proposta enviada ao patrocinador" });
      if (p.decided_at) events.push({ id: `proposal-dec-${p.id}`, at: p.decided_at, category: "proposta", title: `Proposta ${p.status}` });
    }

    if (journey.contract) {
      const c = journey.contract;
      events.push({
        id: `contract-${c.id}`,
        at: c.created_at,
        category: "contrato",
        title: `Contrato criado — ${c.title || `#${c.id.slice(0, 6)}`}`,
        description: `${formatBRL(Number(c.total_value || 0))} · status ${c.status}`,
      });
      if (c.start_date) events.push({ id: `contract-start-${c.id}`, at: c.start_date, category: "contrato", title: "Início da vigência do contrato" });
      if (c.end_date) events.push({ id: `contract-end-${c.id}`, at: c.end_date, category: "contrato", title: "Fim da vigência do contrato" });
    }

    journey.deliveries.forEach((d) => {
      if (d.created_at) {
        events.push({
          id: `delivery-${d.id}`,
          at: d.created_at,
          category: "entrega",
          title: `Entrega prevista: ${d.title}`,
          description: d.due_date ? `Prazo ${formatDateTime(d.due_date)}` : undefined,
        });
      }
      if (d.delivered_at) {
        events.push({
          id: `delivery-done-${d.id}`,
          at: d.delivered_at,
          category: "entrega",
          title: `Entrega realizada: ${d.title}`,
          description: `Aprovação ${d.approval}`,
        });
      }
    });

    installments.forEach((i) => {
      events.push({
        id: `inst-${i.id}`,
        at: i.created_at,
        category: "financeiro",
        title: `Parcela ${i.installment_number} gerada — ${formatBRL(Number(i.amount || 0))}`,
        description: `Vencimento ${formatDateTime(i.due_date)}`,
      });
      if (i.paid_at) {
        events.push({
          id: `inst-paid-${i.id}`,
          at: i.paid_at,
          category: "financeiro",
          title: `Parcela ${i.installment_number} paga — ${formatBRL(Number(i.amount || 0))}`,
        });
      }
    });

    return events.filter((e) => !!e.at);
  }, [opp, auditLogs, comments, activities, journey, installments, profiles, createdLog]);

  const timelineItems = useMemo(() => {
    const filtered = timelineFilter === "todos" ? timelineEvents : timelineEvents.filter((e) => e.category === timelineFilter);
    return [...filtered].sort((a, b) => {
      const diff = new Date(a.at).getTime() - new Date(b.at).getTime();
      return timelineOrder === "asc" ? diff : -diff;
    });
  }, [timelineEvents, timelineFilter, timelineOrder]);


  const JourneyPanel = () => {
    if (!opp) return null;

    const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : null);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deliveriesDone = journey.deliveries.filter((d) => d.status === "entregue" || d.status === "aprovada");
    const deliveriesLate = journey.deliveries.filter(
      (d) => d.due_date && new Date(d.due_date) < today && d.status !== "entregue" && d.status !== "aprovada",
    );
    const nextDelivery = journey.deliveries
      .filter((d) => d.status !== "entregue" && d.status !== "aprovada" && d.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];
    const allDelivered = journey.deliveries.length > 0 && deliveriesDone.length === journey.deliveries.length;

    const paidInstallments = installments.filter((i) => i.status === "pago" || i.paid_at);
    const paidAmount = paidInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
    const totalAmount = installments.reduce((s, i) => s + Number(i.amount || 0), 0);
    const nextInstallment = installments
      .filter((i) => !i.paid_at && i.status !== "pago" && i.status !== "cancelado")
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

    const nextActivity = activities
      .filter((a) => a.status !== "concluida" && a.due_date)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

    const tierName = tiers.find((t) => t.id === opp.tier_id)?.name;

    type StepInfo = { label: string; value: string; tone?: "default" | "warn" | "ok" };
    const steps: {
      id: string;
      label: string;
      done: boolean;
      active: boolean;
      href: string | null;
      status?: string;
      info: StepInfo[];
    }[] = [
      {
        id: "oportunidade",
        label: "Oportunidade",
        done: true,
        active: !journey.proposal,
        href: null,
        status: opp.stage,
        info: [
          { label: "Valor", value: formatBRL(opp.value || 0) },
          ...(tierName ? [{ label: "Cota", value: tierName }] : []),
          ...(opp.expected_close_date ? [{ label: "Fechamento previsto", value: fmtDate(opp.expected_close_date)! }] : []),
          ...(nextActivity
            ? [{
                label: "Próxima atividade",
                value: `${nextActivity.title} — ${fmtDate(nextActivity.due_date)}`,
                tone: (new Date(nextActivity.due_date!) < today ? "warn" : "default") as StepInfo["tone"],
              }]
            : [{ label: "Próxima atividade", value: "Nenhuma agendada", tone: "warn" as const }]),
        ],
      },
      {
        id: "proposta",
        label: "Proposta",
        done: !!journey.proposal,
        active: !journey.proposal,
        href: journey.proposal ? `/dashboard/propostas` : null,
        status: journey.proposal?.status,
        info: journey.proposal
          ? [
              { label: "Título", value: journey.proposal.title || `Proposta #${journey.proposal.id.slice(0, 6)}` },
              { label: "Valor", value: formatBRL(Number(journey.proposal.total_value || 0)) },
              ...(journey.proposal.sent_at ? [{ label: "Enviada em", value: fmtDate(journey.proposal.sent_at)! }] : []),
              ...(journey.proposal.valid_until
                ? [{
                    label: "Válida até",
                    value: fmtDate(journey.proposal.valid_until)!,
                    tone: (new Date(journey.proposal.valid_until) < today ? "warn" : "default") as StepInfo["tone"],
                  }]
                : []),
              ...(journey.proposal.decided_at ? [{ label: "Decisão em", value: fmtDate(journey.proposal.decided_at)! }] : []),
            ]
          : [{ label: "Status", value: "Ainda não gerada" }],
      },
      {
        id: "contrato",
        label: "Contrato",
        done: !!journey.contract,
        active: !!journey.proposal && !journey.contract,
        href: journey.contract ? `/dashboard/contratos` : null,
        status: journey.contract?.status,
        info: journey.contract
          ? [
              { label: "Título", value: journey.contract.title || `Contrato #${journey.contract.id.slice(0, 6)}` },
              { label: "Valor", value: formatBRL(Number(journey.contract.total_value || 0)) },
              ...(journey.contract.start_date || journey.contract.end_date
                ? [{ label: "Vigência", value: `${fmtDate(journey.contract.start_date) || "—"} → ${fmtDate(journey.contract.end_date) || "—"}` }]
                : []),
              ...(installments.length > 0
                ? [
                    {
                      label: "Parcelas",
                      value: `${paidInstallments.length}/${installments.length} pagas (${formatBRL(paidAmount)} de ${formatBRL(totalAmount)})`,
                      tone: (paidInstallments.length === installments.length ? "ok" : "default") as StepInfo["tone"],
                    },
                    ...(nextInstallment
                      ? [{
                          label: "Próxima parcela",
                          value: `#${nextInstallment.installment_number} — ${formatBRL(Number(nextInstallment.amount || 0))} em ${fmtDate(nextInstallment.due_date)}`,
                          tone: (new Date(nextInstallment.due_date) < today ? "warn" : "default") as StepInfo["tone"],
                        }]
                      : []),
                  ]
                : []),
            ]
          : [{ label: "Status", value: "Ainda não gerado" }],
      },
      {
        id: "entregas",
        label: "Entregas",
        done: allDelivered,
        active: !!journey.contract && journey.deliveries.length > 0 && !allDelivered,
        href: journey.deliveries.length > 0 ? `/dashboard/entregas` : null,
        info: journey.deliveries.length
          ? [
              {
                label: "Progresso",
                value: `${deliveriesDone.length} de ${journey.deliveries.length} concluídas`,
                tone: (allDelivered ? "ok" : "default") as StepInfo["tone"],
              },
              ...(deliveriesLate.length
                ? [{ label: "Atrasadas", value: `${deliveriesLate.length} entrega(s)`, tone: "warn" as const }]
                : []),
              ...(nextDelivery
                ? [{ label: "Próxima entrega", value: `${nextDelivery.title} — ${fmtDate(nextDelivery.due_date)}` }]
                : []),
            ]
          : [{ label: "Status", value: "Nenhuma entrega gerada" }],
      },
      {
        id: "relatorio",
        label: "Relatório de entrega",
        done: false,
        active: allDelivered,
        href: null,
        info: [
          {
            label: "Status",
            value: allDelivered ? "Pronto para gerar" : "Aguardando conclusão das entregas",
            tone: (allDelivered ? "ok" : "default") as StepInfo["tone"],
          },
        ],
      },
    ];

    const nextStep = steps.find((s) => s.active);
    const warnings = getOpportunityConversionWarnings(opp);
    const completed = steps.filter((s) => s.done).length;
    const progressPct = Math.round((completed / steps.length) * 100);
    const toneClass = (tone?: StepInfo["tone"]) =>
      tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-foreground";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Próximo passo</div>
            <div className="text-xs text-muted-foreground">
              {progressPct}% da jornada concluída
              {journeySyncedAt ? ` · atualizado ${journeySyncedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => loadJourney(opp.id)} disabled={journeyLoading}>
              {journeyLoading ? "Atualizando..." : "Atualizar"}
            </Button>
            <Button size="sm" onClick={advanceJourney} disabled={converting || opp.stage === "perdido"}>
              {converting ? "Processando..." : (nextStep?.label === "Relatório de entrega" ? "Gerar relatório" : `Avançar jornada ${nextStep ? `→ ${nextStep.label}` : ""}`)}
            </Button>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        {warnings.length > 0 && (
          <div className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-md p-2">
            Campos recomendados para preencher: {warnings.join(", ")}
          </div>
        )}
        <div className="relative border rounded-lg p-4 space-y-4">
          {steps.map((step, idx) => {
            const Icon = step.done ? CheckCircle2 : Circle;
            const color = step.done ? "text-emerald-600" : step.active ? "text-primary" : "text-muted-foreground";
            return (
              <div key={step.id} className="flex items-start gap-3 relative">
                {idx < steps.length - 1 && (
                  <div className={`absolute left-[11px] top-6 w-0.5 h-full ${step.done ? "bg-emerald-500" : "bg-muted"}`} />
                )}
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${color}`}>{step.label}</span>
                    {step.status && <Badge variant="secondary" className="text-[10px]">{step.status}</Badge>}
                    {step.active && <Badge className="text-[10px]">Etapa atual</Badge>}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {step.info.map((i) => (
                      <div key={i.label} className="text-xs flex gap-1">
                        <span className="text-muted-foreground shrink-0">{i.label}:</span>
                        <span className={`truncate ${toneClass(i.tone)}`}>{i.value}</span>
                      </div>
                    ))}
                  </div>
                  {step.href && (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => step.href && navigate(step.href)}
                    >
                      Abrir
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {journey.deliveries.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Entregas</div>
            <div className="space-y-1">
              {journey.deliveries.slice(0, 5).map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                  <span className="truncate">{d.title}</span>
                  <Badge variant={d.status === "entregue" || d.status === "aprovada" ? "default" : "secondary"} className="text-xs">
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={renderDeliveryReport}>
              <Download className="h-4 w-4 mr-2" /> Baixar relatório de entrega
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (

    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {loading || !opp ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                {opp.brand}
                <Badge variant="secondary">{formatBRL(Number(opp.value))}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Excluir
                </Button>
              </SheetTitle>
              <SheetDescription>
                Detalhes, atividades e ações da oportunidade.
              </SheetDescription>
            </SheetHeader>


            <Tabs value={tab} onValueChange={setTab} className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="jornada" className="flex-1">Jornada</TabsTrigger>
                <TabsTrigger value="detalhes" className="flex-1">Detalhes</TabsTrigger>
                <TabsTrigger value="atividades" className="flex-1">
                  Atividades {activities.length > 0 && `(${activities.length})`}
                </TabsTrigger>
                <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
                <TabsTrigger value="acoes" className="flex-1">Ações</TabsTrigger>
              </TabsList>

              <TabsContent value="jornada" className="space-y-4 mt-4">
                <JourneyPanel />
              </TabsContent>

              <TabsContent value="detalhes" className="space-y-4 mt-4">
                <div className="grid gap-2 p-1" data-field="marca">

                  <Label>Marca</Label>
                  <Input
                    value={opp.brand}
                    onChange={(e) => setOpp({ ...opp, brand: e.target.value })}
                    onBlur={() => updateField({ brand: opp.brand })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2 p-1" data-field="valor">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      value={opp.value}
                      onChange={(e) => setOpp({ ...opp, value: Number(e.target.value) })}
                      onBlur={() => updateField({ value: opp.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Estágio</Label>
                    <Select value={opp.stage} onValueChange={(v) => updateField({ stage: v as Stage })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (<SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2 p-1" data-field="propriedade">
                    <Label>Propriedade</Label>
                    <Select
                      value={opp.property_id ?? "none"}
                      onValueChange={(v) => updateField({ property_id: v === "none" ? null : v, tier_id: null })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {properties.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 p-1" data-field="cota (tier)">
                    <Label>Cota (tier)</Label>
                    <Select
                      value={opp.tier_id ?? "none"}
                      onValueChange={(v) => {
                        if (v === "none") {
                          updateField({ tier_id: null });
                          return;
                        }
                        const tier = tiers.find((t) => t.id === v);
                        updateField({ tier_id: v, ...(tier ? { value: Number(tier.value) || 0 } : {}) });
                        if (tier) toast.success(`Valor atualizado para ${formatBRL(Number(tier.value) || 0)}`);
                      }}
                      disabled={!opp.property_id || propertyTiers.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={!opp.property_id ? "Escolha propriedade" : "Nenhuma"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {propertyTiers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} · {formatBRL(Number(t.value))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2 p-1" data-field="sponsor">
                    <div className="flex items-center justify-between">
                      <Label>Patrocinador</Label>
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSponsorDialogOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" /> Novo
                      </Button>
                    </div>
                    <Select
                      value={opp.sponsor_id ?? "none"}
                      onValueChange={(v) => updateField({ sponsor_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {sponsors.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                        {createdSponsor && !sponsors.some((s) => s.id === createdSponsor.id) && (
                          <SelectItem value={createdSponsor.id}>{createdSponsor.name}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                  </div>
                  <div className="grid gap-2 p-1" data-field="responsável">
                    <Label>Responsável</Label>
                    <Select
                      value={opp.assignee_id ?? "none"}
                      onValueChange={(v) => updateField({ assignee_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não atribuído</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name || p.company || p.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2 p-1" data-field="data prevista">
                  <Label>Data prevista</Label>
                  <Input
                    type="date"
                    value={opp.expected_close_date ?? ""}
                    onChange={(e) => setOpp({ ...opp, expected_close_date: e.target.value })}
                    onBlur={() => updateField({ expected_close_date: opp.expected_close_date || null })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Observações</Label>
                  <Textarea
                    rows={3}
                    value={opp.notes ?? ""}
                    onChange={(e) => setOpp({ ...opp, notes: e.target.value })}
                    onBlur={() => updateField({ notes: opp.notes })}
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Auditoria visual</h3>
                    <p className="text-xs text-muted-foreground">Criador, mudanças de etapa, alterações de valor e histórico.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border p-3">
                      <div className="text-muted-foreground">Criado por</div>
                      <div className="font-medium mt-1">{profileName(createdLog?.actor_id ?? opp.owner_id)}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-muted-foreground">Último movimento</div>
                      <div className="font-medium mt-1">{profileName(auditLogs.find((log) => log.event_type === "stage_changed")?.actor_id)}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {auditLogs.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>}
                    {auditLogs.map((log) => (
                      <div key={log.id} className="rounded-md border p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {log.event_type === "created" && "Oportunidade criada"}
                            {log.event_type === "stage_changed" && `Etapa: ${log.from_stage ? STAGES.find((s) => s.id === log.from_stage)?.label : "—"} → ${log.to_stage ? STAGES.find((s) => s.id === log.to_stage)?.label : "—"}`}
                            {log.event_type === "value_changed" && `Valor: ${formatBRL(Number(log.old_value || 0))} → ${formatBRL(Number(log.new_value || 0))}`}
                          </span>
                          <span className="text-muted-foreground">{formatDateTime(log.created_at)}</span>
                        </div>
                        <div className="text-muted-foreground mt-1">por {profileName(log.actor_id)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <OpportunityContactsPanel
                  opportunityId={opp.id}
                  sponsorId={opp.sponsor_id}
                  hasContract={!!journey.contract}
                  hasInstallments={installments.length > 0}
                />


                {opp.stage === "perdido" && (
                  <>
                    <Separator />
                    <div className="grid gap-2">
                      <Label>Motivo da perda</Label>
                      <Select
                        value={opp.lost_reason ?? "none"}
                        onValueChange={(v) => updateField({ lost_reason: v === "none" ? null : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {LOST_REASONS.map((r) => (<SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Comentário</Label>
                      <Textarea
                        rows={2}
                        value={opp.lost_comment ?? ""}
                        onChange={(e) => setOpp({ ...opp, lost_comment: e.target.value })}
                        onBlur={() => updateField({ lost_comment: opp.lost_comment })}
                      />
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="atividades" className="mt-4 space-y-4">
                {opp && user && (
                  <div className="border rounded-lg p-3 bg-primary/5">
                    <NextStepsAI
                      context="opportunity"
                      targetId={opp.id}
                      opportunityId={opp.id}
                      ownerId={user.id}
                      onActivityCreated={async () => {
                        const { data } = await supabase
                          .from("opportunity_activities")
                          .select("*")
                          .eq("opportunity_id", opp.id)
                          .order("created_at", { ascending: false });
                        setActivities((data as Activity[]) ?? []);
                      }}
                    />
                  </div>
                )}
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newAct.activity_type}
                      onValueChange={(v) => setNewAct({ ...newAct, activity_type: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_TYPES.map((t) => (<SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="datetime-local"
                      value={newAct.due_date}
                      onChange={(e) => setNewAct({ ...newAct, due_date: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Título da atividade"
                    value={newAct.title}
                    onChange={(e) => setNewAct({ ...newAct, title: e.target.value })}
                  />
                  <Textarea
                    placeholder="Descrição (opcional)"
                    rows={2}
                    value={newAct.description}
                    onChange={(e) => setNewAct({ ...newAct, description: e.target.value })}
                  />
                  <Button size="sm" onClick={addActivity} className="w-full">
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>

                <div className="space-y-2">
                  {activities.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nenhuma atividade ainda.
                    </p>
                  )}
                  {activities.map((a) => {
                    const meta = ACTIVITY_TYPES.find((t) => t.id === a.activity_type);
                    const Icon = meta?.icon ?? StickyNote;
                    const overdue =
                      a.due_date && a.status === "pendente" && new Date(a.due_date) < new Date();
                    return (
                      <div
                        key={a.id}
                        className={`border rounded-md p-2.5 flex items-start gap-2 ${
                          a.status === "concluido" ? "opacity-60" : ""
                        }`}
                      >
                        <button
                          onClick={() => toggleActivity(a)}
                          className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                            a.status === "concluido" ? "bg-primary border-primary text-primary-foreground" : "bg-background"
                          }`}
                          aria-label="Concluir"
                        >
                          {a.status === "concluido" && <Check className="h-3 w-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium truncate">{a.title}</span>
                            {overdue && <Badge variant="destructive" className="text-[10px] py-0">atrasada</Badge>}
                            <TaskInsightsButton taskId={a.id} source="activity" />
                          </div>

                          {a.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                          )}
                          <div className="mt-0.5">
                            <DueDateEditor
                              value={a.due_date}
                              withTime
                              onSave={async (next) => {
                                const value = next ? new Date(next).toISOString() : null;
                                const { error } = await supabase
                                  .from("opportunity_activities")
                                  .update({ due_date: value })
                                  .eq("id", a.id);
                                if (error) {
                                  toast.error(error.message);
                                  return;
                                }
                                setActivities((cur) =>
                                  cur.map((x) => (x.id === a.id ? { ...x, due_date: value } : x)),
                                );
                                toast.success("Data atualizada");
                              }}
                            />
                          </div>
                          <ActivityContextLinks
                            sponsorId={opp.sponsor_id}
                            sponsorName={sponsors.find((s) => s.id === opp.sponsor_id)?.name ?? null}
                            opportunityId={opp.id}
                            opportunityLabel={opp.brand}
                            propertyName={properties.find((p) => p.id === opp.property_id)?.name ?? null}
                          />
                        </div>

                        <button
                          onClick={() => deleteActivity(a.id)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-4 space-y-4">
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={newComment.kind} onValueChange={(kind) => setNewComment({ ...newComment, kind })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMMENT_KINDS.map((kind) => <SelectItem key={kind.id} value={kind.id}>{kind.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select
                      value="mention"
                      onValueChange={(profileId) => {
                        if (profileId !== "mention" && !newComment.mentions.includes(profileId)) {
                          setNewComment({ ...newComment, mentions: [...newComment.mentions, profileId] });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Mencionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mention">Mencionar pessoa</SelectItem>
                        {profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profileName(profile.id)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {newComment.mentions.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {newComment.mentions.map((id) => <Badge key={id} variant="secondary">@{profileName(id)}</Badge>)}
                    </div>
                  )}
                  <Textarea rows={3} placeholder="Comentário interno, nota de reunião ou próximo contexto..." value={newComment.content} onChange={(e) => setNewComment({ ...newComment, content: e.target.value })} />
                  <Input type="file" multiple onChange={(e) => setCommentFiles(Array.from(e.target.files ?? []))} />
                  <Button size="sm" onClick={addComment} className="w-full"><MessageSquare className="h-4 w-4 mr-2" />Adicionar à timeline</Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={timelineFilter} onValueChange={(v) => setTimelineFilter(v as typeof timelineFilter)}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os eventos</SelectItem>
                      {(Object.keys(TIMELINE_META) as TimelineCategory[]).map((c) => (
                        <SelectItem key={c} value={c}>{TIMELINE_META[c].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => setTimelineOrder((o) => (o === "asc" ? "desc" : "asc"))}>
                    <Clock className="h-3.5 w-3.5 mr-1.5" />
                    {timelineOrder === "asc" ? "Do início ao fim" : "Mais recentes primeiro"}
                  </Button>
                  <span className="text-xs text-muted-foreground">{timelineItems.length} evento(s)</span>
                </div>

                <div className="relative space-y-3 pl-5">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                  {timelineItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhum item na timeline.</p>}
                  {timelineItems.map((entry) => {
                    const meta = TIMELINE_META[entry.category];
                    const Icon = meta.icon;
                    return (
                      <div key={entry.id} className="relative">
                        <span className={`absolute -left-5 top-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background ring-2 ring-border ${meta.color}`}>
                          <Icon className="h-2.5 w-2.5" />
                        </span>
                        <div className="border rounded-md p-3 text-sm bg-card">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium">
                              {entry.comment ? profileName(entry.comment.author_id) : entry.title}
                              <Badge variant="outline" className="ml-2 text-[10px]">{meta.label}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(entry.at)}</span>
                          </div>
                          {entry.comment ? (
                            <>
                              {entry.comment.mentions.length > 0 && (
                                <div className="mt-2 flex gap-1 flex-wrap">
                                  {entry.comment.mentions.map((id) => <Badge key={id} variant="secondary">@{profileName(id)}</Badge>)}
                                </div>
                              )}
                              <p className="mt-2 whitespace-pre-wrap text-sm">{entry.comment.content}</p>
                              {(entry.comment.opportunity_comment_attachments?.length ?? 0) > 0 && (
                                <div className="mt-2 space-y-2">
                                  {entry.comment.opportunity_comment_attachments?.map((attachment) => (
                                    <div key={attachment.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                                      <span className="flex min-w-0 flex-1 items-center gap-1 text-xs">
                                        <Paperclip className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{attachment.file_name}</span>
                                      </span>
                                      <Button size="sm" variant="outline" onClick={() => previewCommentAttachment(attachment.storage_path)} aria-label={`Pré-visualizar ${attachment.file_name}`}>
                                        <Eye className="h-3.5 w-3.5 mr-1" />
                                        Pré-visualizar
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => downloadCommentAttachment(attachment)} aria-label={`Baixar ${attachment.file_name}`}>
                                        <Download className="h-3.5 w-3.5 mr-1" />
                                        Baixar
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            entry.description && <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </TabsContent>

              <TabsContent value="acoes" className="mt-4 space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={convertToProposal}
                  disabled={converting || !!opp.converted_proposal_id}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {opp.converted_proposal_id ? "Proposta já criada" : "Gerar proposta (rascunho)"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={convertToContract}
                  disabled={converting || !!opp.converted_contract_id}
                >
                  <FileSignature className="h-4 w-4 mr-2" />
                  {opp.converted_contract_id ? "Contrato já criado" : "Converter em contrato (fecha a oportunidade)"}
                </Button>
                {opp.tier_id && (
                  <p className="text-xs text-muted-foreground">
                    Esta oportunidade está vinculada a uma cota. Ao mover para “Fechado”, a cota é
                    marcada como vendida automaticamente.
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
        <MissingInfoDialog state={missingInfo} onOpenChange={(o) => !o && setMissingInfo(null)} />

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir oportunidade?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Atividades, comentários e histórico vinculados também serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteOpportunity();
                }}
                disabled={deleting}
              >
                {deleting ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo patrocinador</DialogTitle>
              <DialogDescription>
                Será cadastrado em Patrocinadores e vinculado a esta oportunidade.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>Nome *</Label>
                <Input
                  value={newSponsor.name}
                  onChange={(e) => setNewSponsor((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome da empresa"
                />
              </div>
              <div className="grid gap-2">
                <Label>Segmento</Label>
                <Input
                  value={newSponsor.segment}
                  onChange={(e) => setNewSponsor((f) => ({ ...f, segment: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Site</Label>
                <Input
                  value={newSponsor.website}
                  onChange={(e) => setNewSponsor((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSponsorDialogOpen(false)} disabled={creatingSponsor}>
                Cancelar
              </Button>
              <Button onClick={handleCreateSponsor} disabled={creatingSponsor || !newSponsor.name.trim()}>
                {creatingSponsor ? "Criando..." : "Criar patrocinador"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!createdSponsor} onOpenChange={(o) => { if (!o) setCreatedSponsor(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Patrocinador cadastrado</DialogTitle>
              <DialogDescription>
                {createdSponsor?.name} foi criado e vinculado à oportunidade. O que deseja fazer agora?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreatedSponsor(null)}>
                Continuar no pipeline
              </Button>
              <Button
                onClick={() => {
                  const id = createdSponsor?.id;
                  setCreatedSponsor(null);
                  onOpenChange(false);
                  if (id) navigate(`/dashboard/patrocinadores/${id}`);
                }}
              >
                Ir para a página <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

