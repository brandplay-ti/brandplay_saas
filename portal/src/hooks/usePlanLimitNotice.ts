import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useBillingPlans } from "@/hooks/useBilling";
import { useOrganization } from "@/hooks/useOrganization";
import { BILLING_ROUTE, parsePlanLimitError, planLimitMessage } from "@/lib/billing";

/**
 * Devolve uma função que, dado o erro de um cadastro, avisa quando ele foi
 * barrado pelo limite do plano (gatilhos da 0024) e devolve `true`. Para outro
 * erro qualquer devolve `false`, e quem chamou mostra a mensagem dele.
 */
export function usePlanLimitNotice() {
  const { data: planos } = useBillingPlans();
  const { isAdmin } = useOrganization();
  const navigate = useNavigate();

  return (erro: unknown): boolean => {
    const limite = parsePlanLimitError(erro);
    if (!limite) return false;

    const nomeSugerido = planos?.find((p) => p.id === limite.suggestedPlanId)?.name ?? null;
    toast.error("Limite do plano atingido", {
      description: planLimitMessage(limite, nomeSugerido),
      action: isAdmin ? { label: "Ver planos", onClick: () => navigate(BILLING_ROUTE) } : undefined,
    });
    return true;
  };
}
