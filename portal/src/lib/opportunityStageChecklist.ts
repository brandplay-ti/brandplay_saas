import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

export type OpportunityStageChecklistInput = {
  stage: Stage;
  property_id: string | null;
  value: number | null;
  pendingActivities: number;
};

// O patrocinador não entra aqui (BP-11): na proposta ainda não se sabe se a
// marca vai virar patrocinadora. Ele só é exigido ao gerar o contrato.
export const getOpportunityStageChecklistIssues = (
  opportunity: OpportunityStageChecklistInput,
  targetStage: Stage,
) => {
  if (opportunity.stage === "reuniao" && targetStage === "proposta_enviada") {
    return [
      !Number.isFinite(Number(opportunity.value)) || Number(opportunity.value) <= 0 ? "valor preenchido" : null,
      !opportunity.property_id ? "projeto selecionado" : null,
      opportunity.pendingActivities <= 0 ? "próxima atividade criada" : null,
    ].filter(Boolean) as string[];
  }

  return [];
};

export const formatOpportunityStageChecklistMessage = (issues: string[]) =>
  `Antes de avançar, complete: ${issues.join(", ")}.`;
