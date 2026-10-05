import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Enums"]["opportunity_stage"];

export type OpportunityStageChecklistInput = {
  stage: Stage;
  sponsor_id: string | null;
  property_id: string | null;
  value: number | null;
  pendingActivities: number;
};

export const getOpportunityStageChecklistIssues = (
  opportunity: OpportunityStageChecklistInput,
  targetStage: Stage,
) => {
  if (opportunity.stage === "reuniao" && targetStage === "proposta_enviada") {
    return [
      !opportunity.sponsor_id ? "sponsor definido" : null,
      !Number.isFinite(Number(opportunity.value)) || Number(opportunity.value) <= 0 ? "valor preenchido" : null,
      !opportunity.property_id ? "propriedade selecionada" : null,
      opportunity.pendingActivities <= 0 ? "próxima atividade criada" : null,
    ].filter(Boolean) as string[];
  }

  return [];
};

export const formatOpportunityStageChecklistMessage = (issues: string[]) =>
  `Antes de avançar, complete: ${issues.join(", ")}.`;