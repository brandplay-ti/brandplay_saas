import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSponsorAccess } from "@/hooks/useSponsorAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, FileCheck, FolderKanban, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Delivery {
  id: string;
  organization_id: string | null;
  title: string;
  description: string | null;
  brand: string;
  asset_type: string | null;
  quantity: number;
  due_date: string | null;
  delivered_at: string | null;
  status: string;
  approval: "pendente" | "aprovada" | "reprovada";
  approval_comment: string | null;
  evidence_url: string | null;
}

interface ApprovalLog {
  id: string;
  decision: string;
  comment: string | null;
  created_at: string;
  decided_by_role: string;
}

const approvalUI: Record<string, { label: string; cls: string; icon: any }> = {
  pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Clock },
  aprovada: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  reprovada: { label: "Reprovada", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: XCircle },
};

export default function PortalDeliveries() {
  const { user } = useAuth();
  const { accesses } = useSponsorAccess();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [decision, setDecision] = useState<"aprovada" | "reprovada" | null>(null);
  const [comment, setComment] = useState("");
  const [logs, setLogs] = useState<ApprovalLog[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const sponsorIds = useMemo(() => accesses.map((a) => a.sponsor_id), [accesses]);

  const load = async () => {
    if (sponsorIds.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // Buscar contratos do(s) sponsor(s) -> brands e opportunity_ids
    const { data: contracts } = await supabase
      .from("contracts")
      .select("brand, opportunity_id")
      .in("sponsor_id", sponsorIds);

    const brands = Array.from(new Set((contracts ?? []).map((c) => c.brand).filter(Boolean)));
    const oppIds = Array.from(new Set((contracts ?? []).map((c) => c.opportunity_id).filter(Boolean)));

    if (brands.length === 0 && oppIds.length === 0) {
      setDeliveries([]);
      setLoading(false);
      return;
    }

    const orFilter = [
      brands.length ? `brand.in.(${brands.map((b) => `"${b}"`).join(",")})` : null,
      oppIds.length ? `opportunity_id.in.(${oppIds.join(",")})` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data } = await supabase
      .from("deliveries")
      .select("*")
      .or(orFilter)
      .order("due_date", { ascending: true, nullsFirst: false });
    setDeliveries((data ?? []) as Delivery[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [sponsorIds.join(",")]);

  const openDialog = async (d: Delivery, dec: "aprovada" | "reprovada") => {
    setSelected(d);
    setDecision(dec);
    setComment(d.approval_comment ?? "");
    const { data } = await supabase
      .from("delivery_approval_log")
      .select("*")
      .eq("delivery_id", d.id)
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as ApprovalLog[]);
  };

  const submit = async () => {
    if (!selected || !decision || !user) return;
    if (decision === "reprovada" && !comment.trim()) {
      toast.error("Comentário é obrigatório ao reprovar.");
      return;
    }
    setSubmitting(true);
    const { error: updErr } = await supabase
      .from("deliveries")
      .update({ approval: decision, approval_comment: comment || null })
      .eq("id", selected.id);
    if (updErr) {
      toast.error(updErr.message);
      setSubmitting(false);
      return;
    }
    await supabase.from("delivery_approval_log").insert({
      delivery_id: selected.id,
      organization_id: selected.organization_id,
      decided_by: user.id,
      decided_by_role: "patrocinador",
      decision,
      comment: comment || null,
    });
    toast.success(decision === "aprovada" ? "Entrega aprovada!" : "Entrega reprovada");
    setSelected(null);
    setDecision(null);
    setComment("");
    load();
    setSubmitting(false);
  };

  const counts = useMemo(
    () => ({
      pendente: deliveries.filter((d) => d.approval === "pendente").length,
      aprovada: deliveries.filter((d) => d.approval === "aprovada").length,
      reprovada: deliveries.filter((d) => d.approval === "reprovada").length,
    }),
    [deliveries],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderKanban className="h-6 w-6 text-primary" /> Entregas
        </h1>
        <p className="text-sm text-muted-foreground">
          Aprove ou reprove as entregas das suas ativações.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-3">
        {(["pendente", "aprovada", "reprovada"] as const).map((k) => {
          const Ui = approvalUI[k];
          return (
            <Card key={k}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
                  <Ui.icon className="h-4 w-4" /> {Ui.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{counts[k]}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{deliveries.length} entregas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : deliveries.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma entrega disponível.
            </p>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d) => {
                const Ui = approvalUI[d.approval];
                return (
                  <div key={d.id} className="rounded-lg border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{d.title}</h3>
                          <Badge variant="outline" className={Ui.cls}>
                            <Ui.icon className="h-3 w-3 mr-1" /> {Ui.label}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {d.brand}
                          </Badge>
                        </div>
                        {d.description && (
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                            {d.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                          {d.asset_type && <span>Tipo: {d.asset_type}</span>}
                          <span>Qtd: {d.quantity}</span>
                          {d.due_date && (
                            <span>
                              Prazo:{" "}
                              {format(new Date(d.due_date), "dd MMM yyyy", { locale: ptBR })}
                            </span>
                          )}
                          {d.delivered_at && (
                            <span>
                              Entregue:{" "}
                              {format(new Date(d.delivered_at), "dd MMM yyyy", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                        {d.evidence_url && (
                          <a
                            href={d.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary inline-flex items-center gap-1 mt-2"
                          >
                            <FileCheck className="h-3 w-3" /> Ver evidência
                          </a>
                        )}
                        {d.approval_comment && (
                          <p className="text-xs mt-2 p-2 rounded bg-muted/50 italic">
                            "{d.approval_comment}"
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={d.approval === "aprovada" ? "default" : "outline"}
                          onClick={() => openDialog(d, "aprovada")}
                          disabled={d.status === "pendente"}
                          title={d.status === "pendente" ? "Aguardando entrega" : ""}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant={d.approval === "reprovada" ? "destructive" : "outline"}
                          onClick={() => openDialog(d, "reprovada")}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Reprovar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected && !!decision} onOpenChange={(o) => !o && (setSelected(null), setDecision(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "aprovada" ? "Aprovar entrega" : "Reprovar entrega"}
            </DialogTitle>
            <DialogDescription>{selected?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={
                decision === "reprovada"
                  ? "Explique o motivo da reprovação (obrigatório)…"
                  : "Comentário opcional…"
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
            {logs.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Histórico</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {logs.map((l) => (
                    <div key={l.id} className="text-xs p-2 rounded border">
                      <div className="flex justify-between gap-2">
                        <Badge variant="outline" className={approvalUI[l.decision]?.cls}>
                          {approvalUI[l.decision]?.label}
                        </Badge>
                        <span className="text-muted-foreground">
                          {format(new Date(l.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      {l.comment && <p className="mt-1 italic">"{l.comment}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => (setSelected(null), setDecision(null))}>
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              variant={decision === "reprovada" ? "destructive" : "default"}
            >
              {decision === "aprovada" ? "Confirmar aprovação" : "Confirmar reprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
