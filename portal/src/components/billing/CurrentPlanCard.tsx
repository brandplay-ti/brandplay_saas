import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BillingAction } from "@/hooks/useBilling";
import {
  describeStatus,
  formatCents,
  formatDate,
  PAYMENT_METHOD_LABEL,
  STATUS_TONE_CLASS,
  usageLabel,
  usagePercent,
  type BillingStatus,
} from "@/lib/billing";

interface Props {
  status: BillingStatus;
  /** Nome do plano da assinatura em jogo — mostrado quando ela ainda não dá acesso. */
  contractedPlanName: string | null;
  canManage: boolean;
  pendingAction: BillingAction | null;
  onAction: (action: BillingAction) => void;
}

export const CurrentPlanCard = ({ status, contractedPlanName, canManage, pendingAction, onAction }: Props) => {
  const resumo = describeStatus(status);
  const plano = status.plan;
  const sub = status.subscription;
  const usuarios = status.usage.users_active + status.usage.invites_pending;
  const ocupado = pendingAction !== null;

  const podeCancelar =
    !!sub && !sub.cancel_at_period_end && ["ativa", "inadimplente", "incompleta"].includes(sub.status);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardDescription>Plano atual</CardDescription>
          <CardTitle className="text-2xl">{plano?.name ?? contractedPlanName ?? "Nenhum"}</CardTitle>
          {plano && (
            <p className="text-sm text-muted-foreground">
              {status.source === "trial"
                ? "Durante o teste grátis, sem cobrança."
                : `${formatCents(plano.price_cents)}${plano.price_cents != null ? "/mês" : ""}`}
            </p>
          )}
        </div>
        <Badge variant="outline" className={STATUS_TONE_CLASS[resumo.tone]}>
          {resumo.label}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {(resumo.detail || sub?.payment_method) && (
          <div className="space-y-1 text-sm text-muted-foreground">
            {resumo.detail && <p>{resumo.detail}</p>}
            {sub?.payment_method && <p>Forma de pagamento: {PAYMENT_METHOD_LABEL[sub.payment_method]}.</p>}
          </div>
        )}

        <div className="grid gap-6 sm:grid-cols-2">
          <UsageMeter
            label="Propriedades"
            uso={status.usage.properties}
            limite={plano?.max_properties ?? null}
            unidade="propriedades"
            semPlano={!plano}
            nota="Edições e temporadas de uma propriedade não contam."
          />
          <UsageMeter
            label="Usuários"
            uso={usuarios}
            limite={plano?.max_users ?? null}
            unidade="usuários"
            semPlano={!plano}
            nota={
              status.usage.invites_pending > 0
                ? `Inclui ${status.usage.invites_pending} convite(s) pendente(s): o convite reserva a vaga.`
                : "Membros ativos, contando o proprietário."
            }
          />
        </div>
      </CardContent>

      {canManage && (status.has_customer || sub) && (
        <CardFooter className="flex flex-wrap gap-2">
          {status.has_customer && (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onAction("sync")}>
              {pendingAction === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Verificar pagamento
            </Button>
          )}
          {status.has_customer && sub && (
            <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onAction("portal")}>
              {pendingAction === "portal" ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Gerenciar pagamento
            </Button>
          )}
          {sub?.cancel_at_period_end && (
            <Button size="sm" disabled={ocupado} onClick={() => onAction("resume")}>
              {pendingAction === "resume" && <Loader2 className="animate-spin" />}
              Manter assinatura
            </Button>
          )}
          {podeCancelar && sub && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={ocupado} className="text-destructive hover:text-destructive">
                  {pendingAction === "cancel" && <Loader2 className="animate-spin" />}
                  {sub.status === "incompleta" ? "Cancelar contratação" : "Cancelar assinatura"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {sub.status === "incompleta" ? "Cancelar a contratação em andamento?" : "Cancelar a assinatura?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {sub.status === "incompleta"
                      ? "A contratação aguarda o pagamento do boleto. Se você já pagou, não cancele: a compensação leva até 1 dia útil. Cancelando, você pode contratar de novo com outra forma de pagamento."
                      : `A assinatura não será renovada. O acesso continua até ${formatDate(sub.current_period_end)} e depois fica suspenso até uma nova assinatura.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => onAction("cancel")}
                  >
                    Confirmar cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardFooter>
      )}
    </Card>
  );
};

interface UsageMeterProps {
  label: string;
  uso: number;
  limite: number | null;
  unidade: string;
  semPlano: boolean;
  nota: string;
}

const UsageMeter = ({ label, uso, limite, unidade, semPlano, nota }: UsageMeterProps) => {
  const percentual = usagePercent(uso, limite);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{semPlano ? `${uso} ${unidade}` : usageLabel(uso, limite, unidade)}</span>
      </div>
      {percentual !== null && (
        <Progress
          value={percentual}
          aria-label={`${label}: ${usageLabel(uso, limite, unidade)}`}
          className={percentual >= 100 ? "[&>div]:bg-amber-500" : undefined}
        />
      )}
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
};
