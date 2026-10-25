import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Clock, Loader2, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useBillingStatus } from "@/hooks/useBilling";
import { useOrganization } from "@/hooks/useOrganization";
import { BILLING_ROUTE, daysLeft, formatDateTime, type BillingStatus } from "@/lib/billing";

/**
 * Aplica no painel a regra de acesso que o banco calcula (`billing_status`).
 *
 * Sem acesso (teste vencido, sem assinatura e sem liberação provisória),
 * owner/admin vão para a tela de plano; os demais membros veem o aviso para
 * procurar quem administra. A fronteira é o banco (0026: os dados da
 * organização ficam inacessíveis aos membros); isto é a experiência — explicar
 * o bloqueio em vez de mostrar telas vazias.
 *
 * Se a consulta falhar, não bloqueia aqui: o banco continua barrando, e travar
 * a navegação por um erro transitório só pioraria a experiência.
 */
export const BillingGate = ({ children }: { children: ReactNode }) => {
  const { orgId, orgName, isAdmin, loading: orgLoading, organizations } = useOrganization();
  const location = useLocation();
  const { data: status, isLoading, isError } = useBillingStatus(orgId);

  if (orgLoading || (orgId && isLoading)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Verificando o plano" />
      </div>
    );
  }

  if (!orgId || isError || !status) return <>{children}</>;

  const naTelaDePlano = location.pathname.startsWith(BILLING_ROUTE);
  const emSuporte = organizations.some((o) => o.id === orgId && o.suporte);

  if (!status.access && !naTelaDePlano && !emSuporte) {
    if (isAdmin) return <Navigate to={BILLING_ROUTE} replace />;
    return <AccessSuspended orgName={orgName} />;
  }

  return (
    <>
      {/* Só para quem pode agir: para os demais membros seria ruído em toda tela. */}
      {isAdmin && !naTelaDePlano && <BillingNotice status={status} />}
      {children}
    </>
  );
};

const AccessSuspended = ({ orgName }: { orgName: string }) => (
  <div className="mx-auto max-w-lg py-16 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Lock className="h-6 w-6 text-muted-foreground" />
    </div>
    <h1 className="text-xl font-semibold">Acesso suspenso</h1>
    <p className="mt-2 text-sm text-muted-foreground">
      O teste grátis de <strong>{orgName || "esta organização"}</strong> acabou e ainda não há uma assinatura. Peça ao
      proprietário ou a um administrador da organização para assinar um plano.
    </p>
  </div>
);

/** Aviso no topo do painel: teste grátis acabando ou pagamento em atraso. */
const BillingNotice = ({ status }: { status: BillingStatus }) => {
  const sub = status.subscription;

  if (sub?.status === "inadimplente") {
    return (
      <Alert variant="destructive" className="mb-6">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Pagamento em atraso</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>A última cobrança não foi paga. Atualize o pagamento para não perder o acesso.</span>
          <Button asChild size="sm" variant="outline">
            <Link to={BILLING_ROUTE}>Ver plano e cobrança</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.source === "provisional" && status.provisional_access) {
    return (
      <Alert className="mb-6">
        <Clock className="h-4 w-4" />
        <AlertTitle>Acesso provisório até {formatDateTime(status.provisional_access.expires_at)}</AlertTitle>
        <AlertDescription>
          {sub?.status === "incompleta"
            ? "Liberado enquanto o boleto compensa. Quando o pagamento for confirmado, a assinatura fica ativa sozinha."
            : "Liberado pela equipe do Brandplay. Assine um plano para manter o acesso depois do prazo."}
        </AlertDescription>
      </Alert>
    );
  }

  const emTeste = status.source === "trial" && (!sub || sub.status === "incompleta");
  if (!emTeste) return null;

  const dias = daysLeft(status.trial_ends_at);
  const aguardando = sub?.status === "incompleta";

  return (
    <Alert className="mb-6">
      <Clock className="h-4 w-4" />
      <AlertTitle>
        Teste grátis do plano {status.plan?.name ?? "Pro"}: {dias} {dias === 1 ? "dia restante" : "dias restantes"}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {aguardando
            ? "Recebemos a contratação e estamos aguardando a compensação do pagamento."
            : "Assine antes do fim do teste para não interromper o acesso da equipe."}
        </span>
        {!aguardando && (
          <Button asChild size="sm" className="bg-gradient-brand hover:opacity-90">
            <Link to={BILLING_ROUTE}>Assinar agora</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
