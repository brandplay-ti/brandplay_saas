import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CreditCard, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrentPlanCard } from "@/components/billing/CurrentPlanCard";
import { InvoicesTable } from "@/components/billing/InvoicesTable";
import { PlanCatalog } from "@/components/billing/PlanCatalog";
import {
  BillingActionError,
  useBillingInvoices,
  useBillingPlans,
  useBillingStatus,
  useManageBilling,
  type BillingAction,
} from "@/hooks/useBilling";
import { useOrganization } from "@/hooks/useOrganization";
import { canManageBilling } from "@/lib/billing";

const SUCESSO: Partial<Record<BillingAction, string>> = {
  change_plan: "Plano alterado.",
  cancel: "Cancelamento registrado.",
  resume: "A assinatura continua ativa.",
  sync: "Situação atualizada com o Stripe.",
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

  // Volta do Stripe. O webhook pode chegar depois do redirecionamento, então
  // quem contratou também pede a sincronização na hora.
  useEffect(() => {
    if (!retornoDoCheckout || !orgId) return;
    setSearchParams({}, { replace: true });
    if (retornoDoCheckout === "sucesso") {
      toast.success("Contratação recebida.", {
        description: "Cartão é confirmado na hora. Boleto, em até 1 dia útil depois de pago.",
      });
      if (podeGerenciar) mutate({ action: "sync" });
    } else if (retornoDoCheckout === "cancelado") {
      toast.info("Contratação interrompida. Nada foi cobrado.");
    }
  }, [retornoDoCheckout, orgId, podeGerenciar, mutate, setSearchParams]);

  const executar = (action: BillingAction, planId?: string) => {
    mutate(
      { action, planId },
      {
        onSuccess: (resultado) => {
          // Checkout e portal continuam no Stripe.
          if (resultado.url) {
            window.location.assign(resultado.url);
            return;
          }
          const mensagem = SUCESSO[action];
          if (mensagem) toast.success(mensagem);
        },
        onError: (erro) => {
          const codigo = erro instanceof BillingActionError ? erro.code : undefined;
          toast.error(erro.message, codigo === "cobranca_nao_configurada"
            ? { description: "As chaves do Stripe não estão configuradas neste ambiente." }
            : undefined);
        },
      },
    );
  };

  const acaoEmAndamento = gerenciar.isPending ? gerenciar.variables?.action ?? null : null;
  const planoEmAndamento =
    gerenciar.isPending && (acaoEmAndamento === "checkout" || acaoEmAndamento === "change_plan")
      ? gerenciar.variables?.planId ?? null
      : null;

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
                  O teste grátis acabou e a organização não tem assinatura.{" "}
                  {podeGerenciar
                    ? "Assine um plano abaixo para liberar o painel para toda a equipe."
                    : "Peça ao proprietário ou a um administrador para assinar um plano."}
                </AlertDescription>
              </Alert>
            )}

            <CurrentPlanCard
              status={status.data}
              canManage={podeGerenciar}
              pendingAction={acaoEmAndamento}
              onAction={(acao) => executar(acao)}
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
                  onSubscribe={(planId) => executar("checkout", planId)}
                  onChangePlan={(planId) => executar("change_plan", planId)}
                />
              )}
            </section>
          </TabsContent>

          {podeGerenciar && (
            <TabsContent value="cobrancas">
              <InvoicesTable invoices={faturas.data ?? []} loading={faturas.isLoading} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

export default Plan;
