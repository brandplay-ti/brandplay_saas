import { CheckCircle2, Loader2 } from "lucide-react";
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
import type { BillingPlan } from "@/hooks/useBilling";
import { formatCents, type BillingStatus } from "@/lib/billing";
import { cn } from "@/lib/utils";

interface Props {
  plans: BillingPlan[];
  status: BillingStatus;
  canManage: boolean;
  /** Plano cuja ação está em andamento. */
  pendingPlanId: string | null;
  onSubscribe: (planId: string) => void;
  onChangePlan: (planId: string) => void;
}

function limites(plano: BillingPlan): string {
  const propriedades =
    plano.max_properties == null ? "Propriedades ilimitadas" : `Até ${plano.max_properties} propriedades`;
  const usuarios =
    plano.max_users == null
      ? "usuários ilimitados"
      : `${plano.max_users} ${plano.max_users === 1 ? "usuário" : "usuários"}`;
  return `${propriedades} · ${usuarios}`;
}

export const PlanCatalog = ({ plans, status, canManage, pendingPlanId, onSubscribe, onChangePlan }: Props) => {
  const sub = status.subscription;
  const ocupado = pendingPlanId !== null;

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plano) => {
        const atual = !!sub && sub.plan_id === plano.id && sub.status !== "incompleta";
        const carregando = pendingPlanId === plano.id;

        return (
          <Card
            key={plano.id}
            className={cn("flex flex-col", plano.highlight && "border-primary shadow-glow")}
          >
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xl">{plano.name}</CardTitle>
                {atual ? (
                  <Badge variant="secondary">Plano atual</Badge>
                ) : (
                  plano.highlight && <Badge className="bg-gradient-brand text-primary-foreground">Mais popular</Badge>
                )}
              </div>
              <CardDescription>{plano.description}</CardDescription>
              <div className="flex flex-wrap items-baseline gap-1 pt-2">
                <span className={cn("font-bold", plano.price_cents == null ? "text-2xl" : "text-3xl")}>
                  {formatCents(plano.price_cents)}
                </span>
                {plano.price_cents != null && <span className="text-sm text-muted-foreground">/mês</span>}
              </div>
              <p className="text-xs text-muted-foreground">{limites(plano)}</p>
            </CardHeader>

            <CardContent className="flex-1">
              <ul className="space-y-2">
                {plano.features.map((recurso) => (
                  <li key={recurso} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{recurso}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            {canManage && (
              <CardFooter>
                <PlanButton
                  plano={plano}
                  status={status}
                  atual={atual}
                  carregando={carregando}
                  ocupado={ocupado}
                  onSubscribe={onSubscribe}
                  onChangePlan={onChangePlan}
                />
              </CardFooter>
            )}
          </Card>
        );
      })}
    </div>
  );
};

interface PlanButtonProps {
  plano: BillingPlan;
  status: BillingStatus;
  atual: boolean;
  carregando: boolean;
  ocupado: boolean;
  onSubscribe: (planId: string) => void;
  onChangePlan: (planId: string) => void;
}

const PlanButton = ({ plano, status, atual, carregando, ocupado, onSubscribe, onChangePlan }: PlanButtonProps) => {
  const sub = status.subscription;

  if (plano.price_cents == null) {
    return (
      <Button asChild variant="outline" className="w-full">
        {/* `<a>`, e não `Link`: a navegação completa faz o navegador rolar até a âncora. */}
        <a href="/#contato">Falar com vendas</a>
      </Button>
    );
  }

  if (atual) {
    return (
      <Button variant="outline" className="w-full" disabled>
        Plano atual
      </Button>
    );
  }

  if (!sub) {
    return (
      <Button
        className={cn("w-full", plano.highlight && "bg-gradient-brand hover:opacity-90")}
        variant={plano.highlight ? "default" : "outline"}
        disabled={ocupado}
        onClick={() => onSubscribe(plano.id)}
      >
        {carregando && <Loader2 className="animate-spin" />}
        Assinar {plano.name}
      </Button>
    );
  }

  if (sub.status !== "ativa") {
    return (
      <Button variant="outline" className="w-full" disabled>
        {sub.status === "incompleta" ? "Aguardando pagamento" : "Regularize o pagamento para trocar"}
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full" disabled={ocupado}>
          {carregando && <Loader2 className="animate-spin" />}
          Mudar para {plano.name}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mudar para o plano {plano.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A troca vale a partir de agora. A diferença proporcional ao período já pago entra na próxima fatura —
            como crédito, se o novo plano for mais barato. Novo valor: {formatCents(plano.price_cents)}/mês.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={() => onChangePlan(plano.id)}>Confirmar troca</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
