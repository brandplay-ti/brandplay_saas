import { ExternalLink, FileDown, Loader2, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BillingInvoice } from "@/hooks/useBilling";
import {
  formatCents,
  formatDate,
  INVOICE_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_TONE_CLASS,
  type InvoiceStatus,
  type PaymentMethod,
  type StatusTone,
} from "@/lib/billing";

const TOM_DA_FATURA: Record<InvoiceStatus, StatusTone | null> = {
  rascunho: null,
  aberta: "warn",
  paga: "ok",
  nao_paga: "danger",
  cancelada: null,
};

interface Props {
  invoices: BillingInvoice[];
  loading: boolean;
}

export const InvoicesTable = ({ invoices, loading }: Props) => (
  <Card>
    <CardHeader>
      <CardTitle>Faturas</CardTitle>
      <CardDescription>
        Emitidas pelo Stripe a cada ciclo. Fatura em aberto de boleto pode ser paga pelo link até o vencimento.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando faturas" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <Receipt className="h-8 w-8" />
          Nenhuma fatura ainda. Elas aparecem aqui depois da primeira contratação.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fatura</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Documentos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((fatura) => {
              const status = fatura.status as InvoiceStatus;
              const tom = TOM_DA_FATURA[status];
              return (
                <TableRow key={fatura.id}>
                  <TableCell className="font-medium">{fatura.number ?? "—"}</TableCell>
                  <TableCell>{formatDate(fatura.created_at)}</TableCell>
                  <TableCell>{formatDate(fatura.due_at)}</TableCell>
                  <TableCell>{formatCents(fatura.amount_cents)}</TableCell>
                  <TableCell>
                    {fatura.payment_method ? PAYMENT_METHOD_LABEL[fatura.payment_method as PaymentMethod] : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={tom ? STATUS_TONE_CLASS[tom] : undefined}>
                      {INVOICE_STATUS_LABEL[status] ?? fatura.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {fatura.hosted_invoice_url && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={fatura.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink /> {status === "aberta" ? "Pagar" : "Ver"}
                          </a>
                        </Button>
                      )}
                      {fatura.invoice_pdf_url && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={fatura.invoice_pdf_url} target="_blank" rel="noopener noreferrer" aria-label="Baixar PDF da fatura">
                            <FileDown /> PDF
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);
