import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingPlans, useBillingSettings, type BillingPlan } from "@/hooks/useBilling";
import { formatCents } from "@/lib/billing";

/**
 * Planos da página pública, lidos do catálogo (`billing_plans`) — a mesma
 * fonte do checkout. Preço escrito no código divergia do cobrado assim que
 * alguém mudasse o plano por migration.
 */
export const PublicPricing = () => {
  const planos = useBillingPlans();
  const parametros = useBillingSettings();

  if (planos.isLoading) {
    return (
      <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[420px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (planos.isError || !planos.data?.length) {
    return (
      <p className="text-center text-muted-foreground">
        Não foi possível carregar os planos agora.{" "}
        <a href="#contato" className="font-semibold text-primary hover:underline">
          Fale com a gente
        </a>
        .
      </p>
    );
  }

  const textoDoTeste = (plano: BillingPlan) => {
    const dias = parametros.data?.trial_days;
    return plano.id === parametros.data?.trial_plan_id && dias ? `Teste ${dias} dias grátis` : "Começar grátis";
  };

  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {planos.data.map((p) => (
        <div
          key={p.id}
          className={`p-8 rounded-2xl border bg-card transition-all ${p.highlight ? "border-primary shadow-glow scale-[1.02]" : "border-border hover:border-primary/30"}`}
        >
          {p.highlight && (
            <div className="inline-block mb-3 rounded-full bg-gradient-brand px-3 py-1 text-xs font-semibold text-primary-foreground">
              Mais popular
            </div>
          )}
          <h3 className="font-semibold text-xl">{p.name}</h3>
          <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-bold">{formatCents(p.price_cents, true)}</span>
            {p.price_cents != null && <span className="text-muted-foreground text-sm">/mês</span>}
          </div>
          <Button
            asChild
            className={`w-full mt-6 ${p.highlight ? "bg-gradient-brand hover:opacity-90" : ""}`}
            variant={p.highlight ? "default" : "outline"}
          >
            {p.price_cents == null ? (
              <a href="#contato">Falar com vendas</a>
            ) : (
              <Link to="/auth?mode=signup">{textoDoTeste(p)}</Link>
            )}
          </Button>
          <ul className="mt-8 space-y-3">
            {p.features.map((recurso) => (
              <li key={recurso} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{recurso}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
