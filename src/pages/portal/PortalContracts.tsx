import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSponsorAccess } from "@/hooks/useSponsorAccess";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, CalendarDays, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Contract {
  id: string;
  title: string;
  brand: string;
  contract_number: string | null;
  status: string;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  payment_method: string;
}

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  contract_id: string;
}

const statusUI: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  em_assinatura: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  ativo: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  vencendo: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  encerrado: "bg-muted text-muted-foreground",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
};

const installmentUI: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600",
  pago: "bg-emerald-500/15 text-emerald-600",
  atrasado: "bg-destructive/15 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export default function PortalContracts() {
  const { accesses } = useSponsorAccess();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [installments, setInstallments] = useState<Record<string, Installment[]>>({});
  const [loading, setLoading] = useState(true);

  const sponsorIds = useMemo(() => accesses.map((a) => a.sponsor_id), [accesses]);

  useEffect(() => {
    if (sponsorIds.length === 0) return;
    (async () => {
      setLoading(true);
      const { data: cs } = await supabase
        .from("contracts")
        .select("id,title,brand,contract_number,status,total_value,start_date,end_date,payment_method")
        .in("sponsor_id", sponsorIds)
        .order("created_at", { ascending: false });
      setContracts((cs ?? []) as Contract[]);

      if (cs && cs.length > 0) {
        const { data: ins } = await supabase
          .from("installments")
          .select("id,installment_number,amount,due_date,status,paid_at,contract_id")
          .in(
            "contract_id",
            cs.map((c) => c.id),
          )
          .order("installment_number");
        const grouped: Record<string, Installment[]> = {};
        (ins ?? []).forEach((i) => {
          (grouped[i.contract_id] ||= []).push(i as Installment);
        });
        setInstallments(grouped);
      }
      setLoading(false);
    })();
  }, [sponsorIds.join(",")]);

  const totals = useMemo(() => {
    const all = Object.values(installments).flat();
    return {
      total: contracts.reduce((s, c) => s + Number(c.total_value || 0), 0),
      paid: all.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.amount), 0),
      pending: all
        .filter((i) => i.status === "pendente" || i.status === "atrasado")
        .reduce((s, i) => s + Number(i.amount), 0),
    };
  }, [contracts, installments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Contratos
        </h1>
        <p className="text-sm text-muted-foreground">
          Visualize seus contratos ativos e cronograma financeiro.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Valor total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totals.total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Pago</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{fmt(totals.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">A pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totals.pending)}</div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      ) : contracts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum contrato disponível.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-3">
          {contracts.map((c) => (
            <AccordionItem key={c.id} value={c.id} className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between gap-3 w-full pr-3">
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{c.title}</span>
                      <Badge variant="outline" className={statusUI[c.status]}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.contract_number ? `#${c.contract_number} · ` : ""}
                      {c.brand}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{fmt(c.total_value)}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 space-y-3">
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground">Início</p>
                    <p>{c.start_date ? format(new Date(c.start_date), "dd/MM/yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fim</p>
                    <p>{c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pagamento</p>
                    <p>{c.payment_method}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-2 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> Parcelas
                  </p>
                  {(installments[c.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem parcelas geradas.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {installments[c.id].map((i) => (
                        <div
                          key={i.id}
                          className="flex items-center justify-between text-xs p-2 rounded border"
                        >
                          <span className="font-medium">
                            {i.installment_number}/{installments[c.id].length}
                          </span>
                          <span className="text-muted-foreground">
                            {format(new Date(i.due_date), "dd/MM/yyyy")}
                          </span>
                          <span className="font-semibold">{fmt(Number(i.amount))}</span>
                          <Badge variant="outline" className={installmentUI[i.status]}>
                            {i.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
