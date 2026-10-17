import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CreditCard, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { InvoicesTable } from "@/components/billing/InvoicesTable";
import { PlanCatalog } from "@/components/billing/PlanCatalog";
import { ProvisionalAccessCard } from "@/components/billing/ProvisionalAccessCard";
import {
  BillingActionError,
  useBillingInvoices,
  useBillingPlans,
  useBillingStatus,
  useManageBilling,
  type BillingAction,
  type BillingActionInput,
} from "@/hooks/useBilling";
import { useOrganization } from "@/hooks/useOrganization";
import { canManageBilling, formatDateTime } from "@/lib/billing";

const SUCESSO: Partial<Record<BillingAction, string>> = {
  change_plan: "Plano alterado.",
  cancel: "Cancelamento registrado.",
  resume: "A assinatura continua ativa.",
  sync: "Situação atualizada com o Stripe.",
};

/** Explicação extra para erros que a manage-billing identifica por `code`. */
const DETALHE_DO_ERRO: Record<string, string> = {
  cobranca_nao_configurada: "As chaves do Stripe não estão configuradas neste ambiente.",
  pix_indisponivel: "Pague pelo link da fatura, com cartão ou boleto.",
};

const Plan = () => {
  const { orgId, orgName, role } = useOrganization();
  const podeGerenciar = canManageBilling(role);

  const status = useBillingStatus(orgId);
  const planos = useBillingPlans();
  const faturas = useBillingInvoices(orgId, podeGerenciar);
  const gerenciar = useManageBilling(orgId);
  const { mutate } = gerenciar;

  const [searchParams, setSearchParams] = useSearchParams();
  const retornoDoCheckout = searchParams.get("checkout");
  const retornoDoPix = searchParams.get("pix");

  // Volta do Stripe. O webhook pode chegar depois do redirecionamento, então
  // quem pagou também pede a sincronização na hora.
  useEffect(() => {
    if ((!retornoDoCheckout && !retornoDoPix) || !orgId) return;
    setSearchParams({}, { replace: true });
    if (retornoDoCheckout === "sucesso") {
      toast.success("Contratação recebida.", {
        description: "Cartão é confirmado na hora. Boleto, em até 1 dia útil depois de pago.",
      });
    } else if (retornoDoPix === "sucesso") {
      toast.success("Pagamento por Pix recebido.", {
        description: "A fatura é baixada assim que o Stripe confirmar o Pix.",
      });
    } else {
      toast.info("Pagamento interrompido. Nada foi cobrado.");
      return;
    }
    if (podeGerenciar) mutate({ action: "sync" });
  }, [retornoDoCheckout, retornoDoPix, orgId, podeGerenciar, mutate, setSearchParams]);

  const executar = (entrada: BillingActionInput) => {
    mutate(entrada, {
      onSuccess: (resultado) => {
        // Checkout, Pix e portal continuam no Stripe.
        if (resultado.url) {
          window.location.assign(resultado.url);
          return;
        }
        if (entrada.action === "request_provisional_access" && resultado.expires_at) {
          toast.success(`Acesso liberado até ${formatDateTime(resultado.expires_at)}.`, {
            description: "Quando o boleto compensar, a assinatura fica ativa sozinha.",
          });
          return;
        }
        const mensagem = SUCESSO[entrada.action];
        if (mensagem) toast.success(mensagem);
      },
      onError: (erro) => {
        const codigo = erro instanceof BillingActionError ? erro.code : undefined;
        const detalhe = codigo ? DETALHE_DO_ERRO[codigo] : undefined;
        toast.error(erro.message, detalhe ? { description: detalhe } : undefined);
      },
    });
  };

  const emAndamento = gerenciar.isPending ? gerenciar.variables ?? null : null;
  const acaoEmAndamento = emAndamento?.action ?? null;
  const planoEmAndamento =
    acaoEmAndamento === "checkout" || acaoEmAndamento === "change_plan" ? emAndamento?.planId ?? null : null;
  const faturaPixEmAndamento = acaoEmAndamento === "pay_pix" ? emAndamento?.invoiceId ?? null : null;

  // Boleto da contratação aguardando compensação, sem teste nem liberação.
  const podeLiberarProvisoriamente =
    podeGerenciar && status.data?.subscription?.status === "incompleta" && !status.data.access;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plano e cobrança</h1>
        <p className="text-muted-foreground mt-1">
          Plano, uso e faturas de <strong>{orgName || "sua organização"}</strong>.
        </p>
      </div>

      {status.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando plano" />
        </div>
      ) : status.isError || !status.data ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar o plano</AlertTitle>
          <AlertDescription>Tente recarregar a página em instantes.</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="plano" className="space-y-4">
          <TabsList>
            <TabsTrigger value="plano">
              <CreditCard className="h-4 w-4 mr-2" /> Plano
            </TabsTrigger>
            {podeGerenciar && (
              <TabsTrigger value="cobrancas">
                <Receipt className="h-4 w-4 mr-2" /> Cobranças
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="plano" className="space-y-6">
            {!status.data.access && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Acesso suspenso</AlertTitle>
                <AlertDescription>
                  {status.data.subscription?.status === "incompleta"
                    ? podeGerenciar
                      ? "A contratação aguarda a compensação do boleto. Se já pagou, libere o acesso provisoriamente abaixo."
                      : "A contratação aguarda a compensação do boleto."
                    : podeGerenciar
                      ? "O teste grátis acabou e a organização não tem assinatura. Assine um plano abaixo para liberar o painel para toda a equipe."
                      : "O teste grátis acabou e a organização não tem assinatura. Peça ao proprietário ou a um administrador para assinar um plano."}
                </AlertDescription>
              </Alert>
            )}

            {podeLiberarProvisoriamente && orgId && (
              <ProvisionalAccessCard
                orgId={orgId}
                hours={status.data.provisional_access_hours}
                pending={acaoEmAndamento === "request_provisional_access"}
                onRequest={(receiptPath) =>
                  executar({ action: "request_provisional_access", receiptPath, confirmPaid: true })
                }
              />
            )}

            <CurrentPlanCard
              status={status.data}
              contractedPlanName={
                planos.data?.find((p) => p.id === status.data.subscription?.plan_id)?.name ?? null
              }
              canManage={podeGerenciar}
              pendingAction={acaoEmAndamento}
              onAction={(acao) => executar({ action: acao })}
            />

            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Planos</h2>
                <p className="text-sm text-muted-foreground">
                  {podeGerenciar
                    ? "Pagamento por cartão ou boleto, pelo Stripe. O boleto vence em 3 dias e leva até 1 dia útil para compensar depois de pago."
                    : "Só o proprietário ou um administrador da organização contrata e altera o plano."}
                </p>
              </div>
              {planos.isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando planos" />
                </div>
              ) : (
                <PlanCatalog
                  plans={planos.data ?? []}
                  status={status.data}
                  canManage={podeGerenciar}
                  pendingPlanId={planoEmAndamento}
                  onSubscribe={(planId) => executar({ action: "checkout", planId })}
                  onChangePlan={(planId) => executar({ action: "change_plan", planId })}
                />
              )}
            </section>
          </TabsContent>

          {podeGerenciar && (
            <TabsContent value="cobrancas">
              <InvoicesTable
                invoices={faturas.data ?? []}
                loading={faturas.isLoading}
                pendingPixInvoiceId={faturaPixEmAndamento}
                onPayPix={(invoiceId) => executar({ action: "pay_pix", invoiceId })}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

export default Plan;
