import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Mail, Phone, Globe, Activity, ShieldCheck, Users as UsersIcon, Sparkles,
  Handshake, FileText, Package, ListChecks, Tag, AlertTriangle, RefreshCw, FolderUp,
} from "lucide-react";
import { LogoFrame, logoFrameIconClass } from "@/components/LogoFrame";
import { SponsorTimeline } from "@/components/sponsors/SponsorTimeline";
import { SponsorPortalAccess } from "@/components/sponsors/SponsorPortalAccess";
import { CrmTasksPanel } from "@/components/sponsors/CrmTasksPanel";
import { SponsorBrandsPanel } from "@/components/sponsors/SponsorBrandsPanel";
import { SponsorDocumentsPanel } from "@/components/sponsors/SponsorDocumentsPanel";

import { NextStepsAI } from "@/components/pipeline/NextStepsAI";
import { ExecutiveSummaryAI } from "@/components/sponsors/ExecutiveSummaryAI";
import { MeetingPrepAI } from "@/components/sponsors/MeetingPrepAI";

import { ROIWidget } from "@/components/dashboard/ROIWidget";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SponsorProfileFields, SponsorSocialDashboard, emptySponsorProfile,
  sponsorProfileFromRow, sponsorProfileToPayload, type SponsorProfileValue,
} from "@/components/sponsors/SponsorProfileFields";
import {
  HEALTH_CLASS, HEALTH_LABEL, LIFECYCLE_CLASS, LIFECYCLE_LABEL, LIFECYCLE_ORDER,
  PRIORITY_LABEL, computeAccountFit, formatBRL, formatDate, daysSince,
  type Health, type Lifecycle, type Priority,
} from "@/lib/crmAccount";

const db = supabase as any;

interface Sponsor {
  id: string; name: string; trade_name: string | null; segment: string | null; logo_path: string | null;
  website: string | null; domain: string | null; tags: string[] | null; last_contact_at: string | null;
  notes: string | null; lifecycle: Lifecycle; priority: Priority; health: Health;
  next_action: string | null; next_action_at: string | null; archived_at: string | null;
  about: string | null; social_links: Record<string, string> | null; social_stats: Record<string, any> | null;
  locations: string[] | null; final_location: string | null; fans_count: number | null;
  prize_pool: number | null; participants_count: number | null; teams_count: number | null; key_notes: string | null;
}
interface Contact { id: string; name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean; }

export default function SponsorDetail() {
  const { id } = useParams();
  const { orgId, can } = useOrganization();
  const { toast } = useToast();
  const [sponsor, setSponsor] = useState<Sponsor | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [brandsCount, setBrandsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("edit") === "1") setEditOpen(true);
  }, [searchParams]);
  const [profile, setProfile] = useState<SponsorProfileValue>(emptySponsorProfile());

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id || !orgId) return;
    if (!opts?.silent) setLoading(true);

    const [sp, ct, opps, props, cons, dels, inst, brands] = await Promise.all([
      db.from("sponsors")
        .select("id,name,trade_name,legal_name,tax_id,address,address_city,address_state,zip_code,segment,logo_path,website,domain,tags,last_contact_at,notes,lifecycle,priority,health,next_action,next_action_at,archived_at,about,social_links,social_stats,locations,final_location,fans_count,prize_pool,participants_count,teams_count,key_notes")
        .eq("id", id).eq("organization_id", orgId).maybeSingle(),
      db.from("sponsor_contacts").select("*").eq("sponsor_id", id).order("is_primary", { ascending: false }),
      db.from("opportunities").select("id,brand,stage,value,expected_close_date,lost_reason").eq("sponsor_id", id).eq("organization_id", orgId).order("created_at", { ascending: false }),
      db.from("proposals").select("id,title,status,total_value,valid_until,created_at").eq("sponsor_id", id).eq("organization_id", orgId).order("created_at", { ascending: false }),
      db.from("contracts").select("id,title,status,total_value,start_date,end_date").eq("sponsor_id", id).eq("organization_id", orgId).order("created_at", { ascending: false }),
      db.from("deliveries").select("id,title,status,approval,due_date").eq("sponsor_id", id).eq("organization_id", orgId).order("due_date", { nullsFirst: false }),
      db.from("installments").select("id,installment_number,total_installments,amount,due_date,status").eq("sponsor_id", id).order("due_date"),
      db.from("sponsor_brands").select("id", { count: "exact", head: true }).eq("sponsor_id", id),
    ]);
    setSponsor((sp.data ?? null) as Sponsor | null);
    setProfile(sponsorProfileFromRow(sp.data));
    setContacts((ct.data ?? []) as Contact[]);
    setOpportunities(opps.data ?? []);
    setProposals(props.data ?? []);
    setContracts(cons.data ?? []);
    setDeliveries(dels.data ?? []);
    setInstallments(inst.data ?? []);
    setBrandsCount(brands.count ?? 0);
    setLoading(false);
  }, [id, orgId]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);

  const metrics = useMemo(() => {
    const openOpps = opportunities.filter((o) => o.stage !== "fechado" && o.stage !== "perdido");
    const activeContracts = contracts.filter((c) => c.status === "ativo");
    const overdue = installments.filter((i) => i.status === "atrasado");
    const lateDeliveries = deliveries.filter((d) => d.status !== "aprovada" && d.status !== "entregue" && d.due_date && d.due_date < today);
    return {
      openOpps,
      openValue: openOpps.reduce((s, o) => s + Number(o.value ?? 0), 0),
      activeContracts,
      contractedValue: activeContracts.reduce((s, c) => s + Number(c.total_value ?? 0), 0),
      overdue,
      overdueValue: overdue.reduce((s, i) => s + Number(i.amount ?? 0), 0),
      paidValue: installments.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount ?? 0), 0),
      lateDeliveries,
      approvedDeliveries: deliveries.filter((d) => d.approval === "aprovada").length,
    };
  }, [opportunities, contracts, installments, deliveries, today]);

  const fit = useMemo(() => computeAccountFit({
    contractsActive: metrics.activeContracts.length,
    contractsTotal: contracts.length,
    opportunitiesOpen: metrics.openOpps.length,
    opportunitiesWon: opportunities.filter((o) => o.stage === "fechado").length,
    opportunitiesLost: opportunities.filter((o) => o.stage === "perdido").length,
    lastContactAt: sponsor?.last_contact_at ?? null,
    contactsCount: contacts.length,
    brandsCount,
    overdueInstallments: metrics.overdue.length,
    deliveriesApproved: metrics.approvedDeliveries,
    deliveriesLate: metrics.lateDeliveries.length,
  }), [metrics, contracts, opportunities, sponsor, contacts, brandsCount]);

  const createRenewal = async (contractId: string) => {
    const { error } = await db.rpc("create_renewal_opportunity", { _contract_id: contractId });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Renovação criada", description: "Uma nova negociação foi aberta no pipeline." });
    load();
  };

  const patch = async (values: Record<string, unknown>) => {
    if (!sponsor) return;
    const { error } = await db.from("sponsors").update(values).eq("id", sponsor.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setSponsor({ ...sponsor, ...(values as any) });
    toast({ title: "Conta atualizada" });
  };

  const saveProfile = async () => {
    await patch(sponsorProfileToPayload(profile) as Record<string, unknown>);
    setEditOpen(false);
  };


  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!sponsor) return <p className="text-sm text-muted-foreground">Patrocinador não encontrado.</p>;

  const logoUrl = sponsor.logo_path
    ? supabase.storage.from("sponsor-logos").getPublicUrl(sponsor.logo_path).data.publicUrl
    : null;
  const editable = can("crm");
  const daysNoContact = daysSince(sponsor.last_contact_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/patrocinadores"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        {sponsor.archived_at && <Badge variant="outline">Conta arquivada</Badge>}
      </div>

      <Card>
        <CardContent className="p-6 flex items-start gap-4 flex-wrap">
          <LogoFrame src={logoUrl} alt={sponsor.name} size="lg" fallback={<UsersIcon className={`${logoFrameIconClass("lg")} text-muted-foreground`} />} />
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold truncate">{sponsor.trade_name || sponsor.name}</h1>
              <Badge variant="outline" className={LIFECYCLE_CLASS[sponsor.lifecycle]}>{LIFECYCLE_LABEL[sponsor.lifecycle]}</Badge>
              <Badge variant="outline" className={HEALTH_CLASS[sponsor.health]}>{HEALTH_LABEL[sponsor.health]}</Badge>
              <Badge variant="secondary">Prioridade {sponsor.priority}</Badge>
            </div>
            {sponsor.segment && <p className="text-sm text-muted-foreground">{sponsor.segment}</p>}
            {sponsor.website && (
              <a href={sponsor.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1 mt-1">
                <Globe className="h-3 w-3" /> {sponsor.website}
              </a>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Último contato: {formatDate(sponsor.last_contact_at)}{daysNoContact !== null && ` (há ${daysNoContact} dia(s))`}
            </p>
            <p className="text-xs text-muted-foreground">
              Próxima ação: {sponsor.next_action ? `${sponsor.next_action} · ${formatDate(sponsor.next_action_at)}` : "não definida"}
            </p>
          </div>

          {editable && (
            <div className="grid gap-2 w-full sm:w-auto sm:grid-cols-3">
              <Select value={sponsor.lifecycle} onValueChange={(v) => patch({ lifecycle: v })}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{LIFECYCLE_ORDER.map((l) => <SelectItem key={l} value={l}>{LIFECYCLE_LABEL[l]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={sponsor.priority} onValueChange={(v) => patch({ priority: v })}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{(["A", "B", "C"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={sponsor.health} onValueChange={(v) => patch({ health: v })}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(HEALTH_LABEL) as Health[]).map((h) => <SelectItem key={h} value={h}>{HEALTH_LABEL[h]}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="sm:col-span-3" onClick={() => setEditOpen(true)}>Editar dados da conta</Button>
            </div>

          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Em negociação", value: formatBRL(metrics.openValue), hint: `${metrics.openOpps.length} negociação(ões)` },
          { label: "Contratado ativo", value: formatBRL(metrics.contractedValue), hint: `${metrics.activeContracts.length} contrato(s)` },
          { label: "Recebido", value: formatBRL(metrics.paidValue), hint: `${installments.filter((i) => i.status === "pago").length} parcela(s)` },
          { label: "Em atraso", value: formatBRL(metrics.overdueValue), hint: `${metrics.overdue.length} parcela(s)` },
          { label: "Entregas aprovadas", value: String(metrics.approvedDeliveries), hint: `${metrics.lateDeliveries.length} atrasada(s)` },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
            <CardContent><div className="text-lg font-bold">{k.value}</div><p className="text-xs text-muted-foreground">{k.hint}</p></CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="sobre">Sobre & Dados</TabsTrigger>
          <TabsTrigger value="relacionamento"><Activity className="h-4 w-4 mr-2" /> Relacionamento</TabsTrigger>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="comercial"><Handshake className="h-4 w-4 mr-2" /> Comercial</TabsTrigger>
          <TabsTrigger value="contratos"><FileText className="h-4 w-4 mr-2" /> Contratos</TabsTrigger>
          <TabsTrigger value="entregas"><Package className="h-4 w-4 mr-2" /> Entregas</TabsTrigger>
          <TabsTrigger value="marcas"><Tag className="h-4 w-4 mr-2" /> Marcas</TabsTrigger>
          <TabsTrigger value="documentos"><FolderUp className="h-4 w-4 mr-2" /> Documentos</TabsTrigger>
          <TabsTrigger value="portal"><ShieldCheck className="h-4 w-4 mr-2" /> Portal</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-4 w-4 mr-2" /> IA</TabsTrigger>

        </TabsList>

        <TabsContent value="sobre" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Sobre</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{sponsor.about || <span className="text-muted-foreground">Sem descrição cadastrada.</span>}</p>
            </CardContent>
          </Card>

          <SponsorSocialDashboard links={sponsor.social_links} stats={sponsor.social_stats} />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Principais dados</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Torcedores", value: sponsor.fans_count != null ? new Intl.NumberFormat("pt-BR").format(sponsor.fans_count) : "—" },
                  { label: "Premiação", value: sponsor.prize_pool != null ? formatBRL(Number(sponsor.prize_pool)) : "—" },
                  { label: "Participantes", value: sponsor.participants_count != null ? new Intl.NumberFormat("pt-BR").format(sponsor.participants_count) : "—" },
                  { label: "Times", value: sponsor.teams_count != null ? String(sponsor.teams_count) : "—" },
                ].map((k) => (
                  <div key={k.label} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-lg font-bold">{k.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Locais</p>
                {(sponsor.locations ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1">{(sponsor.locations ?? []).map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}</div>
                ) : <p className="text-sm text-muted-foreground">Não informado.</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Local da final</p>
                <p className="text-sm">{sponsor.final_location || <span className="text-muted-foreground">Não informado.</span>}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observações</p>
                <p className="text-sm whitespace-pre-wrap">{sponsor.key_notes || <span className="text-muted-foreground">Sem observações.</span>}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumo" className="pt-4 space-y-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fit comercial: {fit.score}/100</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress value={fit.score} />
              <div className="grid gap-2 sm:grid-cols-2">
                {fit.factors.map((f) => (
                  <div key={f.label} className="rounded-md border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{f.label}</p>
                      <span className="text-xs text-muted-foreground">{f.points}/{f.max}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{f.detail}</p>
                  </div>
                ))}
              </div>
              {fit.gaps.length > 0 && (
                <div className="rounded-md border border-dashed p-3">
                  <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Lacunas de informação</p>
                  <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                    {fit.gaps.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <ExecutiveSummaryAI sponsorId={sponsor.id} />
          <ROIWidget sponsorId={sponsor.id} compact />

          {sponsor.notes && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{sponsor.notes}</p></CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="relacionamento" className="pt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Tarefas e próximas ações</CardTitle></CardHeader>
            <CardContent><CrmTasksPanel sponsorId={sponsor.id} /></CardContent>
          </Card>
          <SponsorTimeline sponsorId={sponsor.id} />
        </TabsContent>

        <TabsContent value="contatos" className="pt-4 space-y-2">
          {contacts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>}
          {contacts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{c.name}</p>
                  {c.is_primary && <Badge variant="default" className="text-[10px]">Principal</Badge>}
                </div>
                {c.role && <p className="text-xs text-muted-foreground">{c.role}</p>}
                {c.email && <p className="text-sm flex items-center gap-1 mt-1"><Mail className="h-3 w-3" /> {c.email}</p>}
                {c.phone && <p className="text-sm flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="comercial" className="pt-4 space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Negociações</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {opportunities.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma negociação vinculada.</p>}
              {opportunities.map((o) => (
                <div key={o.id} className="rounded-md border p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">{o.brand}</p>
                    <p className="text-xs text-muted-foreground">{o.stage}{o.lost_reason ? ` · ${o.lost_reason}` : ""}</p>
                  </div>
                  <p className="text-sm font-medium">{formatBRL(Number(o.value ?? 0))}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Propostas</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {proposals.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma proposta vinculada.</p>}
              {proposals.map((p) => (
                <div key={p.id} className="rounded-md border p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.status} · válida até {formatDate(p.valid_until)}</p>
                  </div>
                  <p className="text-sm font-medium">{formatBRL(Number(p.total_value ?? 0))}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contratos" className="pt-4 space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Contratos</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {contracts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato vinculado.</p>}
              {contracts.map((c) => (
                <div key={c.id} className="rounded-md border p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.status} · {formatDate(c.start_date)} → {formatDate(c.end_date)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{formatBRL(Number(c.total_value ?? 0))}</p>
                    {editable && c.status === "ativo" && (
                      <Button size="sm" variant="outline" onClick={() => createRenewal(c.id)}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Gerar renovação
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {can("financeiro") ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Parcelas</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {installments.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma parcela registrada.</p>}
                {installments.map((i) => (
                  <div key={i.id} className="rounded-md border p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">Parcela {i.installment_number}/{i.total_installments}</p>
                      <p className="text-xs text-muted-foreground">Vencimento {formatDate(i.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={i.status === "atrasado" ? "bg-destructive/15 text-destructive border-destructive/30" : ""}>{i.status}</Badge>
                      <p className="text-sm font-medium">{formatBRL(Number(i.amount ?? 0))}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">Você não tem permissão financeira para ver as parcelas desta conta.</p>
          )}
        </TabsContent>

        <TabsContent value="entregas" className="pt-4 space-y-2">
          {deliveries.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega vinculada.</p>}
          {deliveries.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">Prazo {formatDate(d.due_date)}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline">{d.status}</Badge>
                  <Badge variant="secondary">{d.approval}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="marcas" className="pt-4">
          <SponsorBrandsPanel sponsorId={sponsor.id} />
        </TabsContent>

        <TabsContent value="documentos" className="pt-4">
          <SponsorDocumentsPanel sponsorId={sponsor.id} organizationId={orgId!} editable={editable} />
        </TabsContent>

        <TabsContent value="portal" className="pt-4">
          <SponsorPortalAccess sponsorId={sponsor.id} />
        </TabsContent>


        <TabsContent value="ia" className="pt-4 space-y-4">
          <MeetingPrepAI sponsorId={sponsor.id} onTaskCreated={() => load({ silent: true })} />
          <NextStepsAI context="sponsor" targetId={sponsor.id} />
        </TabsContent>

      </Tabs>

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setProfile(sponsorProfileFromRow(sponsor)); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados da conta</DialogTitle>
            <DialogDescription>Sobre, redes sociais e principais dados do patrocinador.</DialogDescription>
          </DialogHeader>
          <SponsorProfileFields value={profile} onChange={setProfile} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveProfile}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
